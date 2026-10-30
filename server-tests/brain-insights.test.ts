import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";
import {
  buildBrainInsight,
  measureBrainRun,
  registerBrainInsightRoutes,
  type InsightRun,
} from "../server/brain-insights";
import {
  makeBrainChallenge,
  replaySlideMoves,
  slideHint,
  type BrainGame,
  type BrainRound,
  type DispatchAction,
  type SlideMove,
} from "../src/brain";

function answerFor(round: BrainRound): any {
  if (round.kind === "flash") return { cells: [...round.cells], score: 0 };
  if (round.kind === "rotate") return { same: round.correctSame, score: 0 };
  if (round.kind === "slide") {
    const moves: SlideMove[] = [];
    while (!replaySlideMoves(round, moves).solved) {
      const hint = slideHint(round, moves);
      if (!hint.move || moves.length > 100) throw Error("No solution");
      moves.push(hint.move);
    }
    return { moves, hints: 0, score: 0 };
  }
  const actions: DispatchAction[] = [];
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
  return { actions: actions.sort((a, b) => a.atMs - b.atMs), score: 0 };
}
function run(
  game: BrainGame = "flash",
  seed = 19,
  completed = "2026-10-30T10:00:00Z",
): InsightRun {
  const challenge = makeBrainChallenge(game, seed, 1, "2026-10-30");
  return {
    id: randomUUID(),
    game,
    version: 1,
    mode: "practice",
    challenge,
    answers: challenge.rounds.map(answerFor),
    completed_at: completed,
  };
}
function previous(current: InsightRun, index: number): InsightRun {
  return {
    ...structuredClone(current),
    id: randomUUID(),
    completed_at: `2026-10-${String(26 + index).padStart(2, "0")}T10:00:00Z`,
  };
}
const change = (value: InsightRun) => value as any;

describe("private Brain insights: raw metrics and controlled comparison", () => {
  it.each(["flash", "rotate", "slide", "dispatch"] as const)(
    "measures %s answers even when score is zero",
    (game) => {
      const current = run(game);
      const measured = measureBrainRun(current)!;
      expect(measured).not.toBeNull();
      expect(measured.metric.current).toBe(game === "slide" ? 0 : 1);
      expect(measured.metric.numerator).toBeGreaterThan(0);
    },
  );
  it("uses recovered cells, not the score or the stored correction claim", () => {
    const current = run();
    const first = change(current).challenge.rounds[0];
    const replacement = Array.from(
      { length: first.rows * first.cols },
      (_, i) => i,
    ).find((i) => !first.cells.includes(i))!;
    change(current).answers[0] = {
      cells: [replacement, ...first.cells.slice(1)],
      correctCells: first.cells,
      score: 100,
    };
    const measured = measureBrainRun(current)!.metric;
    expect(measured.numerator).toBe(measured.denominator - 1);
    expect(measured.current).toBe(
      (measured.denominator - 1) / measured.denominator,
    );
  });
  it("requires three distinct previous completed comparable parties", () => {
    const current = run(),
      first = previous(current, 0),
      second = previous(current, 1);
    const result = buildBrainInsight(current, [first, second, first, current]);
    expect(result.status).toBe("insufficient");
    expect(result.sample).toEqual({ previous: 2, required: 3, missing: 1 });
    expect(result.fact).toContain("мало сопоставимых партий");
    expect(result.metric).not.toHaveProperty("baseline");
    expect(
      buildBrainInsight(current, [first, second, previous(current, 2)]).status,
    ).toBe("ready");
  });
  it("averages actual recovery ratios across all comparable history", () => {
    const current = run(),
      history = [0, 1, 2].map((i) => previous(current, i));
    for (const item of history) {
      const first = change(item).challenge.rounds[0];
      const replacement = Array.from(
        { length: first.rows * first.cols },
        (_, i) => i,
      ).find((i) => !first.cells.includes(i))!;
      change(item).answers[0].cells[0] = replacement;
    }
    const result = buildBrainInsight(current, history);
    expect(result.status).toBe("ready");
    expect(result.metric!.baseline).toBeCloseTo(
      measureBrainRun(history[0])!.metric.current,
    );
    expect(result.metric!.baseline).toBeLessThan(result.metric!.current);
  });
  it.each(["mode", "difficulty", "version", "showMs"])(
    "does not compare a different %s",
    (field) => {
      const current = run(),
        prior = previous(current, 0),
        data = change(prior);
      if (field === "mode") data.mode = "classic";
      if (field === "difficulty") data.challenge.difficulty = 2;
      if (field === "version") {
        data.version = 2;
        data.challenge.version = 2;
      }
      if (field === "showMs") data.challenge.rounds[0].showMs--;
      expect(buildBrainInsight(current, [prior]).sample.previous).toBe(0);
    },
  );
  it.each(["rotate", "slide", "dispatch"] as const)(
    "does not mix random %s geometry or schedule",
    (game) => {
      const current = run(game, 19),
        other = run(game, 28, "2026-10-28T10:00:00Z");
      expect(measureBrainRun(current)!.signature).not.toBe(
        measureBrainRun(other)!.signature,
      );
      expect(buildBrainInsight(current, [other]).sample.previous).toBe(0);
    },
  );
  it("compares new flash target positions only when field/count/exposure match", () => {
    const current = run("flash", 19),
      other = run("flash", 28, "2026-10-28T10:00:00Z");
    expect(measureBrainRun(current)!.signature).toBe(
      measureBrainRun(other)!.signature,
    );
    expect(buildBrainInsight(current, [other]).sample.previous).toBe(1);
  });
  it("excludes hinted slide parties and reports the current hints explicitly", () => {
    const current = run("slide"),
      hinted = previous(current, 0);
    change(hinted).answers[0].hints = 1;
    expect(buildBrainInsight(current, [hinted]).sample.previous).toBe(0);
    change(current).answers[0].hints = 2;
    const result = buildBrainInsight(current, [previous(current, 1)]);
    expect(result.status).toBe("assisted");
    expect(result.fact).toContain("Использовано подсказок: 2");
    expect(result.nextStep).toContain("без подсказок");
    expect(result.metric).not.toHaveProperty("baseline");
  });
  it("calculates slide extra moves relative to optimal, rather than the penalized score", () => {
    const current = run("slide"),
      data = change(current),
      round = data.challenge.rounds[0],
      answer = data.answers[0];
    const move = answer.moves[0];
    answer.moves = [move, { ...move, delta: -move.delta }, ...answer.moves];
    answer.score = 100;
    const metric = measureBrainRun(current)!.metric;
    expect(metric.current).toBe(2);
    expect(metric.numerator - metric.denominator).toBe(2);
    expect(replaySlideMoves(round, answer.moves).solved).toBe(true);
  });
  it("does not infer a no-hint slide history when old records omit hint metadata", () => {
    const current = run("slide");
    delete change(current).answers[0].hints;
    expect(buildBrainInsight(current, []).status).toBe("unavailable");
  });
  it.each(["flash", "rotate", "slide", "dispatch"] as const)(
    "excludes repeated %s challenge tasks from personal growth comparisons",
    (game) => {
      const current = run(game),
        history = [0, 1, 2].map((index) => previous(current, index));
      for (const item of history) change(item).challenge.comparison = true;
      const fresh = buildBrainInsight(current, history);
      expect(fresh.status).toBe("insufficient");
      expect(fresh.sample.previous).toBe(0);
      expect(fresh.metric).not.toHaveProperty("baseline");
      for (const item of history) delete change(item).challenge.comparison;
      change(current).challenge.comparison = true;
      const repeated = buildBrainInsight(current, history);
      expect(repeated.status).toBe("replay");
      expect(repeated.metric).not.toHaveProperty("baseline");
      expect(repeated.fact).toContain(
        "Повтор по вызову не участвует в сравнении",
      );
      expect(repeated.nextStep).toBe(
        "Выбери новую практику на этой сложности.",
      );
      expect(repeated.fact).not.toContain("в среднем");
    },
  );
  it("skips legacy, incomplete, malformed and future records without errors", () => {
    const current = run(),
      legacy = previous(current, 0),
      incomplete = previous(current, 1),
      future = previous(current, 2);
    legacy.challenge = null;
    incomplete.answers = [];
    future.completed_at = "2026-11-01T00:00:00Z";
    expect(
      buildBrainInsight(current, [legacy, incomplete, future]).sample.previous,
    ).toBe(0);
    const result = buildBrainInsight(
      { ...current, answers: [{ score: 500 }] },
      [],
    );
    expect(result.status).toBe("unavailable");
    expect(result.metric).toBeNull();
    expect(result.fact).toContain("не хватает подробных данных");
  });
  it("rejects invalid dispatch actions instead of silently trusting delivered counters", () => {
    const current = run("dispatch");
    change(current).answers[0] = {
      actions: [{ atMs: -1, switch: 1, position: 0 }],
      correct: 999,
      total: 999,
    };
    expect(measureBrainRun(current)).toBeNull();
  });
});

const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)(
  "Brain insights: PostgreSQL access and complete history",
  () => {
    let admin: Pool, pool: Pool, app: FastifyInstance;
    const browser = "a".repeat(64),
      otherBrowser = "b".repeat(64);
    let owner: string, stranger: string;
    beforeAll(async () => {
      if (!db || new URL(db).pathname !== "/playne_test")
        throw Error("Isolated test database required");
      admin = new Pool({ connectionString: db });
      await admin.query(
        "CREATE SCHEMA IF NOT EXISTS playne_brain_insights_test",
      );
      pool = new Pool({
        connectionString: db,
        options: "-c search_path=playne_brain_insights_test",
      });
      await pool.query(readFileSync("server/schema.sql", "utf8"));
      app = Fastify();
      await registerBrainInsightRoutes(
        app,
        pool,
        (req) => String(req.headers["x-test-browser"] ?? browser),
        async (req) =>
          req.headers["x-test-user"]
            ? { id: String(req.headers["x-test-user"]) }
            : null,
      );
      await app.ready();
    });
    beforeEach(async () => {
      await pool.query(
        "TRUNCATE playne_users,playne_games,playne_guest_trials CASCADE",
      );
      const users = await pool.query(
        "INSERT INTO playne_users(nickname) VALUES('Владелец'),('Другой') RETURNING id",
      );
      [owner, stranger] = users.rows.map((row) => row.id);
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      await admin?.query(
        "DROP SCHEMA IF EXISTS playne_brain_insights_test CASCADE",
      );
      await admin?.end();
    });
    async function insert(current: InsightRun, user: string | null = owner) {
      await pool.query(
        "INSERT INTO playne_games(id,browser_hash,owner_id,game,version,mode,challenge,answers,completed_at,score_units,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,500,now()+interval '1 day')",
        [
          current.id,
          browser,
          user,
          current.game,
          current.version,
          current.mode,
          JSON.stringify(current.challenge),
          JSON.stringify(current.answers),
          current.completed_at,
        ],
      );
      return current;
    }
    const get = (id: string, user?: string, hash = browser) =>
      app.inject({
        url: `/api/games/${id}/insight`,
        headers: {
          "x-test-browser": hash,
          ...(user ? { "x-test-user": user } : {}),
        },
      });
    it("allows the owner, sets private no-store, and rejects a different user on the same browser", async () => {
      const current = await insert(run());
      const allowed = await get(current.id, owner);
      expect(allowed.statusCode, allowed.body).toBe(200);
      expect(allowed.headers["cache-control"]).toBe("private, no-store");
      expect((await get(current.id, stranger)).statusCode).toBe(404);
      expect((await get(current.id)).statusCode).toBe(404);
    });
    it("requires the actual guest-trial mapping for an unclaimed run", async () => {
      const current = await insert(run(), null);
      expect((await get(current.id)).statusCode).toBe(404);
      await pool.query(
        "INSERT INTO playne_guest_trials(browser_hash,game,run_id) VALUES($1,$2,$3)",
        [browser, current.game, current.id],
      );
      expect((await get(current.id)).statusCode).toBe(200);
      expect((await get(current.id, undefined, otherBrowser)).statusCode).toBe(
        404,
      );
    });
    it("reads beyond thirty recent parties and never includes another account's matching history", async () => {
      const current = await insert(run());
      for (let i = 0; i < 3; i++) await insert(previous(current, i));
      for (let i = 0; i < 32; i++) {
        const other = previous(current, 2);
        change(other).challenge.difficulty = 2;
        await insert(other);
      }
      for (let i = 0; i < 4; i++)
        await insert(previous(current, i % 3), stranger);
      const response = await get(current.id, owner);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().status).toBe("ready");
      expect(response.json().sample.previous).toBe(3);
    });
    it("never compares a known challenge replay against normal practice history", async () => {
      const current = await insert(run());
      for (let index = 0; index < 3; index++) {
        const old = previous(current, index);
        change(old).challenge.comparison = true;
        await insert(old);
      }
      const fresh = await get(current.id, owner);
      expect(fresh.json().status).toBe("insufficient");
      expect(fresh.json().sample.previous).toBe(0);
      change(current).challenge.comparison = true;
      await pool.query("UPDATE playne_games SET challenge=$2 WHERE id=$1", [
        current.id,
        JSON.stringify(current.challenge),
      ]);
      const repeated = await get(current.id, owner);
      expect(repeated.statusCode, repeated.body).toBe(200);
      expect(repeated.json().status).toBe("replay");
      expect(repeated.json().metric).not.toHaveProperty("baseline");
    });
    it("returns a safe unavailable state for old complete records and rejects incomplete/invalid runs", async () => {
      const current = run();
      current.answers = [];
      await insert(current);
      const old = await get(current.id, owner);
      expect(old.statusCode, old.body).toBe(200);
      expect(old.json().status).toBe("unavailable");
      await pool.query(
        "UPDATE playne_games SET completed_at=NULL WHERE id=$1",
        [current.id],
      );
      expect((await get(current.id, owner)).statusCode).toBe(409);
      expect((await get("invalid", owner)).statusCode).toBe(404);
    });
  },
);
