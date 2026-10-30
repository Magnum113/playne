import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { readPlayStreak, readStreakLeaderboard } from "../server/play-streaks";
import { buildApp } from "../server/app";
const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)(
  "Play streaks: calendar dates and public ranking",
  () => {
    let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const day = "2026-10-30";
    const player = async (name = "Игрок") =>
      (
        await pool.query(
          "INSERT INTO playne_users(nickname) VALUES($1) RETURNING id",
          [name],
        )
      ).rows[0].id as string;
    async function seed(
      owner: string | null,
      dates: string[],
      options: {
        published?: boolean;
        game?: string;
        mode?: string;
        browser?: string;
        comparison?: boolean;
      } = {},
    ) {
      return (
        await pool.query(
          `INSERT INTO playne_games(owner_id,browser_hash,game,mode,challenge,answers,score_units,completed_at,published_at,expires_at)
   SELECT $1,$2,$3,$4,$5,'[{"score":100,"private":"answer"}]'::jsonb,1000,d::timestamptz,CASE WHEN $6 THEN d::timestamptz END,now()+interval '365 days'
   FROM unnest($7::text[]) d RETURNING id`,
          [
            owner,
            options.browser ?? "b".repeat(64),
            options.game ?? "circle",
            options.mode ?? "classic",
            JSON.stringify({
              comparison: !!options.comparison,
              comparisonToken: "not-public",
              secret: "never-expose",
            }),
            !!options.published,
            dates.map((d) => (d.includes("T") ? d : d + "T10:00:00Z")),
          ],
        )
      ).rows;
    }
    const personal = (id: string, d = day) =>
      readPlayStreak(pool, { userId: id, browserHash: "unused" }, d);
    beforeAll(async () => {
      if (!db || new URL(db).pathname !== "/playne_test")
        throw Error("Isolated database required");
      admin = new Pool({ connectionString: db });
      await admin.query("CREATE SCHEMA IF NOT EXISTS playne_streak_test");
      pool = new Pool({
        connectionString: db,
        options: "-c search_path=playne_streak_test",
      });
      await pool.query(readFileSync("server/schema.sql", "utf8"));
      app = await buildApp(pool, {
        origin: "https://streak.test",
        yandexId: "test",
        yandexSecret: "test",
        redirect: "https://streak.test/api/auth/yandex/callback",
        secure: true,
        revision: "streak-test",
      });
    });
    beforeEach(async () => {
      await pool.query(
        "TRUNCATE playne_users,playne_games,playne_guest_trials CASCADE",
      );
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      await admin?.query("DROP SCHEMA playne_streak_test CASCADE");
      await admin?.end();
    });
    it("counts distinct days, carries yesterday through today, and adds today once", async () => {
      const id = await player();
      expect(await personal(id)).toEqual({
        current: 0,
        best: 0,
        playedToday: false,
        lastDay: null,
      });
      await seed(
        id,
        ["2026-10-26", "2026-10-27", "2026-10-27", "2026-10-28", "2026-10-29"],
        { mode: "practice" },
      );
      expect(await personal(id)).toEqual({
        current: 4,
        best: 4,
        playedToday: false,
        lastDay: "2026-10-29",
      });
      await seed(id, [day, day], { comparison: true });
      expect(await personal(id)).toEqual({
        current: 5,
        best: 5,
        playedToday: true,
        lastDay: day,
      });
      expect((await personal(id, "2026-10-31")).current).toBe(5);
      expect(await personal(id, "2026-11-01")).toMatchObject({
        current: 0,
        best: 5,
      });
    });
    it("keeps the best series after a break and ignores incomplete and future runs", async () => {
      const id = await player();
      await seed(id, [
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        day,
        "2026-10-31",
      ]);
      await pool.query(
        "INSERT INTO playne_games(owner_id,browser_hash,game,challenge) VALUES($1,'other','circle','{}'::jsonb)",
        [id],
      );
      expect(await personal(id)).toEqual({
        current: 1,
        best: 4,
        playedToday: true,
        lastDay: day,
      });
    });
    it("uses Moscow midnight and crosses year boundaries independently of SQL session timezone", async () => {
      const id = await player();
      await seed(id, [
        "2025-12-30T21:00:00Z",
        "2025-12-31T21:00:00Z",
        "2026-01-01T20:59:59Z",
        "2026-01-01T21:00:00Z",
      ]);
      const client = await pool.connect();
      try {
        await client.query("SET TIME ZONE 'Pacific/Honolulu'");
        expect(
          await readPlayStreak(
            client,
            { userId: id, browserHash: "none" },
            "2026-01-02",
          ),
        ).toMatchObject({ current: 3, best: 3, playedToday: true });
      } finally {
        await client.query("RESET TIME ZONE");
        client.release();
      }
    });
    it("restores a 410-day account series without a history-page or month limit", async () => {
      const id = await player();
      const dates = Array.from({ length: 410 }, (_, i) =>
        new Date(Date.parse(day + "T12:00:00Z") - (409 - i) * 86400000)
          .toISOString()
          .slice(0, 10),
      );
      await seed(id, dates, { published: true });
      expect(await personal(id)).toMatchObject({ current: 410, best: 410 });
      expect(
        (await readStreakLeaderboard(pool, id, 1, 5, day)).mine,
      ).toMatchObject({ days: 410, place: 1, best: 410 });
    });
    it("ranks only active published players, includes practice in series, shares ties and scopes mine", async () => {
      const a = await player("Первый"),
        b = await player("Второй"),
        c = await player("Третий"),
        privateId = await player("Личная история"),
        inactive = await player("Бывший лидер");
      const five = [
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        day,
      ];
      for (const id of [a, b, c, inactive])
        await seed(id, ["2025-01-01"], { published: true });
      await seed(a, five, { game: "flash", mode: "practice" });
      await seed(b, five, { comparison: true });
      await seed(c, ["2026-10-29", day]);
      await seed(privateId, five);
      await seed(inactive, ["2026-10-20", "2026-10-21"]);
      const result = await readStreakLeaderboard(pool, c, 1, 2, day);
      expect(result.total).toBe(3);
      expect(result.entries.map((e) => [e.days, e.place])).toEqual([
        [5, 1],
        [5, 1],
      ]);
      expect(result.mine).toMatchObject({
        nickname: "Третий",
        days: 2,
        place: 3,
        isMe: true,
      });
      expect(
        (await readStreakLeaderboard(pool, null, 2, 2, day)).entries[0],
      ).toMatchObject({ place: 3, isMe: false });
      expect(
        (await readStreakLeaderboard(pool, privateId, 1, 5, day)).mine,
      ).toBeNull();
      for (const secret of [
        a,
        b,
        c,
        privateId,
        "never-expose",
        "not-public",
        "answer",
        "owner_id",
      ])
        expect(JSON.stringify(result)).not.toContain(secret);
    });
    it("includes only the guest's own unclaimed trials and private comparisons", async () => {
      const id = await player();
      const own = "a".repeat(64),
        other = "c".repeat(64);
      const trial = (await seed(null, ["2026-10-28"], { browser: own }))[0].id;
      await pool.query(
        "INSERT INTO playne_guest_trials(browser_hash,game,run_id) VALUES($1,'circle',$2)",
        [own, trial],
      );
      await seed(null, ["2026-10-29", day], { browser: own, comparison: true });
      await seed(null, ["2026-10-27"], { browser: other, comparison: true });
      await seed(id, ["2026-10-26"], { browser: own });
      expect(
        await readPlayStreak(pool, { browserHash: own }, day),
      ).toMatchObject({ current: 3, best: 3 });
      await pool.query("UPDATE playne_games SET owner_id=$1 WHERE id=$2", [
        id,
        trial,
      ]);
      expect(
        await readPlayStreak(pool, { browserHash: own }, day),
      ).toMatchObject({ current: 2, best: 2 });
    });
    it.each([
      "page=0",
      "page=-1",
      "page=1.2",
      "page=no",
      "limit=0",
      "limit=51",
      "page=10001",
    ])("rejects invalid paging %s", async (query) => {
      const r = await app.inject("/api/play/streaks?" + query);
      expect(r.statusCode).toBe(400);
    });
    it("returns a no-store anonymous leaderboard without manufacturing activity", async () => {
      const response = await app.inject("/api/play/streaks");
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toMatchObject({
        entries: [],
        mine: null,
        total: 0,
        page: 1,
        limit: 5,
      });
    });
  },
);
