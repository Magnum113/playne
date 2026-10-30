import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../server/app";
import { readPlayActivity, readPlayMilestones, readPlayProgress } from "../server/play-progress";

const db = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-10-30T12:00:00Z");

(db ? describe : describe.skip)("Personal play progress: PostgreSQL", () => {
  let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const cookies = (response: any) => response.cookies.map((cookie: any) => `${cookie.name}=${cookie.value}`).join("; ");
  const guest = async () => cookies(await app.inject("/api/me"));
  const get = (cookie: string, url = "/api/play/progress") => app.inject({ url, headers: { cookie } });

  async function signed() {
    const id = (await pool.query("INSERT INTO playne_users(nickname) VALUES('Игрок') RETURNING id")).rows[0].id;
    const token = randomBytes(32).toString("base64url");
    await pool.query("INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [hash(token), id]);
    return { id, cookie: `${await guest()}; playne_session=${token}` };
  }

  async function run(options: {
    owner?: string;
    browserHash?: string;
    game?: string;
    mode?: string;
    completedAt?: string;
    day?: string;
    rounds?: number;
    published?: boolean;
  } = {}) {
    const game = options.game ?? "flash";
    const total = game === "circle" || game === "pressure" ? 1 : 5;
    const completed = options.completedAt ?? null;
    const rounds = options.rounds ?? (completed ? total : 0);
    const challenge = { day: options.day ?? "2026-10-30", seed: "private-seed", cells: [1, 2, 3], difficulty: 2 };
    const { rows } = await pool.query(
      `INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,answers,score_units,completed_at,published_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9 THEN $8::timestamptz ELSE NULL END) RETURNING id`,
      [options.browserHash ?? "same-browser", options.owner ?? null, game, options.mode ?? "classic",
        JSON.stringify(challenge), JSON.stringify(Array.from({ length: rounds }, () => ({ score: 100, secret: "private-answer" }))),
        completed ? 5000 : null, completed, options.published ?? false],
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test") throw new Error("Isolated test database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA IF NOT EXISTS playne_progress_test");
    pool = new Pool({ connectionString: db, options: "-c search_path=playne_progress_test" });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(pool, {
      origin: "https://progress.test", yandexId: "test", yandexSecret: "test",
      redirect: "https://progress.test/api/auth/yandex/callback", secure: true, revision: "progress-test",
    }, (async (url: any) => new Response(JSON.stringify(String(url).includes("/token")
      ? { access_token: "test" }
      : { id: "progress-identity", client_id: "test", first_name: "Игрок" }))) as typeof fetch);
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await pool.query("TRUNCATE playne_users,playne_games,playne_guest_trials,playne_brain_days,playne_line_days CASCADE");
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query("DROP SCHEMA playne_progress_test CASCADE");
    await admin?.end();
  });

  it("returns an empty private Monday–Sunday week and never creates a game", async () => {
    const response = await get(await guest());
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const data = response.json();
    expect(data.day).toBe("2026-10-30");
    expect(data.weekStart).toBe("2026-10-26");
    expect(data.week.map((day: any) => day.day)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(data.last7Days[0].day).toBe("2026-10-24");
    expect(data.weeklyDays).toBe(0);
    expect(data.milestones).toEqual({ completedWeeks: 0, activeDaysThisMonth: 0, totalActiveDays: 0, tenDayMonths: 0 });
    expect(data.daily).toEqual({});
    expect(data.recentCompletions).toEqual([]);
    expect((await pool.query("SELECT count(*)::int AS n FROM playne_games")).rows[0].n).toBe(0);
  });

  it("counts every game and mode while deduplicating games and dates; ignores incomplete and future runs", async () => {
    const player = await signed();
    for (const game of ["naglaz", "circle", "colorfle", "geo", "pressure", "line", "flash", "rotate", "slide", "dispatch"])
      await run({ owner: player.id, game, mode: game === "flash" ? "practice" : "classic", completedAt: "2026-10-29T10:00:00Z", day: "2026-10-29" });
    await run({ owner: player.id, game: "flash", mode: "practice", completedAt: "2026-10-29T11:00:00Z" });
    await run({ owner: player.id, game: "geo", mode: "landmarks", completedAt: "2026-10-27T11:00:00Z" });
    await run({ owner: player.id, game: "slide", rounds: 4 });
    await run({ owner: player.id, completedAt: "2026-10-31T10:00:00Z", day: "2026-10-31" });
    const data = (await get(player.cookie)).json();
    expect(data.week.find((day: any) => day.day === "2026-10-29").gamesCompleted).toBe(10);
    expect(data.weeklyDays).toBe(2);
    expect(data.goal).toEqual({ days: 3, completedDays: 2 });
    expect(data.milestones.totalActiveDays).toBe(2);
    expect(data.week.slice(5).every((day: any) => day.gamesCompleted === 0)).toBe(true);
    const brain = (await get(player.cookie, "/api/brain/progress")).json();
    expect(brain.last7Days).toEqual(data.last7Days);
    expect(brain.weeklyDays).toBe(2);
    expect(brain.today.results.flash).toBeNull();
    expect(brain.today.results.slide.completed).toBe(false);
  });

  it("keeps yesterday's four completions after Moscow midnight, including practice", async () => {
    const player = await signed();
    for (const game of ["flash", "rotate", "slide", "dispatch"])
      await run({ owner: player.id, game, mode: "practice", completedAt: "2026-10-29T20:59:59Z", day: "2026-10-29" });
    await run({ owner: player.id, game: "circle", completedAt: "2026-10-29T21:00:00Z" });
    const data = (await get(player.cookie)).json();
    expect(data.last7Days.find((day: any) => day.day === "2026-10-29").gamesCompleted).toBe(4);
    expect(data.last7Days.at(-1).gamesCompleted).toBe(1);
    expect(data.weeklyDays).toBe(2);
    expect(data.daily).toEqual({});
    const brain = (await get(player.cookie, "/api/brain/progress")).json();
    expect(brain.weeklyDays).toBe(2);
    expect(Object.values(brain.today.results).every((entry) => entry === null)).toBe(true);
  });

  it("retains lifetime weeks and ten-day months beyond the latest thirty results", async () => {
    const player = await signed();
    for (let date = 1; date <= 10; date++)
      await run({ owner: player.id, game: "circle", completedAt: `2025-12-${String(date).padStart(2, "0")}T12:00:00Z` });
    for (const date of [26, 27, 28])
      await run({ owner: player.id, game: "rotate", mode: "practice", completedAt: `2026-10-${date}T12:00:00Z` });
    for (let attempt = 0; attempt < 35; attempt++)
      await run({ owner: player.id, game: "flash", mode: "practice", completedAt: "2026-10-30T10:00:00Z" });
    const data = (await get(player.cookie)).json();
    expect(data.milestones).toEqual({ completedWeeks: 3, activeDaysThisMonth: 4, totalActiveDays: 14, tenDayMonths: 1 });
    expect(data.goal.completedDays).toBe(4);
    expect(data.recentCompletions).toHaveLength(32);
    expect(data.favorites[0]).toMatchObject({ game: "flash", completedRuns: 35 });
    expect(data.favorites.some((entry: any) => entry.game === "circle")).toBe(false);
  });

  it("uses Moscow bounds for the first rolling date regardless of the database session timezone", async () => {
    const player = await signed();
    await run({ owner: player.id, game: "circle", completedAt: "2026-10-23T20:59:59.999Z" });
    await run({ owner: player.id, game: "rotate", completedAt: "2026-10-23T21:00:00.000Z" });
    const client = await pool.connect();
    try {
      await client.query("SET TIME ZONE 'Pacific/Honolulu'");
      const viewer = { userId: player.id, browserHash: "unused" };
      const data = await readPlayActivity(client, viewer, "2026-10-30");
      expect(data.last7Days[0]).toMatchObject({ day: "2026-10-24", gamesCompleted: 1 });
      expect(data.weeklyDays).toBe(0);
      expect((await readPlayMilestones(client, viewer, "2026-10-30")).totalActiveDays).toBe(2);
    } finally {
      await client.query("RESET TIME ZONE");
      client.release();
    }
  });

  it("uses ISO Monday weeks across a year boundary and calendar months in Moscow", async () => {
    const player = await signed();
    for (const completedAt of ["2025-12-28T21:00:00Z", "2025-12-30T10:00:00Z", "2025-12-31T21:00:00Z"])
      await run({ owner: player.id, completedAt });
    const data = await readPlayProgress(pool, { userId: player.id, browserHash: "unused" }, new Date("2026-01-02T12:00:00Z"));
    expect(data.weekStart).toBe("2025-12-29");
    expect(data.weeklyDays).toBe(3);
    expect(data.milestones).toMatchObject({ completedWeeks: 1, activeDaysThisMonth: 1, totalActiveDays: 3 });
  });

  it("scopes accounts by owner and guests by their own trial IDs, without answers or challenge metadata", async () => {
    const first = await signed(), other = await signed();
    const guestCookie = await guest();
    const browserToken = /playne_guest=([^;]+)/.exec(guestCookie)![1];
    const browserHash = hash(browserToken);
    const trial = await run({ browserHash, game: "flash", completedAt: "2026-10-29T10:00:00Z" });
    await pool.query("INSERT INTO playne_guest_trials(browser_hash,game,run_id) VALUES($1,'flash',$2)", [browserHash, trial]);
    const unlisted = await run({ browserHash, game: "rotate", completedAt: "2026-10-29T10:00:00Z" });
    const firstId = await run({ owner: first.id, game: "line", completedAt: "2026-10-28T10:00:00Z" });
    const otherId = await run({ owner: other.id, browserHash, game: "circle", completedAt: "2026-10-27T10:00:00Z" });
    const guestData = (await get(guestCookie)).json();
    expect(guestData.recentCompletions.map((entry: any) => entry.id)).toEqual([trial]);
    const firstData = (await get(first.cookie)).json();
    expect(firstData.recentCompletions.map((entry: any) => entry.id)).toEqual([firstId]);
    const serialized = JSON.stringify(firstData);
    for (const secret of ["private-seed", "private-answer", "\"cells\"", "browser_hash", "owner_id", trial, unlisted, otherId])
      expect(serialized).not.toContain(secret);
  });

  it("exposes today's five daily statuses only, retaining the full-round completion boundary", async () => {
    const player = await signed();
    const expected: Record<string, any> = {};
    for (const [index, game] of ["line", "flash", "rotate", "slide", "dispatch"].entries()) {
      const id = await run({ owner: player.id, game, rounds: index, day: "2026-10-30" });
      expected[game] = { id, completed: false, completedRounds: index, totalRounds: 5 };
    }
    await run({ owner: player.id, game: "line", mode: "practice", completedAt: "2026-10-30T10:00:00Z" });
    await run({ owner: player.id, game: "circle", completedAt: "2026-10-30T10:00:00Z" });
    const data = (await get(player.cookie)).json();
    expect(data.daily).toEqual(expected);
    expect(data.weeklyDays).toBe(1);
    await pool.query("UPDATE playne_games SET completed_at=$1,score_units=5000,answers=$2 WHERE id=$3", ["2026-10-30T11:00:00Z", JSON.stringify(Array.from({ length: 5 }, () => ({ score: 100 }))), expected.line.id]);
    const finished = (await get(player.cookie)).json();
    expect(finished.daily.line).toEqual({ id: expected.line.id, completed: true, completedRounds: 5, totalRounds: 5 });
    expect(finished.weeklyDays).toBe(1);
  });

  it("preserves guest completion dates and achievements when OAuth claims the results", async () => {
    const cookie = await guest();
    const browserHash = hash(/playne_guest=([^;]+)/.exec(cookie)![1]);
    for (const game of ["line", "flash"]) {
      const id = await run({ browserHash, game, mode: game === "flash" ? "practice" : "classic", completedAt: "2026-10-29T10:00:00Z", day: "2026-10-29" });
      await pool.query("INSERT INTO playne_guest_trials(browser_hash,game,run_id) VALUES($1,$2,$3)", [browserHash, game, id]);
      if (game === "line")
        await pool.query("INSERT INTO playne_line_days(day,browser_hash,run_id) VALUES('2026-10-29',$1,$2)", [browserHash, id]);
    }
    const before = (await get(cookie)).json();
    const login = await get(cookie, "/api/auth/yandex/start?return=%2Fbrain%2F");
    const state = new URL(login.headers.location!).searchParams.get("state");
    const callback = await get(cookie, `/api/auth/yandex/callback?state=${state}&code=test`);
    expect(callback.headers.location).toContain("auth=success");
    const after = (await get(cookies(callback))).json();
    expect(after.last7Days).toEqual(before.last7Days);
    expect(after.milestones).toEqual(before.milestones);
    expect(after.milestones.totalActiveDays).toBe(1);
    expect(after.recentCompletions).toEqual(before.recentCompletions);
    expect(after.recentCompletions.every((entry: any) => entry.completedAt === "2026-10-29T10:00:00.000Z")).toBe(true);
  });

  it("merges unclaimed guest comparisons on login without publishing them or exposing claimed days after logout", async () => {
    const cookie = await guest();
    const browserHash = hash(/playne_guest=([^;]+)/.exec(cookie)![1]);
    const ids = [];
    for (const date of ["2026-10-29T10:00:00Z", "2026-10-30T10:00:00Z"])
      ids.push(await run({ browserHash, game: "circle", completedAt: date }));
    await pool.query(
      "UPDATE playne_games SET challenge=challenge || '{\"comparison\":true}'::jsonb WHERE id=ANY($1::uuid[])",
      [ids],
    );
    const before = (await get(cookie)).json();
    expect(before.streak).toMatchObject({
      current: 2,
      best: 2,
      playedToday: true,
    });
    const login = await get(
      cookie,
      "/api/auth/yandex/start?return=%2Fbrain%2F",
    );
    const state = new URL(login.headers.location!).searchParams.get("state");
    const callback = await get(
      cookie,
      `/api/auth/yandex/callback?state=${state}&code=test`,
    );
    const after = (await get(cookies(callback))).json();
    expect(after.streak).toEqual(before.streak);
    const rows = (
      await pool.query(
        "SELECT owner_id,published_at FROM playne_games WHERE id=ANY($1::uuid[])",
        [ids],
      )
    ).rows;
    expect(rows.every((row) => !!row.owner_id && !row.published_at)).toBe(true);
    expect((await get(cookie)).json().streak.current).toBe(0);
    expect(
      (await get(cookies(callback), "/api/play/streaks")).json().total,
    ).toBe(0);
  });

  it("keeps expired unpublished account completions and milestones through startup cleanup, deleting incomplete and guest runs", async () => {
    const player = await signed();
    const retained: string[] = [];
    for (const [index, game] of ["circle", "line", "flash"].entries())
      retained.push(await run({ owner: player.id, game, mode: game === "line" ? "practice" : "classic", completedAt: `2026-10-${27 + index}T10:00:00Z` }));
    const incomplete = await run({ owner: player.id, game: "slide", rounds: 4 });
    const expiredGuest = await run({ game: "rotate", completedAt: "2026-10-29T11:00:00Z" });
    await pool.query("UPDATE playne_games SET expires_at=now()-interval '1 day' WHERE id=ANY($1::uuid[])", [[...retained, incomplete, expiredGuest]]);
    const before = (await get(player.cookie)).json();
    expect(before.milestones).toMatchObject({ completedWeeks: 1, totalActiveDays: 3 });

    await app.close();
    app = await buildApp(pool, {
      origin: "https://progress.test", yandexId: "test", yandexSecret: "test",
      redirect: "https://progress.test/api/auth/yandex/callback", secure: true, revision: "progress-test",
    });
    const remaining = (await pool.query("SELECT id,published_at FROM playne_games")).rows;
    expect(remaining.map((entry) => entry.id).sort()).toEqual(retained.sort());
    expect(remaining.every((entry) => entry.published_at === null)).toBe(true);
    const after = (await get(player.cookie)).json();
    expect(after.milestones).toEqual(before.milestones);
    expect(after.weeklyDays).toBe(3);
    expect((await get(player.cookie, "/api/leaderboard?game=overall")).json().total).toBe(0);
  });
});
