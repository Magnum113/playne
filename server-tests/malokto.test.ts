import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { buildApp } from "../server/app";
import { MALOKTO_READ_MS, MALOKTO_ROUND_MS } from "../src/malokto";
import { MALOKTO_BANK_START, maloktoPack } from "../server/malokto-bank";

const connectionString = process.env.TEST_DATABASE_URL;
const origin = "https://malokto.test";
(connectionString ? describe : describe.skip)("Мало кто — party, daily ranking and challenge", () => {
  let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const schema = "playne_malokto_test";
  const matchRulesTime = () => Date.parse(MALOKTO_BANK_START + "T09:00:00Z");
  const pack = maloktoPack(MALOKTO_BANK_START, MALOKTO_BANK_START)!;
  const cookies = (response: { cookies: { name: string; value: string }[] }) =>
    response.cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ");
  const post = (url: string, payload: unknown, cookie = "") =>
    app.inject({ method: "POST", url, payload: payload as object, headers: { origin, cookie } });
  const get = (url: string, cookie = "") => app.inject({ url, headers: { cookie } });

  beforeAll(async () => {
    if (new URL(connectionString!).pathname !== "/playne_test") throw Error("Isolated database required");
    admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    pool = new Pool({ connectionString, options: "-c search_path=" + schema });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(pool, { origin, yandexId: "test", yandexSecret: "test", redirect: origin + "/api/auth/yandex/callback", secure: true, revision: "test" });
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("does not leak answers, keeps timers after reload, saves scores, ranks and shares the same daily pack", async () => {
    // Anchor the app's date to the first pack; wall-clock timestamps in Postgres
    // are independent and do not control the round deadline.
    const clock = Date.now;
    let current = matchRulesTime();
    Date.now = () => current;
    try {
      const { rows: [owner] } = await pool.query("INSERT INTO playne_users(nickname) VALUES('Локальный игрок') RETURNING id");
      const secret = randomBytes(32).toString("base64url");
      await pool.query("INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [createHash("sha256").update(secret).digest("hex"), owner.id]);
      const session = "playne_session=" + secret;
      const guest = cookies(await get("/api/malokto/daily"));
      const start = await post("/api/games", { game: "malokto", mode: "daily" }, guest);
      expect(start.statusCode, start.body).toBe(200);
      const run = start.json();
      expect(run.challenge).toEqual({ day: MALOKTO_BANK_START, count: 5, mode: "daily" });
      expect((await get(`/api/games/${run.id}/malokto/review`, guest)).statusCode).toBe(404);
      expect((await get(`/api/games/${run.id}`)).statusCode).toBe(404);

      for (const [index, task] of pack.entries()) {
        const url = `/api/games/${run.id}/malokto/start`;
        const shown = (await post(url, { index }, guest)).json();
        expect(Object.keys(shown).sort()).toEqual(["category", "deadline", "prompt", "serverNow"]);
        expect(shown.prompt).toBe(task.prompt);
        expect(shown.deadline).toBe(current + MALOKTO_READ_MS + MALOKTO_ROUND_MS);
        const answerUrl = `/api/games/${run.id}/answers`;
        if (index === 0) {
          const early = await post(answerUrl, { index, answer: { text: task.answers[0].name } }, guest);
          expect(early.statusCode).toBe(400);
          expect(early.json().error).toBe("Дождись начала отсчёта");
        }
        current += MALOKTO_READ_MS + 1200;
        expect((await post(url, { index }, guest)).json().deadline).toBe(shown.deadline);
        expect((await post(answerUrl, { index, answer: { text: "несуществующий ответ" } }, guest)).statusCode).toBe(400);
        if (index === 4) current = shown.deadline;
        const response = await post(answerUrl, { index, answer: { text: task.answers.at(-1)!.name } }, guest);
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().answer.score).toBe(index === 4 ? 0 : task.answers.at(-1)!.score);
        expect((await post(answerUrl, { index, answer: { text: task.answers[0].name } }, guest)).json().answer).toEqual(response.json().answer);
        current += 1000;
      }
      const review = (await get(`/api/games/${run.id}/malokto/review`, guest)).json();
      expect(review.rounds).toHaveLength(5);
      expect(review.rounds[0].examples.length).toBeGreaterThan(0);
      expect((await get(`/api/leaderboard?game=malokto&mode=daily&day=${MALOKTO_BANK_START}`)).json().entries).toEqual([]);
      const share = await post("/api/challenges", { runId: run.id }, guest);
      expect(share.statusCode, share.body).toBe(200);
      const challenge = share.json();
      expect(challenge).toMatchObject({ day: MALOKTO_BANK_START, game: "malokto", isTodayDaily: true, maxScore: 500 });
      expect(challenge).not.toHaveProperty("answers");
      const friend = cookies(await get("/api/malokto/daily"));
      const follow = await post("/api/games", { game: "malokto", mode: "daily", challenge: challenge.token }, friend);
      expect(follow.statusCode, follow.body).toBe(200);
      expect(follow.json().id).not.toBe(run.id);
      expect((await post(`/api/games/${follow.json().id}/malokto/start`, { index: 0 }, friend)).json().prompt).toBe(pack[0].prompt);
      const published = await post(`/api/games/${run.id}/publish`, {}, guest + "; " + session);
      expect(published.statusCode, published.body).toBe(200);
      const board = (await get(`/api/leaderboard?game=malokto&mode=daily&day=${MALOKTO_BANK_START}`, session)).json();
      expect(board.mine).toMatchObject({ nickname: "Локальный игрок", place: 1, elapsedMs: 34800 });
      expect((await get(`/api/games/${run.id}/malokto/review`, guest)).statusCode).toBe(404);
      current += 86400000;
      expect((await post("/api/games", { game: "malokto", mode: "daily", challenge: challenge.token }, friend)).statusCode).toBe(409);
    } finally { Date.now = clock; }
  });
});
