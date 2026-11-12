import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { buildApp } from "../server/app";
import { validateAnswer, safeReturn } from "../server/scoring";
import { createPerceptionTasks, perceptionMinimumMs, type PerceptionTask } from "../src/perception";
import { RHYTHM_CUE_START } from "../src/perceptionRhythm";
import { geoDailyDate } from "../src/geoDaily";

function exactInput(task: PerceptionTask) {
  if (task.kind === "tempo") {
    const period = 60000 / task.bpm;
    return {
      calibration: Array.from({ length: 4 }, (_, i) => RHYTHM_CUE_START + i * period),
      taps: Array.from({ length: 8 }, (_, i) => RHYTHM_CUE_START + (4 + i) * period),
    };
  }
  return { value: task.kind === "count" ? task.dots.length : task.kind === "angle" ? task.target : task.kind === "track" ? task.startX + task.travel : task.fromRight ? 1 - task.fraction : task.fraction };
}

it("requires a server start, elapsed presentation and real tap timestamps", () => {
  const tasks = createPerceptionTasks("2026-11-12");
  const challenge: any = { tasks, rounds: {} };
  expect(() => validateAnswer("perception", challenge, 0, exactInput(tasks[0]), 5000)).toThrow("Сначала");
  challenge.rounds[0] = { startedAt: 1000 };
  expect(() => validateAnswer("perception", challenge, 0, exactInput(tasks[0]), 2000)).toThrow("Дождись");
  expect(validateAnswer("perception", challenge, 0, { skipped: true }, 2000)).toMatchObject({ score: 0, skipped: true, elapsedMs: 1000 });
  expect(validateAnswer("perception", challenge, 0, { ...exactInput(tasks[0]), score: 0, elapsedMs: 0 }, 4000)).toMatchObject({ score: 100, elapsedMs: 3000 });
  challenge.rounds[3] = { startedAt: 1000 };
  const tempo = tasks[3];
  const minimum = perceptionMinimumMs(tempo);
  if (tempo.kind === "tempo") {
    const fastTaps = Array.from({ length: 8 }, (_, i) => 800 + 3.5 * 60000 / tempo.bpm + i * 90);
    const fast = validateAnswer("perception", challenge, 3, { taps: fastTaps }, 1000 + fastTaps[7] + 50);
    expect(fast.score).toBeLessThan(50);
    expect((fast as { elapsedMs: number }).elapsedMs).toBe(fastTaps[7] + 50);
  }
  expect(() => validateAnswer("perception", challenge, 3, { taps: [10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000] }, 1000 + minimum + 1)).toThrow("время");
  const resumedTaps = Array.from({ length: 8 }, (_, i) => 180000 + i * 600);
  expect(validateAnswer("perception", challenge, 3, { taps: resumedTaps }, 190000)).toMatchObject({ elapsedMs: 189000 });
  expect(() => validateAnswer("perception", challenge, 3, { taps: resumedTaps, calibration: [210000, 210600, 211200, 211800] }, 190000)).toThrow("время");
  expect(() => validateAnswer("perception", challenge, 3, { taps: resumedTaps }, 180000)).toThrow("время");
  expect(() => validateAnswer("perception", challenge, 3, { taps: [0, 1, 2, 3, 4, 5, 6, Infinity] }, 190000)).toThrow();
  expect(safeReturn("/perception/?claim=11111111-1111-4111-8111-111111111111&mode=daily")).toContain("/perception/");
});

const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)("Приметь daily PostgreSQL", () => {
  let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const origin = "https://perception.test";
  let identity = "perception-one";
  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test") throw new Error("Isolated test database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA playne_perception_test");
    pool = new Pool({ connectionString: db, options: "-c search_path=playne_perception_test" });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(pool, { origin, redirect: origin + "/api/auth/yandex/callback", yandexId: "test", yandexSecret: "test", secure: true, revision: "perception-test" }, (async (url: string) => new URL(url).pathname === "/token" ? Response.json({ access_token: "test" }) : Response.json({ id: identity, client_id: "test", first_name: "Игрок" })) as typeof fetch);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await app?.close(); await pool?.end();
    await admin?.query("DROP SCHEMA IF EXISTS playne_perception_test CASCADE"); await admin?.end();
  });
  const jar = (r: any) => r.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  const get = (url: string, cookie = "") => app.inject({ url, headers: { cookie } });
  const post = (url: string, cookie: string, payload: object = {}) => app.inject({ method: "POST", url, headers: { cookie, origin }, payload });
  const start = (cookie: string) => post("/api/games", cookie, { game: "perception", mode: "daily" });
  const guest = async () => jar(await get("/api/me"));
  async function login(cookie: string, subject: string) {
    identity = subject;
    const begin = await get("/api/auth/yandex/start?return=%2Fperception%2F", cookie);
    const state = new URL(begin.headers.location!).searchParams.get("state");
    const callback = await get(`/api/auth/yandex/callback?code=test&state=${state}`, cookie);
    expect(callback.headers.location).toBe("/perception/?auth=success");
    return cookie + "; " + jar(callback);
  }
  async function finish(cookie: string, run: any, extra = 0) {
    for (let index = 0; index < 5; index++) {
      const started = await post(`/api/games/${run.id}/perception/start`, cookie, { index });
      expect(started.statusCode, started.body).toBe(200);
      const { task, startedAt } = started.json();
      const delay = task.kind === "tempo" ? 800 + 11 * 60000 / task.bpm + 1000 : perceptionMinimumMs(task) + 1000;
      vi.setSystemTime(startedAt + delay + extra);
      const answer = await post(`/api/games/${run.id}/answers`, cookie, { index, answer: { ...exactInput(task), elapsedMs: 0, score: 500 } });
      expect(answer.statusCode, answer.body).toBe(200);
      expect(answer.json().answer).toMatchObject({ score: 100, elapsedMs: Math.floor(delay + extra) });
      expect(answer.json().completed).toBe(index === 4);
    }
    return (await get(`/api/games/${run.id}`, cookie)).json();
  }

  it("freezes a common pack, reserves concurrent starts and exposes only the current task", async () => {
    const a = await guest(), b = await guest();
    const [one, concurrent] = await Promise.all([start(a), start(a)]);
    expect(one.statusCode, one.body).toBe(200);
    const run = one.json();
    expect(concurrent.json().id).toBe(run.id);
    expect(run.challenge).toEqual({ day: geoDailyDate(), count: 5, mode: "daily", rounds: {} });
    const other = (await start(b)).json();
    expect(other.challenge).toEqual(run.challenge);
    const first = await post(`/api/games/${run.id}/perception/start`, a, { index: 0 });
    const second = await post(`/api/games/${other.id}/perception/start`, b, { index: 0 });
    expect(first.json().task).toEqual(second.json().task);
    expect(first.json()).not.toHaveProperty("tasks");
    expect((await get(`/api/games/${run.id}`, b)).statusCode).toBe(404);
    expect((await post(`/api/games/${run.id}/perception/start`, a, { index: 1 })).statusCode).toBe(409);
    expect((await post("/api/games", a, { game: "perception", mode: "classic" })).statusCode).toBe(400);
  });

  it("keeps the first presentation clock, validates answers, and preserves idempotent retries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const cookie = await guest(), run = (await start(cookie)).json();
    const startUrl = `/api/games/${run.id}/perception/start`, answerUrl = `/api/games/${run.id}/answers`;
    expect((await post(answerUrl, cookie, { index: 0, answer: { value: 60 } })).statusCode).toBe(400);
    const issued = (await post(startUrl, cookie, { index: 0 })).json();
    expect((await post(answerUrl, cookie, { index: 0, answer: exactInput(issued.task) })).statusCode).toBe(400);
    vi.setSystemTime(issued.startedAt + 4000);
    expect((await post(startUrl, cookie, { index: 0 })).json().startedAt).toBe(issued.startedAt);
    const accepted = (await post(answerUrl, cookie, { index: 0, answer: exactInput(issued.task) })).json();
    expect(accepted.answer).toMatchObject({ score: 100, elapsedMs: 4000 });
    const retry = (await post(answerUrl, cookie, { index: 0, answer: { value: 1 } })).json();
    expect(retry.answer).toEqual(accepted.answer);
    expect((await post(startUrl, cookie, { index: 0 })).statusCode).toBe(409);
  });

  it("claims at OAuth, ranks accuracy then server time and keeps old daily results after midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const day = "2026-11-10";
    vi.setSystemTime(new Date(day + "T12:00:00Z"));
    const cookie = await guest(), run = (await start(cookie)).json();
    const completed = await finish(cookie, run);
    expect(completed).toMatchObject({ completed: true, published: false, score: 500 });
    expect((await start(cookie)).json().id).toBe(run.id);
    expect((await get("/api/me", cookie)).json().trials.perception.completed).toBe(true);
    const signed = await login(cookie, "perception-winner");
    expect((await get(`/api/games/${run.id}`, signed)).json().published).toBe(true);
    const board = "/api/leaderboard?game=perception&mode=daily";
    expect((await get(board, signed)).json()).toMatchObject({ day, total: 1, mine: { score: 500, place: 1 } });
    const other = await login(await guest(), "perception-slower");
    const second = (await start(other)).json();
    await finish(other, second, 1000);
    const result = (await get(board, other)).json();
    expect(result.mine.place).toBe(2);
    expect(result.entries[0].elapsedMs).toBeLessThan(result.entries[1].elapsedMs);
    expect((await get("/api/perception/daily", signed)).json().leaders).toHaveLength(2);
    const otherBrowser = await login(await guest(), "perception-winner");
    expect((await start(otherBrowser)).json().id).toBe(run.id);
    vi.setSystemTime(new Date(day + "T21:00:01Z"));
    expect((await get(board, signed)).json()).toMatchObject({ total: 0, day: "2026-11-11" });
    expect((await get(board + "&day=" + day, signed)).json().total).toBe(2);
    const tomorrow = (await start(signed)).json();
    expect(tomorrow.id).not.toBe(run.id);
    expect(tomorrow.challenge.day).toBe("2026-11-11");
    expect((await start(cookie)).statusCode).toBe(403);
  });

  it("does not replace an account's first daily attempt with a second guest result", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
    const signed = await login(await guest(), "perception-first");
    const first = (await start(signed)).json();
    await finish(signed, first, 1000);
    const anonymous = await guest(), second = (await start(anonymous)).json();
    await finish(anonymous, second);
    const claimant = await login(anonymous, "perception-first");
    expect((await get(`/api/games/${second.id}`, claimant)).json().published).toBe(false);
    expect((await post(`/api/games/${second.id}/publish`, claimant)).statusCode).toBe(409);
    expect((await start(claimant)).json().id).toBe(first.id);
    const rows = await pool.query("SELECT id FROM playne_games WHERE game='perception' AND owner_id=(SELECT owner_id FROM playne_games WHERE id=$1) AND challenge->>'day'='2026-11-09'", [first.id]);
    expect(rows.rows).toEqual([{ id: first.id }]);
  });
  it("shares a real daily score with an image, reuses today's attempt and expires old invites", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const day = "2026-11-08";
    vi.setSystemTime(new Date(day + "T12:00:00Z"));
    const author = await guest(), run = (await start(author)).json();
    await finish(author, run);
    const stranger = await guest();
    expect((await post("/api/challenges", stranger, { runId: run.id })).statusCode).toBe(404);
    const shared = await post("/api/challenges", author, { runId: run.id, score: 1 });
    expect(shared.statusCode, shared.body).toBe(200);
    const link = shared.json();
    expect(link).toMatchObject({ game: "perception", gameName: "Приметь", score: 500, maxScore: 500, day, mode: "daily", isTodayDaily: true });
    expect(link).not.toHaveProperty("tasks");
    expect(link).not.toHaveProperty("answers");
    expect(new URL(link.url).pathname).toMatch(/^\/c\/[A-Za-z0-9_-]{16}$/);
    expect((await post("/api/challenges", author, { runId: run.id })).json().token).toBe(link.token);
    const png = await get(new URL(link.imageUrl).pathname);
    expect(png.statusCode, png.body.slice(0, 100)).toBe(200);
    expect(png.rawPayload.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.rawPayload.readUInt32BE(16)).toBe(1200);
    expect(png.rawPayload.readUInt32BE(20)).toBe(630);
    const landing = await get(new URL(link.url).pathname);
    expect(landing.body).toContain(`/perception/?challenge=${link.token}`);
    expect(landing.body).toContain("Принять вызов");
    const accept = () => post("/api/games", stranger, { game: "perception", mode: "daily", challenge: link.token });
    const [first, duplicate] = await Promise.all([accept(), accept()]);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().id).toBe(duplicate.json().id);
    expect(first.json().challenge.day).toBe(day);
    expect(first.json().private).not.toBe(true);
    await finish(stranger, first.json());
    expect((await accept()).json()).toMatchObject({ id: first.json().id, completed: true });
    expect((await post("/api/games", stranger, { game: "perception", mode: "daily", challenge: link.token, retry: first.json().id })).statusCode).toBe(400);
    const returnPath = `/perception/?challenge=${link.token}&mode=daily`;
    expect(safeReturn(returnPath)).toBe(returnPath);
    vi.setSystemTime(new Date(day + "T21:00:01Z"));
    const archived = await get(`/api/challenges/${link.token}`);
    expect(archived.json()).toMatchObject({ day, score: 500, isTodayDaily: false });
    const oldLanding = await get(new URL(link.url).pathname);
    expect(oldLanding.body).toContain("Этот день завершён");
    expect(oldLanding.body).toContain('href="/perception/">Играть сегодня');
    expect(oldLanding.body).not.toContain(`href="/perception/?challenge=${link.token}"`);
    const rejected = await accept();
    expect(rejected.statusCode, rejected.body).toBe(409);
    expect(rejected.body).toContain("Этот день завершён");
  });

});
