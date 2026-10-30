import { PRESSURE_RULES_VERSION } from "../src/pressure";
import { objects, pairs } from "../src/data";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../server/app";
import {
  makeChallenge,
  publicChallenge,
  safeReturn,
  scoreVersion,
} from "../server/scoring";
import { brainDailyPack } from "../server/brain";
import { challengeSvg } from "../server/challenge-preview";
import { hintLinePath, lineMoscowDate, type LinePuzzle } from "../src/line";
import type { ChallengeGame } from "../src/challenges";

const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)(
  "Explicit friend challenges: PostgreSQL authority",
  () => {
    let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
    let requestIp = 1;
    const origin = "https://challenges.test";
    const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    const cookies = (response: any) =>
      response.cookies
        .map((item: any) => `${item.name}=${item.value}`)
        .join("; ");
    const get = (url: string, cookie = "") =>
      app.inject({ url, headers: { cookie } });
    const post = (cookie: string, url: string, payload: any) =>
      app.inject({
        method: "POST",
        remoteAddress: `127.0.0.${requestIp}`,
        url,
        headers: { cookie, origin },
        payload,
      });
    const guest = async () => cookies(await get("/api/me"));
    const game = (
      cookie: string,
      id: ChallengeGame,
      token?: string,
      mode = "classic",
    ) =>
      post(cookie, "/api/games", {
        game: id,
        mode,
        ...(token ? { challenge: token } : {}),
      });
    const previousDay = () => {
      const date = new Date(`${lineMoscowDate()}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    };
    async function signed() {
      const id = (
        await pool.query(
          "INSERT INTO playne_users(nickname) VALUES('Тестовый игрок') RETURNING id",
        )
      ).rows[0].id;
      const token = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [hash(token), id],
      );
      return { id, cookie: `${await guest()}; playne_session=${token}` };
    }
    async function source(
      owner: string | null,
      id: ChallengeGame = "line",
      mode = "practice",
      day = previousDay(),
      browserHash = "b".repeat(64),
    ) {
      const pack = ["flash", "rotate", "slide", "dispatch"].includes(id)
        ? await brainDailyPack(pool, id as "flash", day)
        : undefined;
      const challenge = makeChallenge(
        id,
        [],
        mode as "classic" | "practice",
        undefined,
        undefined,
        day,
        1,
        pack,
      );
      if (id === "line") challenge.rounds = { 0: { startedAt: 1, hints: 3 } };
      else challenge.states = { 0: { startedAt: 1, revealUntil: 2, hints: 3 } };
      const result = await pool.query(
        "INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,answers,score_units,completed_at) VALUES($1,$2,$3,$4,$5,$6,4500,now()) RETURNING id",
        [
          browserHash,
          owner,
          id,
          mode,
          JSON.stringify(challenge),
          JSON.stringify(
            Array.from({ length: 5 }, () => ({
              score: 90,
              secretAnswer: "not-public",
            })),
          ),
        ],
      );
      return { id: result.rows[0].id as string, challenge };
    }
    async function share(cookie: string, runId: string) {
      const response = await post(cookie, "/api/challenges", {
        runId,
        score: 999999,
        nickname: "Spoofed",
      });
      expect(response.statusCode).toBe(200);
      return response.json();
    }
    async function finishLine(cookie: string, run: any) {
      for (let index = 0; index < 5; index++) {
        const puzzle = run.challenge.puzzles[index] as LinePuzzle;
        let path: number[] = [];
        while (path.length < puzzle.rows * puzzle.cols)
          path = hintLinePath(puzzle, path).path;
        expect(
          (await post(cookie, `/api/games/${run.id}/line/start`, { index }))
            .statusCode,
        ).toBe(200);
        const response = await post(cookie, `/api/games/${run.id}/answers`, {
          index,
          answer: { path },
        });
        expect(response.statusCode).toBe(200);
        if (index === 4) return response.json();
      }
    }
    async function finishRotate(cookie: string, run: any) {
      const challenge = (
        await pool.query("SELECT challenge FROM playne_games WHERE id=$1", [
          run.id,
        ])
      ).rows[0].challenge;
      for (let index = 0; index < 5; index++) {
        expect(
          (await post(cookie, `/api/games/${run.id}/brain/start`, { index }))
            .statusCode,
        ).toBe(200);
        const response = await post(cookie, `/api/games/${run.id}/answers`, {
          index,
          answer: { same: challenge.rounds[index].correctSame },
        });
        expect(response.statusCode).toBe(200);
        if (index === 4) return response.json();
      }
    }
    beforeAll(async () => {
      if (!db || new URL(db).pathname !== "/playne_test")
        throw new Error("Isolated test database required");
      admin = new Pool({ connectionString: db });
      await admin.query("CREATE SCHEMA IF NOT EXISTS playne_challenge_test");
      pool = new Pool({
        connectionString: db,
        options: "-c search_path=playne_challenge_test",
      });
      await pool.query(readFileSync("server/schema.sql", "utf8"));
      await pool.query(readFileSync("server/challenges-schema.sql", "utf8"));
      app = await buildApp(
        pool,
        {
          origin,
          yandexId: "test",
          yandexSecret: "test",
          redirect: origin + "/api/auth/yandex/callback",
          secure: true,
          revision: "challenge-test",
        },
        (async (url: any) =>
          new Response(
            JSON.stringify(
              String(url).includes("/token")
                ? { access_token: "test" }
                : {
                    id: "challenge-identity",
                    client_id: "test",
                    first_name: "Друг",
                  },
            ),
          )) as typeof fetch,
      );
    });
    beforeEach(async () => {
      requestIp++;
      await pool.query(
        "TRUNCATE playne_users,playne_games,playne_guest_trials,playne_brain_days,playne_line_days,playne_brain_packs,playne_challenges CASCADE",
      );
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      await admin?.query("DROP SCHEMA playne_challenge_test CASCADE");
      await admin?.end();
    });

    it.each(["naglaz", "circle", "colorfle", "geo", "pressure"] as const)(
      "shares and replays %s with exact conditions, correct units and private ranking semantics",
      async (id) => {
        const owner = await signed(),
          player = await signed();
        const challenge = makeChallenge(
          id,
          [],
          "classic",
          undefined,
          PRESSURE_RULES_VERSION,
        );
        if (id === "geo")
          challenge.panoramas = {
            0: { pano: "same-pano", actual: { lat: 1, lng: 2 }, deadline: 1 },
          };
        if (id === "colorfle")
          challenge.timers = {
            0: { deadline: 1, choice: { h: 1, s: 1, v: 1 } },
          };
        const count = ["circle", "pressure"].includes(id) ? 1 : 5;
        const units = id === "circle" ? 987 : id === "pressure" ? 12500 : 4500;
        const sourceId = (
          await pool.query(
            "INSERT INTO playne_games(browser_hash,owner_id,game,mode,version,challenge,answers,score_units,completed_at) VALUES($1,$2,$3,'classic',$4,$5,$6,$7,now()) RETURNING id",
            [
              "b".repeat(64),
              owner.id,
              id,
              scoreVersion(id),
              JSON.stringify(challenge),
              JSON.stringify(
                Array.from({ length: count }, () => ({ score: 90 })),
              ),
              units,
            ],
          )
        ).rows[0].id;
        const link = await share(owner.cookie, sourceId);
        expect(link).toMatchObject({
          game: id,
          score: units / 10,
          maxScore: id === "circle" ? 100 : id === "pressure" ? 0 : 500,
          isTodayDaily: false,
        });
        const response = await game(player.cookie, id, link.token);
        expect(response.statusCode).toBe(200);
        const run = response.json();
        expect(run).toMatchObject({
          mode: "classic",
          version: scoreVersion(id),
          private: true,
          challenge: { comparison: true, comparisonToken: link.token },
        });
        const stored = (
          await pool.query("SELECT challenge FROM playne_games WHERE id=$1", [
            run.id,
          ])
        ).rows[0].challenge;
        if (id === "naglaz") expect(stored.pairIds).toEqual(challenge.pairIds);
        if (id === "colorfle") {
          expect(stored.targets).toEqual(challenge.targets);
          expect(stored.timers).toEqual({});
        }
        if (id === "pressure") {
          expect(stored.seed).toBe(challenge.seed);
          expect(stored.levels).toEqual(challenge.levels);
        }
        if (id === "geo") {
          expect(stored.places).toEqual(challenge.places);
          expect(stored.panoramas[0]).toEqual({
            pano: "same-pano",
            actual: { lat: 1, lng: 2 },
          });
          expect(run.challenge).not.toHaveProperty("panoramas");
        }
        if (["naglaz", "colorfle", "circle"].includes(id)) {
          for (let i = 0; i < count; i++) {
            const pair =
              id === "naglaz"
                ? pairs.find((p) => p.id === challenge.pairIds[i])!
                : null;
            const answer =
              id === "naglaz"
                ? { guess: objects[pair!.reference].size * 0.7 }
                : id === "colorfle"
                  ? { choice: challenge.targets[i] }
                  : {
                      points: Array.from({ length: 181 }, (_, j) => ({
                        x: 300 + 150 * Math.cos((j / 180) * 2 * Math.PI),
                        y: 300 + 145 * Math.sin((j / 180) * 2 * Math.PI),
                      })),
                    };
            const result = await post(
              player.cookie,
              `/api/games/${run.id}/answers`,
              { index: i, answer },
            );
            expect(result.statusCode).toBe(200);
            if (i === count - 1)
              expect(result.json()).toMatchObject({
                completed: true,
                private: true,
                published: false,
                record: { improved: false },
              });
          }
          expect(
            (
              await post(player.cookie, `/api/games/${run.id}/publish`, {})
            ).json(),
          ).toMatchObject({ private: true });
        }
        expect((await game(player.cookie, id, link.token)).json().id).toBe(
          run.id,
        );
        expect((await get(`/api/leaderboard?game=${id}`)).json().total).toBe(0);
        expect((await get(`/challenge/${link.token}`)).body).toContain(
          `/${id}/?challenge=`,
        );
      },
    );

    it("publishes a stable short link with server-rendered previews while legacy links still work", async () => {
      const author = await signed(),
        run = await source(author.id);
      const link = await share(author.cookie, run.id);
      expect(new URL(link.url).pathname).toMatch(/^\/c\/[A-Za-z0-9_-]{16}$/);
      expect((await share(author.cookie, run.id)).url).toBe(link.url);
      const short = await get(new URL(link.url).pathname);
      expect(short.statusCode).toBe(200);
      expect(short.body).toContain(link.imageUrl);
      expect(short.body).toContain(`challenge=${link.token}`);
      expect(short.body).toContain(`property="og:url" content="${link.url}"`);
      expect((await get(`/challenge/${link.token}`)).statusCode).toBe(200);
      expect((await get("/c/" + "x".repeat(16))).statusCode).toBe(404);
      await app.inject({
        method: "DELETE",
        url: `/api/challenges/${link.token}`,
        headers: { origin, cookie: author.cookie },
      });
      expect((await get(new URL(link.url).pathname)).statusCode).toBe(404);
      const fresh = await share(author.cookie, run.id);
      expect(fresh.url).not.toBe(link.url);
      expect((await get(new URL(fresh.url).pathname)).statusCode).toBe(200);
    });
    it("upgrades a legacy share on demand without breaking its original token", async () => {
      const author = await signed(),
        run = await source(author.id),
        link = await share(author.cookie, run.id);
      await pool.query(
        "UPDATE playne_challenges SET short_code=NULL WHERE token=$1",
        [link.token],
      );
      expect((await get(`/challenge/${link.token}`)).statusCode).toBe(200);
      const upgraded = await share(author.cookie, run.id);
      expect(upgraded.token).toBe(link.token);
      expect(new URL(upgraded.url).pathname).toMatch(
        /^\/c\/[A-Za-z0-9_-]{16}$/,
      );
      expect((await get(new URL(upgraded.url).pathname)).statusCode).toBe(200);
    });

    it("shares only an explicitly selected completed result and rejects other accounts, incomplete and unsupported games", async () => {
      const owner = await signed(),
        other = await signed(),
        run = await source(owner.id);
      expect(
        (await post(other.cookie, "/api/challenges", { runId: run.id }))
          .statusCode,
      ).toBe(404);
      expect(
        (await post(owner.cookie, "/api/challenges", { runId: "wrong" }))
          .statusCode,
      ).toBe(400);
      const data = await share(owner.cookie, run.id);
      expect(data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data).toMatchObject({
        game: "line",
        score: 450,
        maxScore: 500,
        nickname: "Тестовый игрок",
        isTodayDaily: false,
      });
      expect(Object.keys(data).sort()).toEqual(
        [
          "day",
          "game",
          "gameName",
          "imageUrl",
          "isTodayDaily",
          "maxScore",
          "mode",
          "nickname",
          "score",
          "token",
          "url",
        ].sort(),
      );
      expect((await share(owner.cookie, run.id)).token).toBe(data.token);
      const body = (await get(`/api/challenges/${data.token}`)).body;
      for (const secret of [
        run.id,
        owner.id,
        "answers",
        "secretAnswer",
        "not-public",
        "puzzles",
        "states",
        "seed",
        "email",
      ])
        expect(body).not.toContain(secret);
      await pool.query(
        "UPDATE playne_games SET completed_at=NULL,score_units=NULL WHERE id=$1",
        [run.id],
      );
      expect(
        (await post(owner.cookie, "/api/challenges", { runId: run.id }))
          .statusCode,
      ).toBe(409);
      await pool.query(
        "UPDATE playne_games SET game='circle',completed_at=now(),score_units=4500 WHERE id=$1",
        [run.id],
      );
      expect(
        (await post(owner.cookie, "/api/challenges", { runId: run.id }))
          .statusCode,
      ).toBe(409);
    });

    it("uses the existing official Line daily attempt even when a challenge request asks for practice or the daily is already complete", async () => {
      const author = await signed(),
        player = await signed(),
        run = await source(author.id, "line", "classic", lineMoscowDate());
      const link = await share(author.cookie, run.id);
      expect(link.isTodayDaily).toBe(true);
      const first = (await game(player.cookie, "line")).json();
      const accepted = (
        await game(player.cookie, "line", link.token, "practice")
      ).json();
      expect(accepted.id).toBe(first.id);
      expect(accepted.mode).toBe("classic");
      expect(accepted.challenge.puzzles).toEqual(run.challenge.puzzles);
      await finishLine(player.cookie, first);
      const again = (await game(player.cookie, "line", link.token)).json();
      expect(again).toMatchObject({
        id: first.id,
        completed: true,
        score: 500,
      });
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM playne_games WHERE owner_id=$1",
            [player.id],
          )
        ).rows[0].n,
      ).toBe(1);
    });

    it.each(["flash", "rotate", "slide", "dispatch"] as const)(
      "uses the canonical current %s pack and never makes a second daily attempt",
      async (id) => {
        const author = await signed(),
          player = await signed(),
          run = await source(author.id, id, "classic", lineMoscowDate());
        const link = await share(author.cookie, run.id);
        const response = await game(player.cookie, id, link.token, "practice");
        expect(response.statusCode).toBe(200);
        const accepted = response.json();
        expect(accepted.mode).toBe("classic");
        const privateRun = (
          await pool.query("SELECT challenge FROM playne_games WHERE id=$1", [
            accepted.id,
          ])
        ).rows[0];
        expect(privateRun.challenge.rounds).toEqual(run.challenge.rounds);
        expect((await game(player.cookie, id, link.token)).json().id).toBe(
          accepted.id,
        );
      },
    );

    it.each(["classic", "practice"])(
      "copies exact older Line %s puzzles with fresh timers, reuses the comparison, and keeps completion/manual publication out of public rankings",
      async (mode) => {
        const author = await signed(),
          player = await signed(),
          run = await source(author.id, "line", mode);
        const link = await share(author.cookie, run.id);
        const responses = await Promise.all([
          game(player.cookie, "line", link.token),
          game(player.cookie, "line", link.token),
        ]);
        expect(responses.map((response) => response.statusCode)).toEqual([
          200, 200,
        ]);
        const accepted = responses[0].json();
        expect(responses[1].json().id).toBe(accepted.id);
        expect(accepted).toMatchObject({
          mode: "practice",
          private: true,
          answers: [],
        });
        expect(accepted.challenge.puzzles).toEqual(run.challenge.puzzles);
        expect(accepted.challenge.rounds).toEqual({});
        expect(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM playne_line_days WHERE owner_id=$1",
              [player.id],
            )
          ).rows[0].n,
        ).toBe(0);
        expect(await finishLine(player.cookie, accepted)).toMatchObject({
          completed: true,
          published: false,
          private: true,
          score: 500,
          record: { improved: false },
        });
        expect(
          (
            await post(player.cookie, `/api/games/${accepted.id}/publish`, {})
          ).json(),
        ).toMatchObject({ private: true, record: { improved: false } });
        const saved = (
          await pool.query(
            "SELECT published_at FROM playne_games WHERE id=$1",
            [accepted.id],
          )
        ).rows[0];
        expect(saved.published_at).toBeNull();
        expect(
          (await game(player.cookie, "line", link.token)).json(),
        ).toMatchObject({ id: accepted.id, completed: true, private: true });
        // Defensive filtering also protects rankings from an accidentally published comparison.
        await pool.query(
          "UPDATE playne_games SET published_at=now(),mode='classic' WHERE id=$1",
          [accepted.id],
        );
        expect((await get("/api/leaderboard?game=overall")).json().total).toBe(
          0,
        );
        expect((await get("/api/leaderboard?game=line")).json().total).toBe(0);
      },
    );

    it("keeps Flash cells and source hints private, revealing only the currently started comparison round", async () => {
      const author = await signed(),
        player = await signed(),
        run = await source(author.id, "flash");
      const link = await share(author.cookie, run.id);
      const accepted = (await game(player.cookie, "flash", link.token)).json();
      expect(accepted).toMatchObject({ private: true, mode: "practice" });
      expect(JSON.stringify(accepted.challenge)).not.toContain('"cells"');
      expect(accepted.challenge.states).toEqual({});
      const stored = (
        await pool.query("SELECT challenge FROM playne_games WHERE id=$1", [
          accepted.id,
        ])
      ).rows[0].challenge;
      expect(stored.rounds).toEqual(run.challenge.rounds);
      const started = (
        await post(player.cookie, `/api/games/${accepted.id}/brain/start`, {
          index: 0,
        })
      ).json();
      expect(started.round.cells).toEqual(run.challenge.rounds[0].cells);
      expect(started.hints).toBe(0);
    });

    it.each(["line", "rotate"] as const)(
      "retains own %s comparison identity at start, resume, completion, reload and OAuth",
      async (id) => {
        const author = await signed(),
          original = await source(author.id, id),
          link = await share(author.cookie, original.id);
        const cookie = await guest();
        const assertOwn = (run: any, completed: boolean) => {
          expect(run).toMatchObject({
            private: true,
            challenge: { comparison: true, comparisonToken: link.token },
          });
          expect(!!run.completed).toBe(completed);
          for (const secret of ["seed", "secretAnswer", "correctSame"])
            expect(JSON.stringify(run.challenge)).not.toContain(secret);
        };
        const accepted = (await game(cookie, id, link.token)).json();
        assertOwn(accepted, false);
        assertOwn(
          (await get(`/api/games/${accepted.id}`, cookie)).json(),
          false,
        );
        assertOwn((await game(cookie, id, link.token)).json(), false);
        const finish =
          id === "line"
            ? await finishLine(cookie, accepted)
            : await finishRotate(cookie, accepted);
        expect(finish).toMatchObject({
          completed: true,
          private: true,
          published: false,
        });
        assertOwn(
          (await get(`/api/games/${accepted.id}`, cookie)).json(),
          true,
        );

        const path = id === "line" ? "/one-line/" : "/brain/rotate/";
        const returned = `${path}?challenge=${link.token}`;
        const login = await get(
          `/api/auth/yandex/start?return=${encodeURIComponent(returned)}`,
          cookie,
        );
        const state = new URL(login.headers.location!).searchParams.get(
          "state",
        );
        const callback = await get(
          `/api/auth/yandex/callback?state=${state}&code=test`,
          cookie,
        );
        expect(callback.headers.location).toContain(returned);
        const signedCookie = cookies(callback);
        assertOwn(
          (await get(`/api/games/${accepted.id}`, signedCookie)).json(),
          true,
        );
        assertOwn((await game(signedCookie, id, link.token)).json(), true);
        const publiclyShared = (
          await get(`/api/challenges/${link.token}`)
        ).json();
        expect(publiclyShared).not.toHaveProperty("comparisonToken");
        expect(publiclyShared).not.toHaveProperty("comparison");
        expect(publiclyShared).not.toHaveProperty("runId");
      },
    );

    it("requires the guest's own unclaimed trial and rejects a different unfinished guest pack", async () => {
      const author = await signed(),
        run = await source(author.id),
        link = await share(author.cookie, run.id);
      const cookie = await guest();
      const own = (await game(cookie, "line")).json();
      expect((await game(cookie, "line", link.token)).statusCode).toBe(409);
      await pool.query(
        "UPDATE playne_games SET answers=$1,score_units=4500,completed_at=now() WHERE id=$2",
        [
          JSON.stringify(Array.from({ length: 5 }, () => ({ score: 90 }))),
          own.id,
        ],
      );
      const guestLink = await share(cookie, own.id);
      expect(guestLink.nickname).toBe("Гость");
      expect(
        (await post(await guest(), "/api/challenges", { runId: own.id }))
          .statusCode,
      ).toBe(404);
      await pool.query("UPDATE playne_games SET owner_id=$1 WHERE id=$2", [
        author.id,
        own.id,
      ]);
      expect(
        (await post(cookie, "/api/challenges", { runId: own.id })).statusCode,
      ).toBe(404);
    });

    it("claims a completed guest comparison through OAuth without publishing or treating it as a personal record", async () => {
      const author = await signed(),
        run = await source(author.id),
        link = await share(author.cookie, run.id);
      const cookie = await guest();
      const accepted = (await game(cookie, "line", link.token)).json();
      expect(await finishLine(cookie, accepted)).toMatchObject({
        private: true,
        published: false,
        record: { improved: false },
      });
      const login = await get(
        "/api/auth/yandex/start?return=%2Fone-line%2F",
        cookie,
      );
      const state = new URL(login.headers.location!).searchParams.get("state");
      const callback = await get(
        `/api/auth/yandex/callback?state=${state}&code=test`,
        cookie,
      );
      expect(callback.headers.location).toContain("auth=success");
      const signedCookie = cookies(callback);
      const saved = (
        await pool.query(
          "SELECT owner_id,published_at,challenge FROM playne_games WHERE id=$1",
          [accepted.id],
        )
      ).rows[0];
      expect(saved.owner_id).toBeTruthy();
      expect(saved.published_at).toBeNull();
      expect(saved.challenge.comparison).toBe(true);
      expect(
        (
          await post(signedCookie, `/api/games/${accepted.id}/publish`, {})
        ).json(),
      ).toMatchObject({ private: true, record: { improved: false } });
      const account = (await get("/api/account", signedCookie)).json();
      expect(account.best).toEqual([]);
      expect((await get("/api/leaderboard?game=overall")).json().total).toBe(0);
    });

    it("revokes metadata, SSR, PNG and starts, issuing an unrelated fresh token on explicit resharing", async () => {
      const author = await signed(),
        other = await signed(),
        run = await source(author.id),
        link = await share(author.cookie, run.id);
      const png = await get(`/api/challenges/${link.token}/image.png`);
      expect(png.statusCode).toBe(200);
      expect(png.headers["content-type"]).toContain("image/png");
      expect(png.rawPayload.subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a",
      );
      expect(png.rawPayload.readUInt32BE(16)).toBe(1200);
      expect(png.rawPayload.readUInt32BE(20)).toBe(630);
      expect(png.rawPayload.length).toBeGreaterThan(10_000);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/api/challenges/${link.token}`,
            headers: { origin, cookie: other.cookie },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/api/challenges/${link.token}`,
            headers: { origin, cookie: author.cookie },
          })
        ).statusCode,
      ).toBe(200);
      for (const url of [
        `/api/challenges/${link.token}`,
        `/challenge/${link.token}`,
        `/api/challenges/${link.token}/image.png`,
      ])
        expect((await get(url)).statusCode).toBe(404);
      expect((await game(other.cookie, "line", link.token)).statusCode).toBe(
        404,
      );
      const fresh = await share(author.cookie, run.id);
      expect(fresh.token).not.toBe(link.token);
      expect((await get(`/api/challenges/${link.token}`)).statusCode).toBe(404);
      await pool.query("DELETE FROM playne_users WHERE id=$1", [author.id]);
      expect((await get(`/api/challenges/${fresh.token}`)).statusCode).toBe(
        404,
      );
    });

    it("server-renders actual result metadata with escaped names and a fair CTA for the maximum score", async () => {
      const author = await signed(),
        run = await source(author.id);
      await pool.query("UPDATE playne_users SET nickname=$1 WHERE id=$2", [
        'Игра <script> & "да"',
        author.id,
      ]);
      await pool.query("UPDATE playne_games SET score_units=5000 WHERE id=$1", [
        run.id,
      ]);
      const link = await share(author.cookie, run.id);
      const page = await get(`/challenge/${link.token}`);
      expect(page.statusCode).toBe(200);
      expect(page.headers["cache-control"]).toBe("no-store");
      expect(page.headers["x-robots-tag"]).toContain("noindex");
      expect(page.body).toContain('property="og:image"');
      expect(page.body).toContain(link.imageUrl);
      expect(page.body).toContain("Сможешь повторить?");
      expect(page.body).not.toContain("Побьёшь мой результат?");
      expect(page.body).toContain("500 / 500");
      expect(page.body).not.toContain("<script>");
      expect(page.body).toContain("&lt;script&gt;");
      expect(page.body).toContain(`/one-line/?challenge=${link.token}`);
      expect(challengeSvg(link)).toContain("Сможешь повторить?");
      expect((await get("/api/challenges/" + "A".repeat(43))).statusCode).toBe(
        404,
      );
    });
  },
);

describe("Challenge OAuth return targets and own-run projection", () => {
  const token = "A".repeat(43);
  it.each([
    "/naglaz/",
    "/circle/",
    "/colorfle/",
    "/geo/",
    "/pressure/",
    "/line/",
    "/one-line/",
    "/brain/flash/",
    "/brain/rotate/",
    "/brain/slide/",
    "/brain/dispatch/",
  ])("preserves an opaque challenge only on supported route %s", (path) => {
    const target = `${path}?challenge=${token}${["/circle/", "/naglaz/", "/pressure/"].includes(path) ? "" : "&mode=" + (path.startsWith("/brain/") || path.includes("line") ? "practice" : "classic")}`;
    expect(safeReturn(target)).toBe(target);
  });
  it("keeps origin, token, duplicate-parameter and unsupported-game protections", () => {
    for (const target of [
      `https://evil.test/brain/flash/?challenge=${token}`,
      `//evil.test/brain/flash/?challenge=${token}`,
      `/account/?challenge=${token}`,
      `/brain/flash/?challenge=short`,
      `/brain/flash/?challenge=${token}&challenge=${token}`,
      `/brain/flash/?challenge=${token}%2F`,
      `/brain/flash/?challenge=${token}&return=https://evil.test`,
    ])
      expect(safeReturn(target)).toBe("/account/");
    expect(safeReturn("/colorfle/?mode=timed")).toBe("/colorfle/?mode=timed");
  });
  it.each(["line", "flash"] as const)(
    "exposes only an immutable comparison marker and valid token for own %s projections",
    (game) => {
      const base = makeChallenge(game);
      expect(
        publicChallenge(game, {
          ...base,
          comparison: true,
          comparisonToken: token,
        }),
      ).toMatchObject({ comparison: true, comparisonToken: token });
      for (const fields of [
        { comparison: false, comparisonToken: token },
        { comparison: "true", comparisonToken: token },
        { comparison: true, comparisonToken: "invalid" },
      ]) {
        const projected = publicChallenge(game, { ...base, ...fields });
        expect(projected).not.toHaveProperty("comparison");
        expect(projected).not.toHaveProperty("comparisonToken");
      }
    },
  );
});
