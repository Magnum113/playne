import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { buildApp } from "../server/app";
import {
  BRAIN_GAMES,
  brainDailyPack,
  practiceBrainChallenge,
} from "../server/brain";
import {
  brainMoscowDate,
  makeBrainChallenge,
  slideHint,
  replaySlideMoves,
  scoreBrainRound,
  type BrainGame,
  type BrainRound,
  type SlideMove,
} from "../src/brain";
import { safeReturn } from "../server/scoring";
const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)(
  "Brain daily games: PostgreSQL authority",
  () => {
    let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const origin = "https://brain.test";
    const hash = (v: string) => createHash("sha256").update(v).digest("hex");
    const cookies = (r: any) =>
      r.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const guest = async () => cookies(await app.inject("/api/me"));
    const post = (cookie: string, url: string, payload: any) =>
      app.inject({ method: "POST", url, headers: { cookie, origin }, payload });
    const get = (cookie: string, url: string) =>
      app.inject({ url, headers: { cookie } });
    const start = (
      cookie: string,
      game: BrainGame,
      mode = "classic",
      difficulty = 1,
    ) => post(cookie, "/api/games", { game, mode, difficulty });
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
      return { id, token, cookie: `${await guest()}; playne_session=${token}` };
    }
    const privateRun = async (id: string) =>
      (await pool.query("SELECT * FROM playne_games WHERE id=$1", [id]))
        .rows[0];
    function answerFor(round: BrainRound): any {
      if (round.kind === "flash") return { cells: round.cells };
      if (round.kind === "rotate") return { same: round.correctSame };
      if (round.kind === "slide") {
        const moves: SlideMove[] = [];
        while (!replaySlideMoves(round, moves).solved) {
          const hint = slideHint(round, moves);
          if (!hint.move || moves.length > 100)
            throw Error("No slide solution");
          moves.push(hint.move);
        }
        return { moves };
      }
      const actions: any[] = [];
      for (const train of round.trains) {
        if (round.activeSwitches.includes(0))
          actions.push({
            atMs: train.switch0Ms - 1,
            switch: 0,
            position: train.destination === 2 ? 1 : 0,
          });
        if (train.destination !== 2)
          actions.push({
            atMs: train.switch1Ms - 1,
            switch: 1,
            position: train.destination === 1 ? 1 : 0,
          });
      }
      actions.sort((a, b) => a.atMs - b.atMs);
      return { actions };
    }
    async function expireRound(id: string, index: number) {
      const run = await privateRun(id),
        round = run.challenge.rounds[index];
      run.challenge.states[index].startedAt =
        Date.now() - (round.durationMs ?? round.showMs ?? 1000) - 100;
      if (round.kind === "flash")
        run.challenge.states[index].revealUntil = Date.now() - 10;
      await pool.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
        JSON.stringify(run.challenge),
        id,
      ]);
    }
    async function finish(cookie: string, run: any) {
      const secret = await privateRun(run.id);
      let total = 0;
      for (let index = run.answers?.length ?? 0; index < 5; index++) {
        const began = await post(cookie, `/api/games/${run.id}/brain/start`, {
          index,
        });
        expect(began.statusCode, began.body).toBe(200);
        await expireRound(run.id, index);
        const answer = answerFor(secret.challenge.rounds[index]);
        const response = await post(cookie, `/api/games/${run.id}/answers`, {
          index,
          answer: { ...answer, score: 1e9, elapsedMs: -1, hints: -100 },
        });
        expect(response.statusCode, response.body).toBe(200);
        const result = response.json();
        total += scoreBrainRound(secret.challenge.rounds[index], answer);
        expect(result.answer.score).toBe(
          scoreBrainRound(secret.challenge.rounds[index], answer),
        );
        expect(result.completed).toBe(index === 4);
        expect(result.answer.hints).toBe(0);
        if (index === 4) expect(result.score).toBe(total);
      }
      return total;
    }
    beforeAll(async () => {
      if (!db || new URL(db).pathname !== "/playne_test")
        throw Error("Isolated test database required");
      admin = new Pool({ connectionString: db });
      await admin.query("CREATE SCHEMA IF NOT EXISTS playne_brain_test");
      pool = new Pool({
        connectionString: db,
        options: "-c search_path=playne_brain_test",
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
          revision: "brain-test",
        },
        (async (url: any) =>
          new Response(
            JSON.stringify(
              String(url).includes("/token")
                ? { access_token: "test" }
                : {
                    id: "brain-identity",
                    client_id: "test",
                    first_name: "Игрок",
                  },
            ),
          )) as typeof fetch,
      );
    });
    beforeEach(async () => {
      await pool.query(
        "TRUNCATE playne_users,playne_games,playne_guest_trials,playne_brain_days,playne_brain_packs CASCADE",
      );
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      await admin?.query("DROP SCHEMA playne_brain_test CASCADE");
      await admin?.end();
    });
    it("completes all five rounds in all four games with engine scores and no client timing/score authority", async () => {
      const player = await signed();
      for (const game of BRAIN_GAMES) {
        const r = await start(player.cookie, game);
        expect(r.statusCode, r.body).toBe(200);
        expect(r.json().challenge).toMatchObject({
          game,
          version: 1,
          day: brainMoscowDate(),
          difficulty: 1,
          mode: "classic",
        });
        const score = await finish(player.cookie, r.json());
        expect(score).toBe(500);
        const saved = await privateRun(r.json().id);
        expect(saved.owner_id).toBe(player.id);
        expect(saved.published_at).not.toBeNull();
        expect((await start(player.cookie, game)).json()).toMatchObject({
          id: saved.id,
          completed: true,
          score,
        });
      }
      const board = (await app.inject("/api/leaderboard?game=brain")).json();
      expect(board.entries[0]).toMatchObject({ score: 1000, gamesPlayed: 4 });
      expect(board.entries[0].contributions.map((c: any) => c.points)).toEqual([
        250, 250, 250, 250,
      ]);
      const overall = (
        await app.inject("/api/leaderboard?game=overall")
      ).json();
      expect(overall).toMatchObject({ version: 3 });
      expect(overall.entries[0]).toMatchObject({
        score: 1000,
        gamesPlayed: 1,
        contributions: [{ game: "brain", score: 1000, points: 1000 }],
      });
    }, 30000);
    it("gives deterministic daily stimuli and one reservation per account/game under concurrency", async () => {
      const player = await signed();
      for (const game of BRAIN_GAMES) {
        const responses = await Promise.all([
          start(player.cookie, game),
          start(player.cookie, game),
        ]);
        expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
        expect(responses[0].json().id).toBe(responses[1].json().id);
        const other = (await start(await guest(), game)).json();
        expect(other.challenge.rounds).toEqual(
          responses[0].json().challenge.rounds,
        );
        const newBrowser = await start(`playne_session=${player.token}`, game);
        expect(newBrowser.json().id).toBe(responses[0].json().id);
        const another = await signed();
        expect(
          (
            await start(
              `${cookies(newBrowser)}; playne_session=${another.token}`,
              game,
            )
          ).statusCode,
        ).toBe(404);
      }
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM playne_brain_days WHERE owner_id=$1",
            [player.id],
          )
        ).rows[0].n,
      ).toBe(4);
    });
    it("persists one unpredictable immutable private daily pack across parallel users and cloned runs", async () => {
      const a = await signed("Первый"),
        b = await signed("Второй");
      const [left, right] = await Promise.all([
        start(a.cookie, "flash"),
        start(b.cookie, "flash"),
      ]);
      expect([left.statusCode, right.statusCode]).toEqual([200, 200]);
      const one = await privateRun(left.json().id),
        two = await privateRun(right.json().id);
      expect(one.challenge.rounds).toEqual(two.challenge.rounds);
      const day = brainMoscowDate(),
        saved = (
          await pool.query(
            "SELECT challenge FROM playne_brain_packs WHERE game='flash' AND day=$1",
            [day],
          )
        ).rows;
      expect(saved).toHaveLength(1);
      const original = structuredClone(saved[0].challenge);
      expect(original.rounds).not.toEqual(
        makeBrainChallenge("flash", `${day}:flash:daily-v1`, 1, day).rounds,
      );
      expect(JSON.stringify(left.json())).not.toContain('"seed"');
      const copy = await brainDailyPack(pool, "flash", day);
      copy.rounds.length = 0;
      expect(await brainDailyPack(pool, "flash", day)).toEqual(original);
      await post(a.cookie, `/api/games/${one.id}/brain/start`, { index: 0 });
      expect(
        (
          await pool.query(
            "SELECT challenge FROM playne_brain_packs WHERE game='flash' AND day=$1",
            [day],
          )
        ).rows[0].challenge,
      ).toEqual(original);
      const packs = await Promise.all(
        Array.from({ length: 4 }, () => brainDailyPack(pool, "slide", day)),
      );
      expect(
        packs.every(
          (pack) => JSON.stringify(pack) === JSON.stringify(packs[0]),
        ),
      ).toBe(true);
      for (const level of [1, 2, 3] as const) {
        const practice = (
          await start(a.cookie, "slide", "practice", level)
        ).json();
        expect(
          practice.challenge.rounds.every(
            (round: any) =>
              !packs[0].rounds.some((daily) => daily.id === round.id),
          ),
        ).toBe(true);
      }
    });
    it("preserves flash reveal window across reload and only reveals correction after a saved answer", async () => {
      const cookie = await guest(),
        run = (await start(cookie, "flash")).json(),
        url = `/api/games/${run.id}`;
      expect(JSON.stringify(run.challenge)).not.toContain('"cells"');
      expect(
        (await post(cookie, url + "/brain/start", { index: 1 })).statusCode,
      ).toBe(409);
      const secret = (await privateRun(run.id)).challenge.rounds[0];
      expect(
        (
          await post(cookie, url + "/answers", {
            index: 0,
            answer: { cells: secret.cells },
          })
        ).statusCode,
      ).toBe(400);
      const first = (
        await post(cookie, url + "/brain/start", { index: 0 })
      ).json();
      expect(first.round.cells).toEqual(secret.cells);
      expect(first.revealUntil - first.startedAt).toBe(secret.showMs);
      const again = (
        await post(cookie, url + "/brain/start", { index: 0 })
      ).json();
      expect(again.startedAt).toBe(first.startedAt);
      expect(
        (await get(cookie, url)).json().challenge.rounds[0].cells,
      ).toBeUndefined();
      expect(
        (
          await post(cookie, url + "/answers", {
            index: 0,
            answer: { cells: secret.cells, elapsedMs: 1e9 },
          })
        ).statusCode,
      ).toBe(400);
      await expireRound(run.id, 0);
      const late = (
        await post(cookie, url + "/brain/start", { index: 0 })
      ).json();
      expect(late.round.cells).toBeUndefined();
      const accepted = await post(cookie, url + "/answers", {
        index: 0,
        answer: { cells: secret.cells },
      });
      expect(accepted.json().answer).toMatchObject({
        score: 100,
        correctCells: secret.cells,
      });
      const retry = await post(cookie, url + "/answers", {
        index: 0,
        answer: { cells: [] },
      });
      expect(retry.json().answer).toEqual(accepted.json().answer);
      expect((await get(cookie, url)).json().answers[0].correctCells).toEqual(
        secret.cells,
      );
      expect(
        (await post(await guest(), url + "/brain/start", { index: 0 }))
          .statusCode,
      ).toBe(404);
    });
    it("never exposes the rotate solution bit before an accepted answer", async () => {
      const cookie = await guest(),
        run = (await start(cookie, "rotate")).json(),
        url = `/api/games/${run.id}`;
      expect(JSON.stringify(run.challenge)).not.toContain("correctSame");
      const first = await post(cookie, url + "/brain/start", { index: 0 });
      expect(JSON.stringify(first.json())).not.toContain("correctSame");
      const secret = (await privateRun(run.id)).challenge.rounds[0];
      const accepted = await post(cookie, url + "/answers", {
        index: 0,
        answer: { same: secret.correctSame },
      });
      expect(accepted.json().answer).toMatchObject({
        score: 100,
        correctSame: secret.correctSame,
      });
    });
    it("replays slide moves, persists idempotent hints, and charges server hints despite tampering", async () => {
      const cookie = (await signed()).cookie,
        run = (await start(cookie, "slide")).json(),
        url = `/api/games/${run.id}`;
      await post(cookie, url + "/brain/start", { index: 0 });
      expect(
        (
          await post(cookie, url + "/answers", {
            index: 0,
            answer: { moves: [{ carId: "R", delta: 999 }] },
          })
        ).statusCode,
      ).toBe(400);
      const payload = { index: 0, moves: [], requestId: randomUUID() };
      const first = await post(cookie, url + "/brain/hint", payload),
        repeat = await post(cookie, url + "/brain/hint", payload);
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().hints).toBe(1);
      expect(repeat.json().hints).toBe(1);
      expect(repeat.json().move).toEqual(first.json().move);
      const invalid = await post(cookie, url + "/brain/hint", {
        ...payload,
        requestId: randomUUID(),
        moves: [{ carId: "missing", delta: 1 }],
      });
      expect(invalid.statusCode).toBe(400);
      const reloaded = (await get(cookie, url)).json();
      expect(reloaded.challenge.states[0].hints).toBe(1);
      expect(reloaded.challenge.states[0].requests).toBeUndefined();
      const round = (await privateRun(run.id)).challenge.rounds[0];
      const accepted = await post(cookie, url + "/answers", {
        index: 0,
        answer: { ...answerFor(round), hints: 0, score: 100 },
      });
      expect(accepted.json().answer).toMatchObject({ score: 85, hints: 1 });
    });
    it("requires the dispatch duration on the server and validates replay timestamps and switches", async () => {
      const cookie = await guest(),
        run = (await start(cookie, "dispatch")).json(),
        url = `/api/games/${run.id}`;
      await post(cookie, url + "/brain/start", { index: 0 });
      const round = (await privateRun(run.id)).challenge.rounds[0],
        answer = answerFor(round);
      expect(
        (
          await post(cookie, url + "/answers", {
            index: 0,
            answer: { ...answer, elapsedMs: 1e9 },
          })
        ).statusCode,
      ).toBe(400);
      await expireRound(run.id, 0);
      for (const actions of [
        [{ atMs: round.durationMs + 1, switch: 1, position: 0 }],
        [{ atMs: 0, switch: 4, position: 0 }],
        [
          { atMs: 20, switch: 1, position: 0 },
          { atMs: 10, switch: 1, position: 1 },
        ],
      ])
        expect(
          (
            await post(cookie, url + "/answers", {
              index: 0,
              answer: { actions },
            })
          ).statusCode,
        ).toBe(400);
      expect(
        (
          await post(cookie, url + "/answers", {
            index: 0,
            answer: { ...answer, durationMs: 1 },
          })
        ).statusCode,
      ).toBe(400);
      const accepted = await post(cookie, url + "/answers", {
        index: 0,
        answer,
      });
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(accepted.json().answer).toMatchObject({
        score: 100,
        correct: round.trains.length,
        total: round.trains.length,
      });
    });
    it("keeps brain practice in private history and excludes even accidentally published practice from every public board", async () => {
      const player = await signed();
      const run = (await start(player.cookie, "rotate", "practice", 3)).json();
      expect(run).toMatchObject({
        private: true,
        challenge: { difficulty: 3 },
      });
      await finish(player.cookie, run);
      expect((await privateRun(run.id)).published_at).toBeNull();
      expect(
        (await post(player.cookie, `/api/games/${run.id}/publish`, {})).json(),
      ).toMatchObject({ private: true });
      expect(
        (await get(player.cookie, "/api/account")).json().history[0],
      ).toMatchObject({
        id: run.id,
        mode: "practice",
        difficulty: "3",
        score: 500,
      });
      await pool.query(
        "UPDATE playne_games SET published_at=now() WHERE id=$1",
        [run.id],
      );
      for (const game of ["overall", "brain", "rotate"])
        expect(
          (await app.inject(`/api/leaderboard?game=${game}`)).json().total,
        ).toBe(0);
      for (const game of ["brain", "rotate"])
        expect(
          (await app.inject(`/api/leaderboard?game=${game}&mode=practice`))
            .statusCode,
        ).toBe(400);
      expect(
        (await start(player.cookie, "rotate", "practice", 4)).statusCode,
      ).toBe(400);
    });
    it("retains completed owned practice through expiry and hourly cleanup", async () => {
      const player = await signed(),
        run = (await start(player.cookie, "rotate", "practice")).json();
      await finish(player.cookie, run);
      await pool.query(
        "UPDATE playne_games SET expires_at=now()-interval '1 day' WHERE id=$1",
        [run.id],
      );
      expect(
        (await get(player.cookie, `/api/games/${run.id}`)).statusCode,
      ).toBe(200);
      const restarted = await buildApp(pool, {
        origin,
        yandexId: "test",
        yandexSecret: "test",
        redirect: origin + "/api/auth/yandex/callback",
        secure: true,
        revision: "cleanup-test",
      });
      await restarted.close();
      expect((await privateRun(run.id)).id).toBe(run.id);
      expect(
        (await get(player.cookie, "/api/account")).json().history[0].id,
      ).toBe(run.id);
    });
    it("retains one guest trial per game, including private practice and current guest progress", async () => {
      const cookie = await guest();
      const run = (await start(cookie, "rotate", "practice", 2)).json();
      expect((await start(cookie, "rotate")).json().id).toBe(run.id);
      await finish(cookie, run);
      expect((await start(cookie, "rotate")).statusCode).toBe(403);
      const progress = (await get(cookie, "/api/brain/progress")).json();
      expect(progress.history[0]).toMatchObject({
        id: run.id,
        score: 500,
        mode: "practice",
      });
      expect(progress.today.results.rotate).toBeNull();
      expect(progress.last7Days).toHaveLength(7);
      expect(progress.weeklyDays).toBe(1);
      expect(
        (await get(await guest(), "/api/brain/progress")).json().history,
      ).toEqual([]);
      expect((await start(cookie, "flash")).statusCode).toBe(200);
    });
    it("converts a duplicate guest daily claim into private practice without changing the account first attempt", async () => {
      const player = await signed();
      await pool.query(
        "INSERT INTO playne_identities(provider,subject,user_id) VALUES('yandex','brain-identity',$1)",
        [player.id],
      );
      const first = (await start(player.cookie, "rotate")).json();
      const cookie = await guest(),
        trial = (await start(cookie, "rotate")).json();
      await finish(cookie, trial);
      const login = await get(
        cookie,
        "/api/auth/yandex/start?return=" +
          encodeURIComponent("/brain/rotate/?mode=classic"),
      );
      const state = new URL(login.headers.location!).searchParams.get("state");
      const callback = await get(
        cookie,
        `/api/auth/yandex/callback?state=${state}&code=test`,
      );
      expect(callback.headers.location).toContain("auth=success");
      const saved = await privateRun(trial.id);
      expect(saved).toMatchObject({
        owner_id: player.id,
        mode: "practice",
        published_at: null,
      });
      expect(
        (
          await pool.query(
            "SELECT run_id FROM playne_brain_days WHERE owner_id=$1",
            [player.id],
          )
        ).rows.map((r) => r.run_id),
      ).toEqual([first.id]);
      expect(
        (await app.inject("/api/leaderboard?game=overall")).json().total,
      ).toBe(0);
    });
    it("computes private seven-day summaries and same-level suggestions, retaining thirty own results", async () => {
      const player = await signed(),
        other = await signed();
      for (let i = 0; i < 33; i++) {
        const game = i < 3 ? "flash" : "rotate",
          level = i < 3 ? 2 : 1,
          score = i < 3 ? 450 : 100;
        await pool.query(
          "INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,score_units,completed_at,created_at) VALUES('history',$1,$2,'practice',$3,$4,now(),now()+($5 * interval '1 second'))",
          [
            player.id,
            game,
            JSON.stringify({ day: brainMoscowDate(), difficulty: level }),
            score * 10,
            i,
          ],
        );
      }
      await pool.query(
        "INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,score_units,completed_at) VALUES('other',$1,'slide','practice','{\"difficulty\":3}',5000,now())",
        [other.id],
      );
      const progress = (await get(player.cookie, "/api/brain/progress")).json();
      expect(progress.suggestedLevels).toMatchObject({
        flash: 3,
        rotate: 1,
        slide: 1,
        dispatch: 1,
      });
      expect(progress.history).toHaveLength(30);
      expect(progress.last7Days.at(-1).gamesCompleted).toBe(2);
      expect(progress.goal).toEqual({ days: 3, completedDays: 1 });
      expect(JSON.stringify(progress)).not.toContain('"cells"');
      for (const game of BRAIN_GAMES) {
        for (let attempt = 0; attempt < 2; attempt++)
          await pool.query(
            "INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,score_units,completed_at) VALUES('daily-history',$1,$2,'classic',$3,1000,now())",
            [
              player.id,
              game,
              JSON.stringify({ day: brainMoscowDate(), difficulty: 1 }),
            ],
          );
      }
      const daily = (await get(player.cookie, "/api/brain/progress")).json();
      expect(daily.last7Days.at(-1)).toMatchObject({
        gamesCompleted: 4,
        score: 750,
      });
      expect(daily.weeklyDays).toBe(1);
      expect(daily.goal).toEqual({ days: 3, completedDays: 1 });
    });
    it("keeps ordinary practice recommendations independent of thirty later repeated comparison packs", async () => {
      const player = await signed();
      await pool.query(
        `INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,answers,score_units,completed_at,created_at)
         SELECT 'comparison-history',$1,'flash','practice',jsonb_build_object('day',$2::text,'difficulty',2,'comparison',n>=3),
           '[{"score":90}]'::jsonb,CASE WHEN n<3 THEN 4500 ELSE 0 END,now(),now()+(n*interval '1 second')
         FROM generate_series(0,35) n`,
        [player.id, brainMoscowDate()],
      );
      const progress = (await get(player.cookie, "/api/brain/progress")).json();
      expect(progress.suggestedLevels.flash).toBe(3);
      expect(progress.history).toHaveLength(30);
      expect(progress.history.every((run: any) => run.comparison)).toBe(true);
    });
    it("migrates old allowlists transactionally and preserves old games", async () => {
      await pool.query(
        "ALTER TABLE playne_games DROP CONSTRAINT playne_games_game_check",
      );
      await pool.query(
        "ALTER TABLE playne_games ADD CONSTRAINT playne_games_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure','line'))",
      );
      await pool.query(
        "ALTER TABLE playne_guest_trials DROP CONSTRAINT playne_guest_trials_game_check",
      );
      await pool.query(
        "ALTER TABLE playne_guest_trials ADD CONSTRAINT playne_guest_trials_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure','line'))",
      );
      await pool.query(
        "INSERT INTO playne_games(browser_hash,game,challenge) VALUES('old','circle','{}')",
      );
      await pool.query(readFileSync("server/schema.sql", "utf8"));
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM playne_games WHERE game='circle'",
          )
        ).rows[0].n,
      ).toBe(1);
      for (const game of BRAIN_GAMES)
        expect((await start(await guest(), game)).statusCode).toBe(200);
    });
  },
);
describe("Brain authenticated return paths", () => {
  it("excludes today's five Slide boards from all fifteen practice stages across twenty seeds", () => {
    const day = "2026-10-29",
      dailyPack = makeBrainChallenge("slide", "private-day-fixture", 1, day),
      daily = new Set(dailyPack.rounds.map((round) => round.id));
    for (let seed = 0; seed < 20; seed++)
      for (const level of [1, 2, 3] as const) {
        const pack = practiceBrainChallenge(
          "slide",
          seed,
          level,
          day,
          dailyPack,
        );
        expect(pack.rounds).toHaveLength(5);
        expect(pack.rounds.every((round) => !daily.has(round.id))).toBe(true);
        expect(pack.difficulty).toBe(level);
      }
  });
  it("retains only supported game/mode paths and strips external or unknown routes", () => {
    for (const game of BRAIN_GAMES)
      expect(safeReturn(`/brain/${game}/?mode=practice`)).toBe(
        `/brain/${game}/?mode=practice`,
      );
    expect(safeReturn("/brain/flash/?mode=timed")).toBe("/account/");
    expect(safeReturn("https://evil.example/brain/flash/")).toBe("/account/");
    expect(safeReturn("/brain/fake/")).toBe("/account/");
  });
});
