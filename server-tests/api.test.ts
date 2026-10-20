import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { pairs, objects } from "../src/data";
import { buildApp } from "../server/app";
import { migrateShadeScores } from "../server/shade-migration";
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
      payload: { game: "geo", geoRulesVersion: 4 },
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
      expect(answer.json().answer.score).toBeLessThan(100);
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
  it("stores whole-point games and projects old records while supporting older clients", async () => {
    const headers = { origin, cookie: logged };
    for (const version of [4, 3, 2, 1]) {
      const start = await app.inject({
        method: "POST",
        url: "/api/games",
        headers,
        payload: {
          game: "geo",
          ...(version > 1 ? { geoRulesVersion: version } : {}),
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
      headers: { ...headers, "x-playne-geo-version": "4" },
    });
    expect(profile.json().best.find((b: any) => b.game === "geo").score).toBe(
      500,
    );
    expect(
      profile
        .json()
        .history.filter((h: any) => h.game === "geo" && h.version !== 1)
        .every((h: any) => h.version === 4 && Number.isInteger(h.score)),
    ).toBe(true);
    expect(
      profile
        .json()
        .history.some(
          (h: any) => h.game === "geo" && h.version === 1 && h.score === 500,
        ),
    ).toBe(true);
  });
  it("ranks converted old records alongside new decimal scores, keeps equal ranks and preserves the raw records", async () => {
    const people = (
      await pool.query(
        "INSERT INTO playne_users(nickname) VALUES('Old scale'),('New scale') RETURNING id,nickname",
      )
    ).rows;
    const oldRounds = [3033, 1839, 5000, 4999, 0].map((score) => ({ score }));
    const newRounds = [60.7, 36.8, 100, 99.9, 0].map((score) => ({ score }));
    try {
      for (const [owner, version, answers, units] of [
        [people[0].id, 2, oldRounds, 148710],
        [
          people[0].id,
          3,
          [
            { score: 100 },
            { score: 100 },
            { score: 90 },
            { score: 0 },
            { score: 0 },
          ],
          2900,
        ],
        [people[1].id, 3, newRounds, 2974],
      ] as const) {
        await pool.query(
          "INSERT INTO playne_games(browser_hash,owner_id,game,version,challenge,answers,score_units,completed_at,published_at) VALUES($1,$2,'geo',$3,'{}',$4,$5,now(),now())",
          ["0".repeat(64), owner, version, JSON.stringify(answers), units],
        );
      }
      const rank = (
        await app.inject("/api/leaderboard?game=geo&version=3")
      ).json();
      const old = rank.entries.find((r: any) => r.nickname === "Old scale");
      const current = rank.entries.find((r: any) => r.nickname === "New scale");
      expect(old.score).toBe(297.4);
      expect(old.rounds).toEqual([60.7, 36.8, 100, 99.9, 0]);
      expect(old.place).toBe(current.place);
      const whole = (
        await app.inject("/api/leaderboard?game=geo&version=4")
      ).json();
      const oldWhole = whole.entries.find(
        (r: any) => r.nickname === "Old scale",
      );
      const decimalWhole = whole.entries.find(
        (r: any) => r.nickname === "New scale",
      );
      expect(oldWhole.score).toBe(297);
      expect(oldWhole.rounds).toEqual([61, 37, 100, 99, 0]);
      expect(oldWhole.rounds.reduce((a: number, b: number) => a + b, 0)).toBe(
        oldWhole.score,
      );
      expect(decimalWhole.score).toBe(297);
      expect(oldWhole.place).toBe(decimalWhole.place);
      expect(current.score).toBe(297.4);
      const legacy = (
        await app.inject("/api/leaderboard?game=geo&version=2")
      ).json();
      expect(
        legacy.entries.find((r: any) => r.nickname === "Old scale").score,
      ).toBe(14871);
      const raw = (
        await pool.query(
          "SELECT score_units,answers FROM playne_games WHERE owner_id=$1 AND version=2",
          [people[0].id],
        )
      ).rows[0];
      expect(raw.score_units).toBe(148710);
      expect(raw.answers).toEqual(oldRounds);
    } finally {
      await pool.query("DELETE FROM playne_users WHERE id=ANY($1::uuid[])", [
        people.map((p) => p.id),
      ]);
    }
  });
  it("enforces an immutable three-minute timer and separates timed/classic rankings", async () => {
    const headers = { origin, cookie: logged };
    const bad = await app.inject({
      method: "POST",
      url: "/api/games",
      headers,
      payload: { game: "geo", mode: "unknown", geoRulesVersion: 4 },
    });
    expect(bad.statusCode).toBe(400);
    const start = await app.inject({
      method: "POST",
      url: "/api/games",
      headers,
      payload: { game: "geo", mode: "timed", geoRulesVersion: 4 },
    });
    const run = start.json();
    expect(run.version).toBe(4);
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
        expect(answer.json().answer.score).toBe(index === 0 ? 100 : 0);
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
        "/api/leaderboard?game=geo&mode=timed&version=4",
      );
      expect(timed.json().total).toBe(1);
      expect(timed.json().entries[0].score).toBe(100);
      const classic = await app.inject(
        "/api/leaderboard?game=geo&mode=classic&version=4",
      );
      expect(classic.json().total).toBe(1);
      expect(classic.json().entries[0].score).not.toBe(100);
    } finally {
      clock.mockRestore();
    }
  });
  it("keeps the original location in both moving modes and separates all four rankings", async () => {
    const headers = { origin, cookie: logged };
    for (const [movingMode, timed] of [
      ["moving", false],
      ["moving-timed", true],
    ] as const) {
      const call = (request: any) =>
        app.inject({
          remoteAddress: timed ? "127.0.0.4" : "127.0.0.3",
          headers,
          ...request,
        });
      const bad = await call({
        method: "POST",
        url: "/api/games",
        payload: { game: "geo", mode: movingMode, geoRulesVersion: 3 },
      });
      expect(bad.statusCode).toBe(400);
      const start = await call({
        method: "POST",
        url: "/api/games",
        payload: { game: "geo", mode: movingMode, geoRulesVersion: 4 },
      });
      expect(start.statusCode).toBe(200);
      const run = start.json();
      expect(run.challenge.mode).toBe(movingMode);
      for (let index = 0; index < 5; index++) {
        const actual = {
          lat: run.challenge.places[index].lat,
          lng: run.challenge.places[index].lng,
        };
        const displaced = { lat: actual.lat + 1, lng: actual.lng };
        metadataLocation = actual;
        expect(
          (
            await call({
              method: "POST",
              url: `/api/games/${run.id}/panorama`,
              payload: { index, pano: `moving-start-${index}` },
            })
          ).statusCode,
        ).toBe(200);
        if (index === 0) {
          metadataLocation = displaced;
          const replace = await call({
            method: "POST",
            url: `/api/games/${run.id}/panorama`,
            payload: { index, pano: "moved-panorama" },
          });
          expect(replace.statusCode).toBe(409);
          const original = await call({
            method: "POST",
            url: `/api/games/${run.id}/panorama`,
            payload: { index, pano: `moving-start-${index}` },
          });
          expect(original.json().actual).toEqual(actual);
        }
        const ready = await call({
          method: "POST",
          url: `/api/games/${run.id}/ready`,
          payload: { index },
        });
        expect(ready.statusCode).toBe(timed ? 200 : 409);
        if (timed) {
          const repeated = await call({
            method: "POST",
            url: `/api/games/${run.id}/ready`,
            payload: { index },
          });
          expect(repeated.json().deadline).toBe(ready.json().deadline);
          if (index === 0) {
            expect(
              (
                await call({
                  method: "POST",
                  url: `/api/games/${run.id}/answers`,
                  payload: {
                    index,
                    answer: { expired: true, mode: "classic" },
                  },
                })
              ).statusCode,
            ).toBe(400);
            expect(
              (
                await call({
                  method: "POST",
                  url: `/api/games/${run.id}/pin`,
                  payload: { index, guess: displaced },
                })
              ).statusCode,
            ).toBe(200);
          }
          const record = (
            await pool.query("SELECT challenge FROM playne_games WHERE id=$1", [
              run.id,
            ])
          ).rows[0];
          record.challenge.panoramas[index].deadline = Date.now() - 1000;
          await pool.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
            JSON.stringify(record.challenge),
            run.id,
          ]);
          expect(
            (
              await call({
                method: "POST",
                url: `/api/games/${run.id}/pin`,
                payload: { index, guess: actual },
              })
            ).statusCode,
          ).toBe(409);
        }
        const guess = index === 0 ? displaced : actual;
        const answer = await call({
          method: "POST",
          url: `/api/games/${run.id}/answers`,
          payload: {
            index,
            answer: { guess, actual: guess, score: 100, expired: timed },
          },
        });
        expect(answer.statusCode).toBe(200);
        expect(answer.json().answer.actual).toEqual(actual);
        expect(answer.json().answer.score).toBe(
          index === 0 ? 95 : timed ? 0 : 100,
        );
        if (timed) expect(answer.json().answer.timedOut).toBe(true);
      }
      expect(
        (
          await call({
            method: "POST",
            url: `/api/games/${run.id}/publish`,
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      const stored = (
        await pool.query(
          "SELECT challenge,answers,mode FROM playne_games WHERE id=$1",
          [run.id],
        )
      ).rows[0];
      expect(stored.mode).toBe(movingMode);
      expect(stored.challenge).not.toHaveProperty("panoramas");
      expect(stored.answers[0]).not.toHaveProperty("actual");
    }
    for (const [mode, score] of [
      ["classic", 500],
      ["timed", 100],
      ["moving", 495],
      ["moving-timed", 95],
    ] as const) {
      const ranking = (
        await app.inject(`/api/leaderboard?game=geo&mode=${mode}&version=4`)
      ).json();
      expect(ranking.mode).toBe(mode);
      expect(ranking.entries[0].score).toBe(score);
    }
    const profile = (
      await app.inject({
        url: "/api/account",
        headers: { ...headers, "x-playne-geo-version": "4" },
      })
    ).json();
    expect(
      profile.best
        .filter((b: any) => b.game === "geo")
        .map((b: any) => b.mode)
        .sort(),
    ).toEqual(["classic", "moving", "moving-timed", "timed"]);
  });
  it("checks landmark cameras, keeps replacements in the collection and isolates both new rankings", async () => {
    const headers = { origin, cookie: logged };
    for (const [mode, timed] of [
      ["landmarks", false],
      ["landmarks-timed", true],
    ] as const) {
      const call = (request: any) =>
        app.inject({
          remoteAddress: timed ? "127.0.0.6" : "127.0.0.5",
          headers,
          ...request,
        });
      expect(
        (
          await call({
            method: "POST",
            url: "/api/games",
            payload: { game: "geo", mode, geoRulesVersion: 3 },
          })
        ).statusCode,
      ).toBe(400);
      const start = await call({
        method: "POST",
        url: "/api/games",
        payload: { game: "geo", mode, geoRulesVersion: 4 },
      });
      expect(start.statusCode).toBe(200);
      const run = start.json();
      expect(run.challenge.mode).toBe(mode);
      expect(
        run.challenge.places.every((p: any) => p.id.startsWith("lm-")),
      ).toBe(true);
      const oldPlace = run.challenge.places[0];
      const replacement = await call({
        method: "POST",
        url: `/api/games/${run.id}/replace`,
        payload: { index: 0 },
      });
      expect(replacement.statusCode).toBe(200);
      run.challenge.places[0] = replacement.json().place;
      expect(run.challenge.places[0].id).not.toBe(oldPlace.id);
      expect(run.challenge.places[0].id.startsWith("lm-")).toBe(true);
      expect(run.challenge.places[0].region).toBe(oldPlace.region);
      for (let index = 0; index < 5; index++) {
        const place = run.challenge.places[index];
        const object = { lat: place.lat, lng: place.lng };
        metadataLocation = { ...place.view, lat: place.view.lat + 0.01 };
        expect(
          (
            await call({
              method: "POST",
              url: `/api/games/${run.id}/panorama`,
              payload: { index, pano: `lm-far-${index}` },
            })
          ).statusCode,
        ).toBe(400);
        metadataLocation = place.view;
        expect(
          (
            await call({
              method: "POST",
              url: `/api/games/${run.id}/panorama`,
              payload: { index, pano: `lm-start-${index}` },
            })
          ).statusCode,
        ).toBe(200);
        if (timed) {
          const ready = await call({
            method: "POST",
            url: `/api/games/${run.id}/ready`,
            payload: { index },
          });
          expect(ready.statusCode).toBe(200);
          const again = await call({
            method: "POST",
            url: `/api/games/${run.id}/ready`,
            payload: { index },
          });
          expect(again.json().deadline).toBe(ready.json().deadline);
          expect(
            (
              await call({
                method: "POST",
                url: `/api/games/${run.id}/pin`,
                payload: { index, guess: object },
              })
            ).statusCode,
          ).toBe(200);
        }
        const answer = await call({
          method: "POST",
          url: `/api/games/${run.id}/answers`,
          payload: {
            index,
            answer: { guess: object, actual: place.view, score: 0 },
          },
        });
        expect(answer.statusCode).toBe(200);
        expect(answer.json().answer).toMatchObject({
          actual: object,
          score: 100,
          distance: 0,
        });
      }
      expect(
        (
          await call({
            method: "POST",
            url: `/api/games/${run.id}/publish`,
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      const stored = (
        await pool.query(
          "SELECT challenge,answers,mode FROM playne_games WHERE id=$1",
          [run.id],
        )
      ).rows[0];
      expect(stored.mode).toBe(mode);
      expect(stored.challenge).not.toHaveProperty("panoramas");
      expect(stored.answers[0]).not.toHaveProperty("actual");
      const ranking = (
        await app.inject(`/api/leaderboard?game=geo&mode=${mode}&version=4`)
      ).json();
      expect(ranking.mode).toBe(mode);
      expect(ranking.entries[0].score).toBe(500);
    }
    expect(
      (
        await app.inject("/api/leaderboard?game=geo&mode=moving&version=4")
      ).json().entries[0].score,
    ).toBe(495);
    const profile = (
      await app.inject({
        url: "/api/account",
        headers: { ...headers, "x-playne-geo-version": "4" },
      })
    ).json();
    expect(
      profile.best
        .filter((b: any) => b.game === "geo")
        .map((b: any) => b.mode)
        .sort(),
    ).toEqual([
      "classic",
      "landmarks",
      "landmarks-timed",
      "moving",
      "moving-timed",
      "timed",
    ]);
  });
  it("recovers only previously issued color challenges owned by this browser", async () => {
    const headers = { origin, cookie: guest };
    const start = await app.inject({
      method: "POST",
      url: "/api/games",
      headers,
      payload: { game: "colorfle" },
    });
    const issued = start.json();
    const body = { game: "colorfle", targets: issued.challenge.targets };
    const resume = await app.inject({
      method: "POST",
      url: "/api/games/resume",
      headers,
      payload: body,
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().id).toBe(issued.id);
    expect(resume.json().challenge).toEqual(issued.challenge);
    const unrelated = await app.inject({
      method: "POST",
      url: "/api/games/resume",
      headers: { origin },
      payload: body,
    });
    expect(unrelated.statusCode).toBe(404);
    const changed = structuredClone(body);
    changed.targets[0].h = (changed.targets[0].h + 1) % 360;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/games/resume",
          headers,
          payload: changed,
        })
      ).statusCode,
    ).toBe(404);
    for (let index = 0; index < 5; index++)
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/games/${issued.id}/answers`,
            headers,
            payload: { index, answer: { choice: { h: 180, s: 50, v: 75 } } },
          })
        ).json().published,
      ).toBe(false);
    const complete = (
      await app.inject({
        method: "POST",
        url: "/api/games/resume",
        headers,
        payload: body,
      })
    ).json();
    expect(complete.completed).toBe(true);
    expect(complete.published).toBe(false);
    expect(complete.answers).toHaveLength(5);
  });
  it("replays Pressure, publishes immediately and retries idempotently", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { origin, cookie: logged },
      payload: { game: "pressure" },
    });
    expect(start.statusCode).toBe(200);
    const run = start.json();
    expect(run.challenge.levels).toHaveLength(30);
    const first = run.challenge.levels[0],
      second = run.challenge.levels[1];
    const events: { type: string; at: number }[] = [];
    if (first.kind !== "wait")
      for (let i = 0; i < first.count; i++)
        events.push(
          { type: "down", at: 300 + i * 170 },
          { type: "up", at: 350 + i * 170 },
        );
    const rounds = [
      {
        events,
        elapsed:
          first.kind === "wait" ? first.duration : events.at(-1)!.at + 420,
      },
      second.kind === "wait"
        ? { events: [{ type: "down", at: 10 }], elapsed: 10 }
        : { events: [], elapsed: second.duration },
    ];
    const payload = { index: 0, answer: { rounds, score: 9999 } };
    const fast = await app.inject({
      method: "POST",
      url: `/api/games/${run.id}/answers`,
      headers: { origin, cookie: logged },
      payload: {
        index: 0,
        answer: {
          rounds: rounds.map((r, i) =>
            i === 0 ? { ...r, elapsed: first.duration } : r,
          ),
        },
      },
    });
    expect(fast.statusCode).toBe(400);
    await pool.query(
      "UPDATE playne_games SET created_at=now()-interval '30 seconds' WHERE id=$1",
      [run.id],
    );
    for (let retry = 0; retry < 2; retry++) {
      const result = await app.inject({
        method: "POST",
        url: `/api/games/${run.id}/answers`,
        headers: { origin, cookie: logged },
        payload,
      });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({
        completed: true,
        published: true,
        score: 1,
        answer: { cleared: 1, total: 30 },
      });
    }
    const rank = await app.inject({
      url: "/api/leaderboard?game=pressure",
      headers: { cookie: logged },
    });
    expect(rank.json().mine.score).toBe(1);
    expect(rank.json().entries).toHaveLength(1);
    const stored = await pool.query(
      "SELECT score_units,answers,published_at FROM playne_games WHERE id=$1",
      [run.id],
    );
    expect(stored.rows[0].score_units).toBe(10);
    expect(stored.rows[0].answers).toHaveLength(1);
    expect(stored.rows[0].published_at).not.toBeNull();
  });

  it("automatically publishes each authenticated game on its final answer exactly once", async () => {
    const headers = { origin, cookie: logged, "x-playne-geo-version": "4" };
    for (const game of ["naglaz", "circle", "colorfle", "geo"]) {
      const issued = (
        await app.inject({
          method: "POST",
          url: "/api/games",
          headers,
          payload: { game, geoRulesVersion: 4 },
        })
      ).json();
      const count = game === "circle" ? 1 : 5;
      let answer: any;
      for (let index = 0; index < count; index++) {
        if (game === "naglaz") {
          const pair = pairs.find(
            (p) => p.id === issued.challenge.pairIds[index],
          )!;
          answer = { guess: objects[pair.reference].size * 0.7 };
        } else if (game === "colorfle")
          answer = { choice: { h: 180, s: 50, v: 75 } };
        else if (game === "circle")
          answer = {
            points: Array.from({ length: 181 }, (_, i) => ({
              x: 300 + 150 * Math.cos((i / 180) * 2 * Math.PI),
              y: 300 + 140 * Math.sin((i / 180) * 2 * Math.PI),
            })),
          };
        else {
          const place = issued.challenge.places[index];
          metadataLocation = place.view ?? { lat: place.lat, lng: place.lng };
          expect(
            (
              await app.inject({
                method: "POST",
                url: `/api/games/${issued.id}/panorama`,
                headers,
                payload: { index, pano: "automatic-" + index },
              })
            ).statusCode,
          ).toBe(200);
          answer = { guess: { lat: 20, lng: 0 }, expired: false };
        }
        const response = await app.inject({
          method: "POST",
          url: `/api/games/${issued.id}/answers`,
          headers,
          payload: { index, answer },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().published).toBe(index === count - 1);
      }
      const before = (
        await pool.query("SELECT published_at FROM playne_games WHERE id=$1", [
          issued.id,
        ])
      ).rows[0].published_at;
      expect(before).not.toBeNull();
      const retry = await app.inject({
        method: "POST",
        url: `/api/games/${issued.id}/answers`,
        headers,
        payload: { index: count - 1, answer },
      });
      expect(retry.json().published).toBe(true);
      const saved = (
        await app.inject({ url: `/api/games/${issued.id}`, headers })
      ).json();
      expect(saved.completed).toBe(true);
      expect(saved.published).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT published_at FROM playne_games WHERE id=$1",
            [issued.id],
          )
        ).rows[0].published_at,
      ).toEqual(before);
      if (game === "geo") {
        expect(saved.answers[4].actual).toBeUndefined();
        expect(saved.answers[4].guess).toBeUndefined();
      }
    }
  });
  it("times color rounds on the server, restores deadlines, publishes immediately and separates rankings", async () => {
    const headers = { origin, cookie: logged };
    const issued = (
      await app.inject({
        method: "POST",
        url: "/api/games",
        headers,
        payload: { game: "colorfle", mode: "timed" },
      })
    ).json();
    expect(issued.challenge.mode).toBe("timed");
    const clock = vi.spyOn(Date, "now");
    let now = Date.now();
    clock.mockImplementation(() => now);
    try {
      for (let index = 0; index < 5; index++) {
        const ready = (
          await app.inject({
            method: "POST",
            url: `/api/games/${issued.id}/ready`,
            headers,
            payload: { index },
          })
        ).json();
        expect(ready.deadline - now).toBe(30000);
        now += 1000;
        const restored = (
          await app.inject({
            method: "POST",
            url: `/api/games/${issued.id}/ready`,
            headers,
            payload: { index },
          })
        ).json();
        expect(restored.deadline).toBe(ready.deadline);
        if (index > 0) {
          const pin = await app.inject({
            method: "POST",
            url: `/api/games/${issued.id}/choice`,
            headers,
            payload: { index, choice: issued.challenge.targets[index] },
          });
          expect(pin.statusCode).toBe(200);
        }
        now = ready.deadline;
        expect(
          (
            await app.inject({
              method: "POST",
              url: `/api/games/${issued.id}/choice`,
              headers,
              payload: { index, choice: issued.challenge.targets[index] },
            })
          ).statusCode,
        ).toBe(409);
        const saved = await app.inject({
          method: "POST",
          url: `/api/games/${issued.id}/answers`,
          headers,
          payload: {
            index,
            answer: { choice: issued.challenge.targets[index], expired: true },
          },
        });
        expect(saved.statusCode).toBe(200);
        expect(saved.json().answer.score).toBe(index === 0 ? 0 : 100);
        expect(saved.json().published).toBe(index === 4);
      }
      const timed = (
        await app.inject("/api/leaderboard?game=colorfle&mode=timed")
      ).json();
      expect(timed.entries[0].score).toBe(400);
      expect(timed.mode).toBe("timed");
      const classic = (
        await app.inject("/api/leaderboard?game=colorfle&mode=classic")
      ).json();
      expect(classic.entries[0].score).toBe(500);
      expect(
        (await app.inject("/api/leaderboard?game=colorfle&mode=moving"))
          .statusCode,
      ).toBe(400);
    } finally {
      clock.mockRestore();
    }
  });
  it("rescales old completed and unfinished color parties once, with a restorable backup", async () => {
    const headers = { origin, cookie: logged };
    const owner = (await app.inject({ url: "/api/me", headers })).json().user
      .id;
    const target = { h: 210, s: 30, v: 98 },
      choice = { ...target, v: 93 };
    const ids: string[] = [];
    try {
      for (const complete of [false, true]) {
        const inserted = await pool.query(
          "INSERT INTO playne_games(browser_hash,owner_id,game,mode,version,challenge,answers,score_units,completed_at,published_at) VALUES($1,$2,'colorfle','timed',1,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END,CASE WHEN $6 THEN now() ELSE NULL END) RETURNING id,completed_at,published_at",
          [
            "f".repeat(64),
            owner,
            JSON.stringify({
              targets: Array(5).fill(target),
              mode: "timed",
              timers: {},
            }),
            JSON.stringify(Array(complete ? 5 : 1).fill({ choice, score: 95 })),
            complete ? 4750 : null,
            complete,
          ],
        );
        ids.push(inserted.rows[0].id);
      }
      const first = await migrateShadeScores(pool);
      expect(first.updated).toBe(2);
      const second = await migrateShadeScores(pool);
      expect(second.updated).toBe(0);
      const rows = (
        await pool.query(
          "SELECT g.*,b.answers AS original_answers,b.score_units AS original_score FROM playne_games g JOIN playne_color_score_backups b ON b.game_id=g.id WHERE g.id=ANY($1::uuid[]) ORDER BY score_units NULLS FIRST",
          [ids],
        )
      ).rows;
      expect(rows[0].score_units).toBeNull();
      expect(rows[0].answers[0].score).toBe(77);
      expect(rows[1].score_units).toBe(3850);
      expect(rows[1].original_score).toBe(4750);
      expect(rows[1].original_answers[0].score).toBe(95);
      expect(rows.every((r) => r.version === 2 && r.owner_id === owner)).toBe(
        true,
      );
      const own = (
        await app.inject({ url: `/api/games/${ids[1]}`, headers })
      ).json();
      expect(own.score).toBe(385);
      expect(own.published).toBe(true);
      const ranking = (
        await app.inject("/api/leaderboard?game=colorfle&mode=timed")
      ).json();
      expect(ranking.entries[0].score).toBe(400);
      const account = (
        await app.inject({ url: "/api/account", headers })
      ).json();
      expect(
        account.best.find(
          (b: any) => b.game === "colorfle" && b.mode === "timed",
        ).score,
      ).toBe(400);
    } finally {
      await pool.query("DELETE FROM playne_games WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM playne_color_score_backups WHERE game_id=ANY($1::uuid[])",
            [ids],
          )
        ).rows[0].n,
      ).toBe(0);
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
