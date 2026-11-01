import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { buildApp } from "../server/app";
import { FLOW_VERSION, flowDay, makeFlowPuzzle } from "../src/flow";
import { safeReturn } from "../server/scoring";
const database = process.env.TEST_DATABASE_URL;
(database ? describe : describe.skip)(
  "Рой: real PostgreSQL and API authority",
  () => {
    let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const schema = `flow_${randomBytes(6).toString("hex")}`,
      origin = "https://flow.test";
    const cookie = (response: any) =>
      response.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const guest = async () => cookie(await app.inject("/api/me"));
    const post = (cookies: string, path: string, payload: any) =>
      app.inject({
        method: "POST",
        url: path,
        headers: { cookie: cookies, origin },
        payload,
      });
    const get = (cookies: string, path: string) =>
      app.inject({ url: path, headers: { cookie: cookies } });
    const attempt = (
      kind: "level" | "daily" = "level",
      key = "1",
      hints = 0,
      version: 2 | 3 | 4 = FLOW_VERSION,
    ) => ({
      id: randomUUID(),
      version,
      kind,
      key,
      score: 999999,
      actions: [
        ...Array.from({ length: hints }, () => ({ type: "hint" })),
        ...makeFlowPuzzle(
          kind,
          kind === "level" ? Number(key) : key,
          version,
        ).solution.map((lane) => ({ type: "launch", lane })),
      ],
    });
    async function signed(browserCookie: string, name: string) {
      const id = (
        await pool.query(
          "INSERT INTO playne_users(nickname) VALUES($1) RETURNING id",
          [name],
        )
      ).rows[0].id;
      const token = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [createHash("sha256").update(token).digest("hex"), id],
      );
      return { id, cookie: `${browserCookie}; playne_session=${token}` };
    }
    beforeAll(async () => {
      admin = new Pool({ connectionString: database });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: database,
        options: `-c search_path=${schema},public`,
      });
      await pool.query(
        readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
      );
      // Schema is deliberately idempotent, including the newly added game.
      await pool.query(
        readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
      );
      app = await buildApp(pool, {
        origin,
        yandexId: "test",
        yandexSecret: "test",
        redirect: `${origin}/api/auth/yandex/callback`,
        secure: false,
        revision: "flow-test",
      });
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin?.end();
    });
    it("rejects unfinished logs, illegal actions, future or invalid dates and generic-run bypass", async () => {
      const b = await guest();
      expect(
        (
          await post(b, "/api/flow/finish", {
            ...attempt(),
            version: 1,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await post(b, "/api/flow/finish", { ...attempt(), actions: [] }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await post(b, "/api/flow/finish", {
            ...attempt(),
            actions: [{ type: "launch", lane: 9 }],
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await post(b, "/api/flow/finish", {
            ...attempt(),
            kind: "daily",
            key: "2099-01-01",
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await post(b, "/api/flow/finish", {
            ...attempt(),
            kind: "daily",
            key: "2026-02-31",
          })
        ).statusCode,
      ).toBe(400);
      expect((await post(b, "/api/games", { game: "flow" })).statusCode).toBe(
        400,
      );
    });
    it("derives scores, retries idempotently, protects ownership and claims guest progress", async () => {
      const b = await guest(),
        payload = attempt("level", "1", 1);
      expect((await post(b, "/api/flow/finish", payload)).json()).toMatchObject(
        { saved: true, score: 900, stars: 2 },
      );
      expect((await post(b, "/api/flow/finish", payload)).statusCode).toBe(200);
      expect(
        Number(
          (
            await pool.query("SELECT count(*) FROM playne_games WHERE id=$1", [
              payload.id,
            ])
          ).rows[0].count,
        ),
      ).toBe(1);
      expect(
        (await post(await guest(), "/api/flow/finish", payload)).statusCode,
      ).toBe(404);
      expect(
        (
          await post(b, "/api/flow/finish", {
            ...payload,
            actions: payload.actions.slice(1),
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await get(b, "/api/flow/progress")).json().records["level:1"].score,
      ).toBe(900);
      const owner = await signed(b, "Роботест");
      expect(
        (await get(owner.cookie, "/api/flow/progress")).json().records[
          "level:1"
        ].score,
      ).toBe(900);
      const stored = (
        await pool.query(
          "SELECT owner_id,published_at FROM playne_games WHERE id=$1",
          [payload.id],
        )
      ).rows[0];
      expect(stored.owner_id).toBe(owner.id);
      expect(stored.published_at).toBeNull();
      const other = await signed(b, "Другой аккаунт");
      expect(
        (await get(other.cookie, "/api/flow/progress")).json().records,
      ).toEqual({});
      expect(
        (await post(other.cookie, "/api/flow/finish", payload)).statusCode,
      ).toBe(409);
      expect(
        (
          await pool.query("SELECT owner_id FROM playne_games WHERE id=$1", [
            payload.id,
          ])
        ).rows[0].owner_id,
      ).toBe(owner.id);
      expect(
        (
          await post(owner.cookie, `/api/games/${payload.id}/answers`, {
            index: 0,
            answer: {},
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await get(owner.cookie, "/api/account"))
          .json()
          .history.some((r: any) => r.id === payload.id),
      ).toBe(true);
      expect(
        (await get(owner.cookie, "/api/account")).json().best,
      ).toContainEqual(
        expect.objectContaining({ game: "flow", mode: "practice", score: 900 }),
      );
    });
    it("retains each player's best daily result and counts completion toward activity", async () => {
      const b = await guest(),
        player = await signed(b, "Сегодняшний рой"),
        day = flowDay();
      expect(
        (
          await post(
            player.cookie,
            "/api/flow/finish",
            attempt("daily", day, 1),
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (await post(player.cookie, "/api/flow/finish", attempt("daily", day)))
          .statusCode,
      ).toBe(200);
      const board = (await get(player.cookie, "/api/flow/leaderboard")).json();
      expect(board.day).toBe(day);
      expect(board.entries.filter((e: any) => e.isMe)).toEqual([
        expect.objectContaining({ score: 1000, nickname: "Сегодняшний рой" }),
      ]);
      const progress = (await get(player.cookie, "/api/play/progress")).json();
      expect(progress.daily.flow).toMatchObject({
        completed: true,
        totalRounds: 1,
      });
      expect(progress.streak.playedToday).toBe(true);
      expect(
        (await get(player.cookie, "/api/flow/progress")).json().records[
          `daily:${day}`
        ].score,
      ).toBe(1000);
    });
    it("counts a guest daily completion toward daily progress, activity and streak without spending a guest trial", async () => {
      const browser = await guest(),
        otherBrowser = await guest(),
        day = flowDay(),
        payload = attempt("daily", day);
      const before = (await get(browser, "/api/play/progress")).json();
      expect(before.daily).not.toHaveProperty("flow");
      expect(before.streak.playedToday).toBe(false);
      expect(
        (await post(browser, "/api/flow/finish", payload)).statusCode,
      ).toBe(200);
      const progress = (await get(browser, "/api/play/progress")).json();
      expect(progress.daily.flow).toMatchObject({
        id: payload.id,
        completed: true,
        totalRounds: 1,
      });
      expect(progress.streak).toMatchObject({
        current: 1,
        best: 1,
        playedToday: true,
        lastDay: day,
      });
      expect(progress.weeklyDays).toBe(1);
      expect(
        progress.last7Days.find((entry: any) => entry.day === day),
      ).toMatchObject({ gamesCompleted: 1, score: 1000 });
      expect(progress.recentCompletions).toContainEqual(
        expect.objectContaining({ id: payload.id, game: "flow" }),
      );
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM playne_guest_trials WHERE run_id=$1",
            [payload.id],
          )
        ).rows[0].count,
      ).toBe(0);
      const unrelated = (await get(otherBrowser, "/api/play/progress")).json();
      expect(unrelated.daily).not.toHaveProperty("flow");
      expect(unrelated.streak.playedToday).toBe(false);
      expect(unrelated.recentCompletions).not.toContainEqual(
        expect.objectContaining({ id: payload.id }),
      );
    });
    it("shares a verified guest level with a short link, OG image, and an isolated same-board challenge", async () => {
      const author = await guest(),
        payload = attempt("level", "12");
      expect((await post(author, "/api/flow/finish", payload)).statusCode).toBe(
        200,
      );
      expect(
        (await post(await guest(), "/api/challenges", { runId: payload.id }))
          .statusCode,
      ).toBe(404);
      const created = await post(author, "/api/challenges", {
        runId: payload.id,
      });
      expect(created.statusCode).toBe(200);
      const shared = created.json();
      expect(shared).toMatchObject({
        game: "flow",
        score: 1000,
        maxScore: 1000,
        flow: { version: FLOW_VERSION, kind: "level", key: "12", stars: 3 },
        isTodayDaily: false,
      });
      expect(shared.url).toMatch(/\/c\/[A-Za-z0-9_-]{16}$/);
      expect(JSON.stringify(shared)).not.toMatch(
        /actions|solution|browser_hash|owner_id/,
      );
      expect(
        (await post(author, "/api/challenges", { runId: payload.id })).json()
          .url,
      ).toBe(shared.url);
      const html = await app.inject(new URL(shared.url).pathname);
      expect(html.body).toContain("Уровень 12");
      expect(html.body).toContain(`/swarm/?challenge=${shared.token}`);
      expect(html.body).toContain('property="og:image"');
      const png = await app.inject(new URL(shared.imageUrl).pathname);
      expect(png.headers["content-type"]).toContain("image/png");
      expect(png.rawPayload.subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a",
      );
      const friend = await signed(await guest(), "Муравей-соперник");
      const comparison = {
        ...attempt("level", "12", 1),
        challengeToken: shared.token,
      };
      expect(
        (
          await post(friend.cookie, "/api/flow/finish", {
            ...attempt("level", "1"),
            challengeToken: shared.token,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await post(friend.cookie, "/api/flow/finish", comparison)).json(),
      ).toMatchObject({ saved: true, score: 900 });
      expect(
        (await get(friend.cookie, "/api/flow/progress")).json().records,
      ).toEqual({});
      const stored = (
        await pool.query(
          "SELECT mode,published_at,challenge FROM playne_games WHERE id=$1",
          [comparison.id],
        )
      ).rows[0];
      expect(stored).toMatchObject({
        mode: "practice",
        published_at: null,
        challenge: {
          comparison: true,
          comparisonToken: shared.token,
          kind: "level",
          key: "12",
        },
      });
      const { challengeToken: _, ...unmarked } = comparison;
      expect(
        (await post(friend.cookie, "/api/flow/finish", unmarked)).statusCode,
      ).toBe(409);
      expect(
        (await post(friend.cookie, "/api/challenges", { runId: comparison.id }))
          .statusCode,
      ).toBe(200);
      expect(
        (await get(friend.cookie, "/api/account"))
          .json()
          .best.some((b: any) => b.game === "flow"),
      ).toBe(false);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/api/challenges/${shared.token}`,
            headers: { cookie: author, origin },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await get(friend.cookie, `/api/challenges/${shared.token}`))
          .statusCode,
      ).toBe(404);
    });
    it("keeps a shared daily challenge outside daily progress and the daily leaderboard", async () => {
      const author = await guest(),
        daily = attempt("daily", flowDay(), 1);
      await post(author, "/api/flow/finish", daily);
      const shared = (
        await post(author, "/api/challenges", { runId: daily.id })
      ).json();
      expect(shared.flow).toEqual({
        version: FLOW_VERSION,
        kind: "daily",
        key: flowDay(),
        stars: 2,
      });
      const friend = await signed(await guest(), "Дневной вызов");
      const comparison = {
        ...attempt("daily", flowDay()),
        challengeToken: shared.token,
      };
      expect(
        (await post(friend.cookie, "/api/flow/finish", comparison)).statusCode,
      ).toBe(200);
      expect(
        (await get(friend.cookie, "/api/flow/leaderboard"))
          .json()
          .entries.some((e: any) => e.isMe),
      ).toBe(false);
      expect(
        (await get(friend.cookie, "/api/flow/progress")).json().records,
      ).toEqual({});
      expect(
        (await get(friend.cookie, "/api/play/progress")).json().daily,
      ).not.toHaveProperty("flow");
      const reshared = (
        await post(friend.cookie, "/api/challenges", { runId: comparison.id })
      ).json();
      expect(reshared.flow).toEqual({
        version: FLOW_VERSION,
        kind: "daily",
        key: flowDay(),
        stars: 3,
      });
      expect(reshared.isTodayDaily).toBe(false);
    });
    it.each([2, 3] as const)(
      "keeps v%s campaign progress and exact old challenges without admitting old daily scores to the current competition",
      async (version) => {
        const player = await signed(await guest(), "Предыдущий рой");
        const campaign = attempt("level", "7", 0, version);
        const daily = attempt("daily", flowDay(), 0, version);
        expect(
          (await post(player.cookie, "/api/flow/finish", campaign)).statusCode,
        ).toBe(200);
        expect(
          (await post(player.cookie, "/api/flow/finish", daily)).statusCode,
        ).toBe(200);
        expect(
          (await post(player.cookie, "/api/flow/finish", campaign)).statusCode,
        ).toBe(200);
        expect(
          (await get(player.cookie, "/api/flow/progress")).json().records,
        ).toEqual({
          "level:7": { score: 1000, stars: 3 },
        });
        expect(
          (await get(player.cookie, "/api/flow/leaderboard"))
            .json()
            .entries.some((entry: any) => entry.isMe),
        ).toBe(false);
        expect(
          (await get(player.cookie, "/api/play/progress")).json().daily,
        ).not.toHaveProperty("flow");
        const shared = (
          await post(player.cookie, "/api/challenges", { runId: campaign.id })
        ).json();
        expect(shared.flow).toEqual({
          version,
          kind: "level",
          key: "7",
          stars: 3,
        });
        expect(
          (await get(player.cookie, `/api/challenges/${shared.token}`)).json()
            .flow.version,
        ).toBe(version);
        const friend = await guest();
        expect(
          (
            await post(friend, "/api/flow/finish", {
              ...attempt("level", "7"),
              challengeToken: shared.token,
            })
          ).statusCode,
        ).toBe(409);
        expect(
          (
            await post(friend, "/api/flow/finish", {
              ...attempt("level", "7", 1, version),
              challengeToken: shared.token,
            })
          ).json(),
        ).toMatchObject({ saved: true, score: 900 });
        expect(
          (await get(friend, "/api/flow/progress")).json().records,
        ).toEqual({});
        expect(
          (
            await pool.query("SELECT version FROM playne_games WHERE id=$1", [
              campaign.id,
            ])
          ).rows[0].version,
        ).toBe(version);
      },
    );
    it("accepts only safe login return destinations for the new game", () => {
      expect(safeReturn("/swarm/")).toBe("/swarm/");
      expect(safeReturn("/swarm/?mode=daily")).toBe("/swarm/?mode=daily");
      expect(safeReturn("/swarm/?mode=invalid")).toBe("/account/");
      expect(safeReturn("//evil.test/swarm/")).toBe("/account/");
    });
  },
);
