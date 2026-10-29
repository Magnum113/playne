import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../server/app";
import { scoreVersion, type GameId } from "../server/scoring";
const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)("Overall leaderboard PostgreSQL", () => {
  let pool: Pool, admin: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const addUser = async (name = "Игрок") =>
    (
      await pool.query(
        "INSERT INTO playne_users(nickname) VALUES($1) RETURNING id",
        [name],
      )
    ).rows[0].id as string;
  async function run(
    owner: string | null,
    game: GameId,
    score: number,
    mode = "classic",
    extra: {
      version?: number;
      published?: boolean;
      answers?: any[];
      at?: string;
    } = {},
  ) {
    const published = extra.published !== false;
    return (
      await pool.query(
        `INSERT INTO playne_games(browser_hash,owner_id,game,mode,version,challenge,answers,score_units,completed_at,published_at)
   VALUES('overall-test',$1,$2,$3,$4,'{}',$5,$6,$7,CASE WHEN $8 THEN $7::timestamptz ELSE NULL END) RETURNING id`,
        [
          owner,
          game,
          mode,
          extra.version ?? scoreVersion(game),
          JSON.stringify(extra.answers ?? []),
          Math.round(score * 10),
          extra.at ?? "2020-01-01T12:00:00Z",
          published,
        ],
      )
    ).rows[0].id;
  }
  const board = async (query = "") => {
    const r = await app.inject("/api/leaderboard?game=overall" + query);
    expect(r.statusCode).toBe(200);
    return r.json();
  };
  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test")
      throw Error("Isolated test database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA IF NOT EXISTS playne_overall_test");
    pool = new Pool({
      connectionString: db,
      options: "-c search_path=playne_overall_test",
    });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(pool, {
      origin: "https://overall.test",
      yandexId: "test",
      yandexSecret: "test",
      redirect: "https://overall.test/api/auth/yandex/callback",
      secure: true,
      revision: "test",
    });
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE playne_users CASCADE");
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query("DROP SCHEMA playne_overall_test CASCADE");
    await admin?.end();
  });
  it("balances five games and counts only the best mode of each game", async () => {
    const id = await addUser();
    for (const [g, s, m] of [
      ["naglaz", 400, "classic"],
      ["circle", 95, "classic"],
      ["colorfle", 300, "classic"],
      ["colorfle", 450, "timed"],
      ["geo", 200, "classic"],
      ["geo", 480, "landmarks"],
      ["geo", 400, "moving"],
      ["pressure", 50, "classic"],
    ] as const)
      await run(id, g, s, m);
    const result = (await board()).entries[0];
    expect(result.score).toBe(4110);
    expect(result.gamesPlayed).toBe(5);
    expect(result.contributions).toHaveLength(5);
    expect(
      result.contributions.find((p: any) => p.game === "geo"),
    ).toMatchObject({ mode: "landmarks", points: 960 });
    expect(
      result.contributions.find((p: any) => p.game === "colorfle"),
    ).toMatchObject({ mode: "timed", points: 900 });
    expect(
      result.contributions.find((p: any) => p.game === "pressure").points,
    ).toBe(500);
  });
  it("includes historical and zero scores, with no weekly reset", async () => {
    const a = await addUser("Ноль"),
      b = await addUser("Рекорд");
    await run(a, "circle", 0);
    await run(b, "naglaz", 500);
    const result = await board("&period=week");
    expect(result.period).toBe("all");
    expect(result.total).toBe(2);
    expect(result.entries.map((e: any) => e.score)).toEqual([1000, 0]);
    expect(result.entries[1].gamesPlayed).toBe(1);
  });
  it("adds the sixth slot only for completed daily line runs, preserving existing contributions", async () => {
    const id = await addUser();
    for (const [game, score] of [
      ["naglaz", 500],
      ["circle", 100],
      ["colorfle", 500],
      ["geo", 500],
      ["pressure", 25000],
    ] as const)
      await run(id, game, score);
    const before = (await board()).entries[0];
    await run(id, "line", 500, "practice");
    expect((await board()).entries[0].score).toBe(before.score);
    await run(id, "line", 500);
    const result = await board();
    expect(result.version).toBe(3);
    expect(result.entries[0].gamesPlayed).toBe(6);
    expect(result.entries[0].score).toBe(before.score + 1000);
    expect(result.entries[0].score).toBeLessThanOrEqual(7000);
    expect(
      result.entries[0].contributions.filter((p: any) => p.game !== "line"),
    ).toEqual(before.contributions);
  });
  it("adds a capped seventh brain category while preserving all six legacy contributions", async () => {
    const id = await addUser();
    for (const [game, score] of [
      ["naglaz", 500],
      ["circle", 100],
      ["colorfle", 500],
      ["geo", 500],
      ["pressure", 25000],
      ["line", 500],
    ] as const)
      await run(id, game, score);
    const before = (await board()).entries[0];
    for (const game of ["flash", "rotate", "slide", "dispatch"] as const)
      await run(id, game, 500);
    const after = (await board()).entries[0];
    expect(after.gamesPlayed).toBe(7);
    expect(after.score).toBe(before.score + 1000);
    expect(after.score).toBeLessThanOrEqual(7000);
    expect(after.contributions.filter((c: any) => c.game !== "brain")).toEqual(
      before.contributions,
    );
    for (const game of ["flash", "rotate", "slide", "dispatch"] as const)
      await run(id, game, 25000);
    expect((await board()).entries[0].score).toBe(after.score);
    const brain = (await app.inject("/api/leaderboard?game=brain")).json();
    expect(brain.entries[0].score).toBe(1000);
    expect(
      brain.entries[0].contributions.every((c: any) => c.points <= 250),
    ).toBe(true);
  });
  it("floors only the final brain aggregate, preserving half points in game contributions", async () => {
    const id = await addUser();
    for (const game of ["flash", "rotate", "slide"] as const)
      await run(id, game, 499);
    await run(id, "dispatch", 500);
    const brain = (await app.inject("/api/leaderboard?game=brain")).json()
      .entries[0];
    expect(brain.score).toBe(998);
    expect(brain.contributions.map((c: any) => c.points)).toEqual([
      249.5, 249.5, 249.5, 250,
    ]);
    expect((await board()).entries[0].contributions[0]).toMatchObject({
      game: "brain",
      points: 998,
      score: 998,
    });
  });
  it("keeps scores stable on replay, rewards improvements, and shares tied places", async () => {
    const a = await addUser("Первый"),
      b = await addUser("Второй");
    await run(a, "naglaz", 400, "classic", { at: "2020-01-01T00:00:00Z" });
    await run(b, "naglaz", 400, "classic", { at: "2021-01-01T00:00:00Z" });
    await run(a, "naglaz", 200);
    await run(a, "naglaz", 400, "classic", { at: "2025-01-01T00:00:00Z" });
    expect(
      (await board()).entries.map((e: any) => [e.nickname, e.place, e.score]),
    ).toEqual([
      ["Первый", 1, 800],
      ["Второй", 1, 800],
    ]);
    await run(b, "naglaz", 450);
    expect(
      (await board()).entries.map((e: any) => [e.nickname, e.place, e.score]),
    ).toEqual([
      ["Второй", 1, 900],
      ["Первый", 2, 800],
    ]);
  });
  it("uses a fixed, bounded pressure curve and whole rating points", async () => {
    for (const [name, levels] of [
      ["Пятьдесят", 50],
      ["Сто", 100],
      ["Много", 25000],
    ] as const) {
      await run(await addUser(name), "pressure", levels);
    }
    expect((await board()).entries.map((e: any) => e.score)).toEqual([
      998, 666, 500,
    ]);
    for (const e of (await board()).entries)
      expect(Number.isInteger(e.score)).toBe(true);
  });
  it("excludes unpublished guests, incompatible scoring versions and unsupported modes", async () => {
    const id = await addUser();
    await run(id, "naglaz", 500, "classic", { published: false });
    await run(null, "circle", 99, "classic", { published: false });
    await run(id, "colorfle", 500, "classic", {
      version: scoreVersion("colorfle") - 1,
    });
    await run(id, "geo", 500, "classic", { version: 1 });
    await run(id, "circle", 100, "unknown");
    expect((await board()).total).toBe(0);
  });
  it("normalizes legacy perfect geography runs consistently with current records", async () => {
    const old = await addUser("Старый"),
      newer = await addUser("Новый");
    await run(old, "geo", 25000, "classic", {
      version: 2,
      answers: Array.from({ length: 5 }, () => ({ score: 5000 })),
    });
    await run(newer, "geo", 500);
    const result = await board();
    expect(result.entries.map((e: any) => e.score)).toEqual([1000, 1000]);
    expect(result.entries[0].contributions[0].score).toBe(500);
    const perGame = await app.inject(
      "/api/leaderboard?game=geo&version=4&period=all",
    );
    expect(perGame.json().entries.every((e: any) => e.score === 500)).toBe(
      true,
    );
  });
  it("returns consistent top-five, paginated totals and the authenticated user without exposing identity fields", async () => {
    const users = [];
    for (let i = 0; i < 27; i++) {
      const id = await addUser("Игрок " + i);
      users.push(id);
      await run(id, "naglaz", i * 10);
    }
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(token).digest("hex"), users[0]],
    );
    const top = (
      await app.inject({
        url: "/api/leaderboard?game=overall&limit=5",
        headers: { cookie: "playne_session=" + token },
      })
    ).json();
    expect(top.total).toBe(27);
    expect(top.entries).toHaveLength(5);
    expect(top.mine).toMatchObject({
      nickname: "Игрок 0",
      score: 0,
      place: 27,
      isMe: true,
    });
    expect(top.entries.every((e: any) => !e.isMe)).toBe(true);
    expect(top.entries[0]).not.toHaveProperty("id");
    expect(top.entries[0]).not.toHaveProperty("email");
    const second = await board("&page=2");
    expect(second.entries).toHaveLength(2);
    expect(second.entries[1].score).toBe(0);
    expect(second.mine).toBeNull();
    await pool.query("DELETE FROM playne_users WHERE id=$1", [users[0]]);
    expect((await board()).total).toBe(26);
  });
  it("rejects invalid pagination and excessive top-list sizes", async () => {
    for (const query of [
      "&page=0",
      "&page=1.5",
      "&page=10001",
      "&limit=100",
      "&limit=0",
      "&limit=NaN",
    ])
      expect(
        (await app.inject("/api/leaderboard?game=overall" + query)).statusCode,
      ).toBe(400);
  });
});
