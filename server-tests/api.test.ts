import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { buildApp } from "../server/app";
const db = process.env.TEST_DATABASE_URL;
const suite = db ? describe : describe.skip;
suite("Playne database and OAuth integration", () => {
  let pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const origin = "https://test.playne.invalid";
  const jar = (r: any) =>
    r.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  const merge = (a: string, b: string) => {
    const m = new Map<string, string>();
    for (const entry of (a + "; " + b).split("; ")) {
      const [k, ...v] = entry.split("=");
      if (k) m.set(k, v.join("="));
    }
    return [...m].map(([k, v]) => k + "=" + v).join("; ");
  };
  let metadataLocation = { lat: 0, lng: 0 };
  let guest = "",
    logged = "",
    id = "";
  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test")
      throw new Error("Tests require the isolated playne_test database");
    pool = new Pool({ connectionString: db, max: 10 });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    await pool.query(
      "TRUNCATE playne_users,playne_identities,playne_auth_sessions,playne_oauth_states,playne_games CASCADE",
    );
    const remote = (async (url: any, options: any) => {
      if (String(url).includes("/token")) {
        expect(options.body.get("code_verifier")).toHaveLength(43);
        return new Response(JSON.stringify({ access_token: "test-token" }));
      }
      if (String(url).includes("login.yandex.ru"))
        return new Response(
          JSON.stringify({
            id: "test-yandex-subject",
            client_id: "test-client",
            first_name: "Иван",
            last_name: "Тестовый",
          }),
        );
      return new Response(
        JSON.stringify({ status: "OK", location: metadataLocation }),
      );
    }) as typeof fetch;
    app = await buildApp(
      pool,
      {
        origin,
        yandexId: "test-client",
        yandexSecret: "test-secret",
        redirect: origin + "/api/auth/yandex/callback",
        secure: true,
        revision: "test",
        googleKey: "test-google",
      },
      remote,
    );
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });
  it("issues a guest session and blocks cross-origin mutations", async () => {
    const me = await app.inject("/api/me");
    guest = jar(me);
    expect(me.json().user).toBeNull();
    expect(me.cookies[0].httpOnly).toBe(true);
    expect(me.cookies[0].secure).toBe(true);
    const no = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { origin: "https://evil.test", cookie: guest },
      payload: { game: "colorfle" },
    });
    expect(no.statusCode).toBe(403);
  });
  it("creates a server challenge and commits answers once in sequence", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { origin, cookie: guest },
      payload: { game: "colorfle" },
    });
    expect(start.statusCode).toBe(200);
    const run = start.json();
    id = run.id;
    const wrong = await app.inject({
      method: "POST",
      url: `/api/games/${id}/answers`,
      headers: { origin, cookie: guest },
      payload: { index: 2, answer: { choice: run.challenge.targets[2] } },
    });
    expect(wrong.statusCode).toBe(409);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: "POST",
        url: `/api/games/${id}/answers`,
        headers: { origin, cookie: guest },
        payload: {
          index: i,
          answer: { choice: run.challenge.targets[i], score: -500 },
        },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().answer.score).toBe(100);
    }
    const retry = await app.inject({
      method: "POST",
      url: `/api/games/${id}/answers`,
      headers: { origin, cookie: guest },
      payload: { index: 0, answer: { choice: { h: 0, s: 0, v: 0 } } },
    });
    expect(retry.json().score).toBe(500);
    const other = await app.inject(`/api/games/${id}`);
    expect(other.statusCode).toBe(404);
    const before = await app.inject({
      method: "POST",
      url: `/api/games/${id}/publish`,
      headers: { origin, cookie: guest },
      payload: {},
    });
    expect(before.statusCode).toBe(401);
  });
  it("checks OAuth state, retains the guest game after login and stores only hashed sessions", async () => {
    const start = await app.inject({
      url:
        "/api/auth/yandex/start?return=" +
        encodeURIComponent("/account/?claim=" + id),
      headers: { cookie: guest },
    });
    expect(start.statusCode).toBe(302);
    const authUrl = new URL(start.headers.location!);
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authUrl.searchParams.get("state")!;
    const stolen = await app.inject(
      "/api/auth/yandex/callback?state=" + state + "&code=test",
    );
    expect(stolen.headers.location).toContain("expired");
    const callback = await app.inject({
      url: "/api/auth/yandex/callback?state=" + state + "&code=test",
      headers: { cookie: guest },
    });
    expect(callback.headers.location).toBe(
      "/account/?claim=" + id + "&auth=success",
    );
    logged = merge(guest, jar(callback));
    const me = await app.inject({
      url: "/api/me",
      headers: { cookie: logged },
    });
    expect(me.json().user.nickname).toBe("Тестовый Иван");
    const stored = await pool.query(
      "SELECT token_hash FROM playne_auth_sessions",
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).toHaveLength(64);
    expect(logged).not.toContain(stored.rows[0].token_hash);
    const replay = await app.inject({
      url: "/api/auth/yandex/callback?state=" + state + "&code=test",
      headers: { cookie: guest },
    });
    expect(replay.headers.location).toContain("expired");
  });
  it("publishes with the default nickname without confirmation, retries idempotently and reflects nickname changes", async () => {
    const no = await app.inject({
      method: "POST",
      url: `/api/games/${id}/publish`,
      headers: { origin, cookie: logged },
      payload: {},
    });
    expect(no.statusCode).toBe(200);
    const defaultRank = await app.inject({
      url: "/api/leaderboard?game=colorfle&period=week",
      headers: { cookie: logged },
    });
    expect(defaultRank.json().entries[0].nickname).toBe("Тестовый Иван");
    const profile = await app.inject({
      url: "/api/me",
      headers: { cookie: logged },
    });
    expect(profile.json().user.nickname_confirmed).toBe(false);
    const nick = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { origin, cookie: logged },
      payload: { nickname: "Игрок & тест" },
    });
    expect(nick.statusCode).toBe(200);
    for (let i = 0; i < 2; i++) {
      const r = await app.inject({
        method: "POST",
        url: `/api/games/${id}/publish`,
        headers: { origin, cookie: logged },
        payload: {},
      });
      expect(r.statusCode).toBe(200);
    }
    const rank = await app.inject({
      url: "/api/leaderboard?game=colorfle&period=week",
      headers: { cookie: logged },
    });
    expect(rank.json().total).toBe(1);
    expect(rank.json().mine.score).toBe(500);
    expect(rank.json().entries[0].nickname).toBe("Игрок & тест");
    expect(rank.json().entries[0].isMe).toBe(true);
    await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { origin, cookie: logged },
      payload: { nickname: "Новый ник" },
    });
    const updated = await app.inject(
      "/api/leaderboard?game=colorfle&period=all",
    );
    expect(updated.json().entries[0].nickname).toBe("Новый ник");
    expect(updated.json().entries[0]).not.toHaveProperty("id");
  });
  it("rejects incomplete publication and does not mix games", async () => {
    const run = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { origin, cookie: logged },
      payload: { game: "naglaz" },
    });
    const incomplete = await app.inject({
      method: "POST",
      url: `/api/games/${run.json().id}/publish`,
      headers: { origin, cookie: logged },
      payload: {},
    });
    expect(incomplete.statusCode).toBe(409);
    const rank = await app.inject("/api/leaderboard?game=naglaz");
    expect(rank.json().total).toBe(0);
    const history = await app.inject({
      url: "/api/account",
      headers: { cookie: logged },
    });
    expect(history.json().history).toHaveLength(1);
  });
  it("replaces unavailable geo locations, locks a verified panorama and strips coordinates after publication", async () => {
    const headers = { origin, cookie: logged };
    const start = await app.inject({
      method: "POST",
      url: "/api/games",
      headers,
      payload: { game: "geo", geoRulesVersion: 2 },
    });
    const run = start.json();
    const old = run.challenge.places[0];
    const replace = await app.inject({
      method: "POST",
      url: `/api/games/${run.id}/replace`,
      headers,
      payload: { index: 0 },
    });
    expect(replace.statusCode).toBe(200);
    expect(replace.json().place.id).not.toBe(old.id);
    const places = [replace.json().place, ...run.challenge.places.slice(1)];
    const missing = await app.inject({
      method: "POST",
      url: `/api/games/${run.id}/answers`,
      headers,
      payload: { index: 0, answer: { guess: old } },
    });
    expect(missing.statusCode).toBe(400);
    for (let index = 0; index < 5; index++) {
      metadataLocation = { lat: places[index].lat, lng: places[index].lng };
      const panorama = await app.inject({
        method: "POST",
        url: `/api/games/${run.id}/panorama`,
        headers,
        payload: { index, pano: "verified-" + index },
      });
      expect(panorama.statusCode).toBe(200);
      const change = await app.inject({
        method: "POST",
        url: `/api/games/${run.id}/panorama`,
        headers,
        payload: { index, pano: "other-" + index },
      });
      expect(change.statusCode).toBe(409);
      const move = await app.inject({
        method: "POST",
        url: `/api/games/${run.id}/replace`,
        headers,
        payload: { index },
      });
      expect(move.statusCode).toBe(409);
      const answer = await app.inject({
        method: "POST",
        url: `/api/games/${run.id}/answers`,
        headers,
        payload: {
          index,
          answer: {
            guess: { lat: 0, lng: 0 },
            actual: { lat: 0, lng: 0 },
            score: 100,
          },
        },
      });
      expect(answer.statusCode).toBe(200);
      expect(answer.json().answer.score).toBeLessThan(5000);
    }
    const published = await app.inject({
      method: "POST",
      url: `/api/games/${run.id}/publish`,
      headers,
      payload: {},
    });
    expect(published.statusCode).toBe(200);
    const stored = (
      await pool.query(
        "SELECT answers,challenge FROM playne_games WHERE id=$1",
        [run.id],
      )
    ).rows[0];
    expect(stored.challenge).not.toHaveProperty("panoramas");
    expect(stored.answers[0]).not.toHaveProperty("actual");
    expect(stored.answers[0]).not.toHaveProperty("guess");
  });
  it("stores a 25,000-point classic game while retaining old 500-point games separately", async () => {
    const headers = { origin, cookie: logged };
    for (const version of [2, 1]) {
      const start = await app.inject({
        method: "POST",
        url: "/api/games",
        headers,
        payload: {
          game: "geo",
          ...(version === 2 ? { geoRulesVersion: 2 } : {}),
        },
      });
      const run = start.json();
      expect(run.version).toBe(version);
      for (let index = 0; index < 5; index++) {
        metadataLocation = {
          lat: run.challenge.places[index].lat,
          lng: run.challenge.places[index].lng,
        };
        const pano = await app.inject({
          remoteAddress: "127.0.0.2",
          method: "POST",
          url: `/api/games/${run.id}/panorama`,
          headers,
          payload: { index, pano: `perfect-${version}-${index}` },
        });
        expect(pano.statusCode).toBe(200);
        const answer = await app.inject({
          method: "POST",
          url: `/api/games/${run.id}/answers`,
          headers,
          payload: { index, answer: { guess: metadataLocation } },
        });
        expect(answer.statusCode).toBe(200);
        expect(answer.json().answer.score).toBe(version === 2 ? 5000 : 100);
        if (index === 4)
          expect(answer.json().score).toBe(version === 2 ? 25000 : 500);
      }
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/games/${run.id}/publish`,
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
    }
    expect(
      (await app.inject("/api/leaderboard?game=geo&version=2")).json()
        .entries[0].score,
    ).toBe(25000);
    expect(
      (await app.inject("/api/leaderboard?game=geo")).json().entries[0].score,
    ).toBe(500);
    const profile = await app.inject({
      url: "/api/account",
      headers: { ...headers, "x-playne-geo-version": "2" },
    });
    expect(profile.json().best.find((b: any) => b.game === "geo").score).toBe(
      25000,
    );
    expect(
      profile
        .json()
        .history.some(
          (h: any) => h.game === "geo" && h.version === 1 && h.score === 500,
        ),
    ).toBe(true);
  });
  it("enforces an immutable three-minute timer and separates timed/classic rankings", async () => {
    const headers = { origin, cookie: logged };
    const bad = await app.inject({
      method: "POST",
      url: "/api/games",
      headers,
      payload: { game: "geo", mode: "unknown", geoRulesVersion: 2 },
    });
    expect(bad.statusCode).toBe(400);
    const start = await app.inject({
      method: "POST",
      url: "/api/games",
      headers,
      payload: { game: "geo", mode: "timed", geoRulesVersion: 2 },
    });
    const run = start.json();
    expect(run.version).toBe(2);
    const clock = vi.spyOn(Date, "now");
    let now = Date.now();
    clock.mockImplementation(() => now);
    try {
      for (let index = 0; index < 5; index++) {
        metadataLocation = {
          lat: run.challenge.places[index].lat,
          lng: run.challenge.places[index].lng,
        };
        const pano = await app.inject({
          method: "POST",
          url: `/api/games/${run.id}/panorama`,
          headers,
          payload: { index, pano: "timed-" + index },
        });
        expect(pano.statusCode).toBe(200);
        const ready = await app.inject({
          method: "POST",
          url: `/api/games/${run.id}/ready`,
          headers,
          payload: { index },
        });
        expect(ready.statusCode).toBe(200);
        expect(ready.json().deadline - now).toBe(180000);
        const second = await app.inject({
          method: "POST",
          url: `/api/games/${run.id}/ready`,
          headers,
          payload: { index },
        });
        expect(second.json().deadline).toBe(ready.json().deadline);
        if (index === 0) {
          const pin = await app.inject({
            method: "POST",
            url: `/api/games/${run.id}/pin`,
            headers,
            payload: { index, guess: metadataLocation },
          });
          expect(pin.statusCode).toBe(200);
          const early = await app.inject({
            method: "POST",
            url: `/api/games/${run.id}/answers`,
            headers,
            payload: { index, answer: { expired: true } },
          });
          expect(early.statusCode).toBe(400);
        }
        now = ready.json().deadline + 1;
        const late = await app.inject({
          method: "POST",
          url: `/api/games/${run.id}/pin`,
          headers,
          payload: { index, guess: { lat: 0, lng: 0 } },
        });
        expect(late.statusCode).toBe(409);
        const answer = await app.inject({
          method: "POST",
          url: `/api/games/${run.id}/answers`,
          headers,
          payload: {
            index,
            answer: { expired: true, guess: { lat: 0, lng: 0 } },
          },
        });
        expect(answer.statusCode).toBe(200);
        expect(answer.json().answer.score).toBe(index === 0 ? 5000 : 0);
        expect(answer.json().answer.timedOut).toBe(true);
      }
      const published = await app.inject({
        method: "POST",
        url: `/api/games/${run.id}/publish`,
        headers,
        payload: {},
      });
      expect(published.statusCode).toBe(200);
      const timed = await app.inject(
        "/api/leaderboard?game=geo&mode=timed&version=2",
      );
      expect(timed.json().total).toBe(1);
      expect(timed.json().entries[0].score).toBe(5000);
      const classic = await app.inject(
        "/api/leaderboard?game=geo&mode=classic&version=2",
      );
      expect(classic.json().total).toBe(1);
      expect(classic.json().entries[0].score).not.toBe(5000);
    } finally {
      clock.mockRestore();
    }
  });
  it("revokes the authenticated session on logout", async () => {
    const out = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin, cookie: logged },
      payload: {},
    });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({
      url: "/api/me",
      headers: { cookie: logged },
    });
    expect(me.json().user).toBeNull();
    const count = await pool.query(
      "SELECT count(*)::int AS n FROM playne_auth_sessions",
    );
    expect(count.rows[0].n).toBe(0);
  });
  it("retains a changed nickname on the next Yandex login and deletes only the test account with its records", async () => {
    const start = await app.inject({
      url: "/api/auth/yandex/start",
      headers: { cookie: guest },
    });
    const state = new URL(start.headers.location!).searchParams.get("state");
    const callback = await app.inject({
      url: "/api/auth/yandex/callback?state=" + state + "&code=test",
      headers: { cookie: guest },
    });
    const again = merge(guest, jar(callback));
    const me = await app.inject({ url: "/api/me", headers: { cookie: again } });
    expect(me.json().user.nickname).toBe("Новый ник");
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM playne_users")).rows[0]
        .n,
    ).toBe(1);
    const reject = await app.inject({
      method: "POST",
      url: "/api/account/delete",
      headers: { origin, cookie: again },
      payload: {},
    });
    expect(reject.statusCode).toBe(400);
    const remove = await app.inject({
      method: "POST",
      url: "/api/account/delete",
      headers: { origin, cookie: again },
      payload: { confirmation: "delete" },
    });
    expect(remove.statusCode).toBe(200);
    for (const table of [
      "playne_users",
      "playne_identities",
      "playne_auth_sessions",
    ])
      expect(
        (await pool.query("SELECT count(*)::int AS n FROM " + table)).rows[0].n,
      ).toBe(0);
    expect(
      (await app.inject("/api/leaderboard?game=colorfle")).json().total,
    ).toBe(0);
    expect(
      (await app.inject("/api/leaderboard?game=geo&version=2")).json().total,
    ).toBe(0);
  });
});
