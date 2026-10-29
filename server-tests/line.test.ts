import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../server/app";
import { hintLinePath, lineMoscowDate, type LinePuzzle } from "../src/line";
import { validateAnswer, safeReturn } from "../server/scoring";
const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)("One line server-owned daily game", () => {
  let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const origin = "https://line.test";
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const cookies = (response: any) =>
    response.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  const guest = async () => cookies(await app.inject("/api/me"));
  async function signed(name = "Игрок") {
    const id = (
      await pool.query(
        "INSERT INTO playne_users(nickname) VALUES($1) RETURNING id",
        [name],
      )
    ).rows[0].id;
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [hash(token), id],
    );
    return { id, cookie: `${await guest()}; playne_session=${token}` };
  }
  const post = (cookie: string, url: string, payload: any) =>
    app.inject({ method: "POST", url, headers: { origin, cookie }, payload });
  const start = (cookie: string, mode = "classic") =>
    post(cookie, "/api/games", { game: "line", mode });
  function solution(puzzle: LinePuzzle) {
    let path: number[] = [];
    while (path.length < puzzle.rows * puzzle.cols)
      path = hintLinePath(puzzle, path).path;
    return path;
  }
  async function finish(cookie: string, run: any) {
    for (let index = run.answers?.length ?? 0; index < 5; index++) {
      expect(
        (await post(cookie, `/api/games/${run.id}/line/start`, { index }))
          .statusCode,
      ).toBe(200);
      const response = await post(cookie, `/api/games/${run.id}/answers`, {
        index,
        answer: {
          path: solution(run.challenge.puzzles[index]),
          score: 1e9,
          elapsedMs: -1,
          hints: 0,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().answer.score).toBe(100);
      expect(response.json().completed).toBe(index === 4);
      if (index === 4) expect(response.json().score).toBe(500);
    }
  }
  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test")
      throw new Error("Isolated test database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA IF NOT EXISTS playne_line_test");
    pool = new Pool({
      connectionString: db,
      options: "-c search_path=playne_line_test",
    });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(
      pool,
      {
        origin,
        yandexId: "test",
        yandexSecret: "test",
        redirect: origin + "/api/auth/yandex/callback",
        secure: true,
        revision: "test",
      },
      (async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).includes("/token")
              ? { access_token: "test" }
              : { id: "line-identity", client_id: "test", first_name: "Игрок" },
          ),
        )) as typeof fetch,
    );
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE playne_users,playne_games,playne_guest_trials,playne_line_days CASCADE",
    );
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query("DROP SCHEMA playne_line_test CASCADE");
    await admin?.end();
  });
  it("issues the same Moscow daily pack to different browsers and distinct stage sizes", async () => {
    const a = (await start(await guest())).json(),
      b = (await start(await guest())).json();
    expect(a.challenge.day).toBe(lineMoscowDate());
    expect(a.challenge.puzzles).toEqual(b.challenge.puzzles);
    expect(a.challenge.puzzles.map((p: LinePuzzle) => p.rows)).toEqual([
      4, 5, 5, 6, 6,
    ]);
    expect(JSON.stringify(a.challenge)).not.toContain("solution");
    const cookie = await guest();
    const practice = await start(cookie, "practice");
    expect(practice.statusCode).toBe(200);
    expect(practice.json().mode).toBe("practice");
    expect((await start(cookie, "classic")).json().id).toBe(practice.json().id);
  });
  it("returns one account/day run under concurrent starts and preserves completed scores on replay", async () => {
    const player = await signed();
    const responses = await Promise.all([
      start(player.cookie),
      start(player.cookie),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(responses[0].json().id).toBe(responses[1].json().id);
    const run = responses[0].json();
    await finish(player.cookie, run);
    const replay = (await start(player.cookie)).json();
    expect(replay.id).toBe(run.id);
    expect(replay.completed).toBe(true);
    expect(replay.score).toBe(500);
    const otherBrowser = `playne_session=${player.cookie.split("playne_session=")[1]}`;
    const resumedElsewhere = await start(otherBrowser);
    expect(resumedElsewhere.json().id).toBe(run.id);
    const second = await signed();
    const sameBrowserOtherAccount = `${cookies(resumedElsewhere)}; playne_session=${second.cookie.split("playne_session=")[1]}`;
    expect((await start(sameBrowserOtherAccount)).statusCode).toBe(404);
    const practiceA = (await start(player.cookie, "practice")).json();
    const practiceB = (await start(player.cookie, "practice")).json();
    expect(practiceA.id).not.toBe(practiceB.id);
  });
  it("keeps the existing guest trial policy for daily and practice", async () => {
    const cookie = await guest(),
      run = (await start(cookie)).json();
    await finish(cookie, run);
    expect((await start(cookie)).statusCode).toBe(403);
    expect((await start(cookie, "practice")).statusCode).toBe(403);
    const me = (
      await app.inject({ url: "/api/me", headers: { cookie } })
    ).json();
    expect(me.trials.line).toMatchObject({ id: run.id, completed: true });
  });
  it("persists the original timer and charges idempotent canonical hints only on the server", async () => {
    const player = await signed(),
      run = (await start(player.cookie)).json();
    const url = `/api/games/${run.id}`;
    const path = solution(run.challenge.puzzles[0]);
    expect(
      (
        await post(player.cookie, url + "/answers", {
          index: 0,
          answer: { path },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post(player.cookie, url + "/line/start", { index: 1 })).statusCode,
    ).toBe(409);
    const first = (
      await post(player.cookie, url + "/line/start", { index: 0 })
    ).json();
    const again = (
      await post(player.cookie, url + "/line/start", { index: 0 })
    ).json();
    expect(again.startedAt).toBe(first.startedAt);
    const requestId = "11111111-1111-4111-8111-111111111111";
    const hint = (
      await post(player.cookie, url + "/line/hint", {
        index: 0,
        path: [999],
        requestId,
      })
    ).json();
    expect(hint.hints).toBe(1);
    expect(hint.path).toEqual([path[0]]);
    expect(
      (
        await post(player.cookie, url + "/line/hint", {
          index: 0,
          path: [],
          requestId,
        })
      ).json().hints,
    ).toBe(1);
    const saved = (
      await app.inject({ url, headers: { cookie: player.cookie } })
    ).json();
    expect(saved.challenge.rounds[0]).toEqual({
      startedAt: first.startedAt,
      hints: 1,
    });
    expect(saved.challenge.rounds[0]).not.toHaveProperty("requests");
    const scored = await post(player.cookie, url + "/answers", {
      index: 0,
      answer: { path, score: 100, hints: 0, elapsedMs: 0 },
    });
    expect(scored.statusCode).toBe(200);
    expect(scored.json().answer).toMatchObject({ score: 85, hints: 1 });
    expect(scored.json().answer.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(
      (
        await post(player.cookie, url + "/line/hint", {
          index: 0,
          path,
          requestId: "22222222-2222-4222-8222-222222222222",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(player.cookie, url + "/answers", {
          index: 0,
          answer: { path: [] },
        })
      ).json().answer.score,
    ).toBe(85);
  });
  it("rejects invalid paths and retains base points for slow valid solutions", async () => {
    const player = await signed(),
      run = (await start(player.cookie)).json();
    await post(player.cookie, `/api/games/${run.id}/line/start`, { index: 0 });
    for (const path of [[], [0, 0], [1e9], "bad", null])
      expect(
        (
          await post(player.cookie, `/api/games/${run.id}/answers`, {
            index: 0,
            answer: { path },
          })
        ).statusCode,
      ).toBe(400);
    const challenge = {
      ...run.challenge,
      rounds: { 0: { startedAt: 1000, hints: 0 } },
    };
    expect(
      validateAnswer(
        "line",
        challenge,
        0,
        { path: solution(run.challenge.puzzles[0]), elapsedMs: 0 },
        86401000,
      ).score,
    ).toBe(80);
    expect(safeReturn("/line/?mode=practice")).toBe("/line/?mode=practice");
  });
  it("keeps practice in its own leaderboard and excludes it from overall", async () => {
    const player = await signed();
    const practice = (await start(player.cookie, "practice")).json();
    await finish(player.cookie, practice);
    const ownBoard = (
      await app.inject("/api/leaderboard?game=line&mode=practice&period=all")
    ).json();
    expect(ownBoard.entries[0].score).toBe(500);
    expect(
      (await app.inject("/api/leaderboard?game=overall")).json().total,
    ).toBe(0);
    const daily = (await start(player.cookie)).json();
    await finish(player.cookie, daily);
    const overall = (await app.inject("/api/leaderboard?game=overall")).json();
    expect(overall.version).toBe(2);
    expect(overall.entries[0]).toMatchObject({ score: 1000, gamesPlayed: 1 });
    expect(overall.entries[0].contributions[0]).toMatchObject({
      game: "line",
      mode: "classic",
      points: 1000,
    });
  });
  it("claims a completed guest daily only once per account across browsers", async () => {
    const player = await signed();
    await pool.query(
      "INSERT INTO playne_identities(provider,subject,user_id) VALUES('yandex','line-identity',$1)",
      [player.id],
    );
    const accountDaily = (await start(player.cookie)).json();
    const cookie = await guest(),
      trial = (await start(cookie)).json();
    await finish(cookie, trial);
    const login = await app.inject({
      url:
        "/api/auth/yandex/start?return=" +
        encodeURIComponent("/line/?mode=classic"),
      headers: { cookie },
    });
    const state = new URL(login.headers.location!).searchParams.get("state");
    const callback = await app.inject({
      url: `/api/auth/yandex/callback?state=${state}&code=test`,
      headers: { cookie },
    });
    expect(callback.headers.location).toContain("auth=success");
    const saved = (
      await pool.query(
        "SELECT owner_id,mode,published_at FROM playne_games WHERE id=$1",
        [trial.id],
      )
    ).rows[0];
    expect(saved.owner_id).toBe(player.id);
    expect(saved.mode).toBe("practice");
    expect(saved.published_at).not.toBeNull();
    expect(
      (
        await pool.query(
          "SELECT run_id FROM playne_line_days WHERE owner_id=$1",
          [player.id],
        )
      ).rows.map((r) => r.run_id),
    ).toEqual([accountDaily.id]);
    expect(
      (await app.inject("/api/leaderboard?game=overall")).json().total,
    ).toBe(0);
  });
  it("migrates both existing game allowlist constraints without losing old rows", async () => {
    const owner = (await signed()).id;
    await pool.query(
      "ALTER TABLE playne_games DROP CONSTRAINT playne_games_game_check",
    );
    await pool.query(
      "ALTER TABLE playne_games ADD CONSTRAINT playne_games_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure'))",
    );
    await pool.query(
      "ALTER TABLE playne_guest_trials DROP CONSTRAINT playne_guest_trials_game_check",
    );
    await pool.query(
      "ALTER TABLE playne_guest_trials ADD CONSTRAINT playne_guest_trials_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure'))",
    );
    await pool.query(
      "INSERT INTO playne_games(browser_hash,owner_id,game,challenge) VALUES('old',$1,'circle','{}')",
      [owner],
    );
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM playne_games WHERE game='circle'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await start(await guest())).statusCode).toBe(200);
  });
});
