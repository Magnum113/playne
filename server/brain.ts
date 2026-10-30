import type { Pool } from "pg";
import { randomBytes } from "node:crypto";
import {
  makeBrainChallenge,
  publicBrainRound,
  validateBrainAnswer,
  scoreBrainRound,
  slideHint,
  dispatchSnapshot,
  type BrainGame,
  type BrainChallenge,
} from "../src/brain";
import { lineMoscowDate } from "../src/line";
import { readPlayActivity, readPlayMilestones } from "./play-progress";
export const BRAIN_GAMES = ["flash", "rotate", "slide", "dispatch"] as const;
export const isBrainGame = (game: unknown): game is BrainGame =>
  typeof game === "string" && (BRAIN_GAMES as readonly string[]).includes(game);
export const privateBrain = (run: any) =>
  isBrainGame(run.game) && run.mode === "practice";
// The day determines which persisted pack to load; it is never a generator seed.
// Persist the whole private pack so generator changes cannot alter an issued day.
export async function brainDailyPack(
  client: Pick<Pool, "query">,
  game: BrainGame,
  day: string,
): Promise<BrainChallenge> {
  const find = () =>
    client.query(
      "SELECT challenge FROM playne_brain_packs WHERE day=$1 AND game=$2 AND version=1",
      [day, game],
    );
  const existing = (await find()).rows[0];
  if (existing) return structuredClone(existing.challenge);
  const generated = makeBrainChallenge(
    game,
    randomBytes(32).toString("hex"),
    1,
    day,
  );
  const inserted = await client.query(
    "INSERT INTO playne_brain_packs(day,game,version,challenge) VALUES($1,$2,1,$3) ON CONFLICT(day,game,version) DO NOTHING RETURNING challenge",
    [day, game, JSON.stringify(generated)],
  );
  const saved = inserted.rows[0] ?? (await find()).rows[0];
  return structuredClone(saved.challenge);
}
export function practiceBrainChallenge(
  game: BrainGame,
  seed: string | number,
  difficulty: 1 | 2 | 3,
  day: string,
  dailyPack: BrainChallenge,
) {
  const challenge = makeBrainChallenge(game, seed, difficulty, day);
  if (game !== "slide") return challenge;
  const daily = new Set(dailyPack.rounds.map((round) => round.id));
  // Preserve stage difficulty while replacing every board present in today's daily pack.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (challenge.rounds.every((round) => !daily.has(round.id)))
      return challenge;
    const candidates = makeBrainChallenge(
      game,
      `${seed}:practice:${attempt}`,
      difficulty,
      day,
    );
    challenge.rounds = challenge.rounds.map((round, index) =>
      daily.has(round.id) ? candidates.rounds[index] : round,
    );
  }
  throw new Error("Не удалось выбрать новые поля. Попробуй ещё раз.");
}
export function createBrain(
  game: BrainGame,
  mode: string,
  day: string,
  level: number,
  dailyPack?: BrainChallenge,
) {
  const difficulty = mode === "classic" ? 1 : level;
  const daily =
    dailyPack ??
    makeBrainChallenge(game, randomBytes(32).toString("hex"), 1, day);
  return {
    ...(mode === "classic"
      ? structuredClone(daily)
      : practiceBrainChallenge(
          game,
          randomBytes(32).toString("hex"),
          difficulty as 1 | 2 | 3,
          day,
          daily,
        )),
    mode,
    states: {},
  };
}
export function publicBrain(challenge: any) {
  return {
    game: challenge.game,
    version: challenge.version,
    day: challenge.day,
    mode: challenge.mode,
    difficulty: challenge.difficulty,
    rounds: challenge.rounds.map((round: any) =>
      publicBrainRound(round, false),
    ),
    states: Object.fromEntries(
      Object.entries(challenge.states ?? {}).map(([index, item]) => {
        const state = item as any;
        return [
          index,
          {
            startedAt: state.startedAt,
            hints: state.hints,
            ...(state.revealUntil === undefined
              ? {}
              : { revealUntil: state.revealUntil }),
          },
        ];
      }),
    ),
  };
}
export function brainAnswer(
  challenge: any,
  index: number,
  input: any,
  now: number,
) {
  const round = challenge.rounds?.[index],
    state = challenge.states?.[index];
  if (
    !round ||
    !state ||
    !Number.isFinite(state.startedAt) ||
    now < state.startedAt
  )
    throw new Error("Сначала начни раунд");
  if (round.kind === "flash" && now < state.revealUntil)
    throw new Error("Сначала дождись окончания показа");
  const elapsedMs = now - state.startedAt;
  if (
    round.kind === "dispatch" &&
    input?.durationMs !== undefined &&
    input.durationMs !== round.durationMs
  )
    throw new Error("Продолжительность волны не совпадает с заданием");
  if (round.kind === "dispatch" && elapsedMs < round.durationMs)
    throw new Error("Сначала закончи смену");
  if (!validateBrainAnswer(round, input)) throw new Error("Некорректный ответ");
  if (
    round.kind === "dispatch" &&
    input.actions.some((action: any) => action.atMs > elapsedMs)
  )
    throw new Error("Время действий не совпадает с серверным");
  const answer =
    round.kind === "flash"
      ? { cells: input.cells }
      : round.kind === "rotate"
        ? { same: input.same }
        : round.kind === "slide"
          ? { moves: input.moves }
          : { actions: input.actions };
  const correction =
    round.kind === "flash"
      ? { correctCells: round.cells }
      : round.kind === "rotate"
        ? { correctSame: round.correctSame }
        : round.kind === "dispatch"
          ? {
              correct: dispatchSnapshot(round, input.actions, round.durationMs)
                .correct,
              total: round.trains.length,
            }
          : {};
  return {
    ...answer,
    ...correction,
    elapsedMs,
    hints: state.hints,
    score: scoreBrainRound(round, input, { hints: state.hints }),
  };
}
export async function claimBrainDay(client: any, run: any, ownerId: string) {
  if (!isBrainGame(run.game) || run.mode !== "classic") return;
  const day = run.challenge.day;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `brain:account:${ownerId}:${run.game}:${day}`,
  ]);
  const prior = await client.query(
    "SELECT run_id FROM playne_brain_days WHERE day=$1 AND game=$2 AND owner_id=$3",
    [day, run.game, ownerId],
  );
  if (prior.rows[0] && prior.rows[0].run_id !== run.id) {
    run.mode = "practice";
    run.challenge.mode = "practice";
    await client.query(
      "UPDATE playne_games SET mode='practice',challenge=$1 WHERE id=$2",
      [JSON.stringify(run.challenge), run.id],
    );
  } else if (!prior.rows[0]) {
    await client.query(
      "UPDATE playne_brain_days SET owner_id=$1 WHERE day=$3 AND game=$4 AND browser_hash=(SELECT browser_hash FROM playne_brain_days WHERE run_id=$2 ORDER BY created_at,browser_hash LIMIT 1)",
      [ownerId, run.id, day, run.game],
    );
  }
}
export async function registerBrainRoutes(
  app: any,
  pool: Pool,
  owned: any,
  failure: any,
  browser: any,
  user: any,
) {
  for (const action of ["start", "hint"] as const)
    app.post(`/api/games/:id/brain/${action}`, async (req: any, reply: any) => {
      const input = req.body;
      if (!Number.isInteger(input?.index) || input.index < 0 || input.index > 4)
        failure("Некорректный раунд");
      if (
        action === "hint" &&
        (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input.requestId ?? "",
        ) ||
          !Array.isArray(input.moves) ||
          input.moves.length > 500)
      )
        failure("Некорректная подсказка");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const run = await owned(req, reply, req.params.id, client, true);
        if (
          !isBrainGame(run.game) ||
          run.completed_at ||
          run.answers.length !== input.index
        )
          failure("Сначала закончи текущий раунд", 409);
        const round = run.challenge.rounds[input.index];
        const serverNow = Date.now();
        const states = run.challenge.states;
        if (action === "start") {
          states[input.index] ??= {
            startedAt: serverNow,
            hints: 0,
            requests: {},
            ...(run.game === "flash"
              ? { revealUntil: serverNow + round.showMs }
              : {}),
          };
          await client.query(
            "UPDATE playne_games SET challenge=$1 WHERE id=$2",
            [JSON.stringify(run.challenge), run.id],
          );
          await client.query("COMMIT");
          const state = states[input.index];
          return {
            round: publicBrainRound(
              round,
              run.game === "flash" && serverNow < state.revealUntil,
            ),
            startedAt: state.startedAt,
            hints: state.hints,
            serverNow,
            ...(state.revealUntil === undefined
              ? {}
              : { revealUntil: state.revealUntil }),
          };
        }
        if (run.game !== "slide") failure("В этой игре нет подсказок", 400);
        const state = states[input.index];
        if (!state) failure("Сначала начни раунд", 409);
        const prior = state.requests[input.requestId];
        if (prior) {
          await client.query("COMMIT");
          return {
            ...prior,
            hints: state.hints,
            startedAt: state.startedAt,
            serverNow,
          };
        }
        if (state.hints >= 36)
          failure("Подсказки этого раунда закончились", 409);
        let hint;
        try {
          hint = slideHint(round, input.moves);
        } catch {
          failure("Некорректный маршрут машин");
        }
        state.hints++;
        state.requests[input.requestId] = hint;
        await client.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
          JSON.stringify(run.challenge),
          run.id,
        ]);
        await client.query("COMMIT");
        return {
          ...hint,
          hints: state.hints,
          startedAt: state.startedAt,
          serverNow,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  app.get("/api/brain/progress", async (req: any, reply: any) => {
    const b = browser(req, reply),
      signed = await user(req);
    const day = lineMoscowDate();
    const own = signed
      ? "owner_id=$2"
      : "id IN(SELECT run_id FROM playne_guest_trials WHERE browser_hash=$2)";
    const [records, activity, milestones] = await Promise.all([
      pool.query(
        `WITH own AS (
        SELECT id,game,mode,challenge->>'day' AS day,challenge->>'difficulty' AS difficulty,answers,score_units,completed_at,created_at,
        row_number() OVER(PARTITION BY (completed_at IS NULL) ORDER BY created_at DESC,id) AS history_rank,
        row_number() OVER(PARTITION BY game,mode,challenge->>'difficulty',(completed_at IS NULL) ORDER BY created_at DESC,id) AS level_rank
        FROM playne_games WHERE game=ANY($1::text[]) AND ${own}
      ) SELECT id,game,mode,day,difficulty,score_units,completed_at,created_at,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('score',a->'score','elapsedMs',a->'elapsedMs','hints',a->'hints')),'[]'::jsonb) FROM jsonb_array_elements(answers) a) AS answers
        FROM own WHERE (completed_at IS NOT NULL AND (history_rank<=30 OR (mode='practice' AND level_rank<=3))) OR (mode='classic' AND day=$3)
        ORDER BY created_at DESC,id`,
        [BRAIN_GAMES, signed?.id ?? b, day],
      ),
      readPlayActivity(pool, { browserHash: b, userId: signed?.id }, day),
      readPlayMilestones(pool, { browserHash: b, userId: signed?.id }, day),
    ]);
    const completed = records.rows.filter((r: any) => r.completed_at);
    const todayResults = Object.fromEntries(
      BRAIN_GAMES.map((game) => {
        const run = records.rows.find(
          (r: any) => r.game === game && r.mode === "classic" && r.day === day,
        );
        return [
          game,
          run
            ? {
                id: run.id,
                completed: !!run.completed_at,
                score:
                  run.score_units === null
                    ? null
                    : Number(run.score_units) / 10,
                mode: run.mode,
              }
            : null,
        ];
      }),
    );
    const { last7Days, weeklyDays } = activity;
    const suggestedLevels = Object.fromEntries(
      BRAIN_GAMES.map((game) => {
        const practice = completed.filter(
          (r: any) => r.game === game && r.mode === "practice",
        );
        const latest = practice[0];
        const level = Number(latest?.difficulty ?? 1);
        const same = practice
          .filter((r: any) => Number(r.difficulty) === level)
          .slice(0, 3);
        const average =
          same.reduce(
            (sum: number, r: any) => sum + Number(r.score_units) / 10,
            0,
          ) / (same.length || 1);
        return [
          game,
          same.length < 3
            ? level
            : average >= 400
              ? Math.min(3, level + 1)
              : average <= 200
                ? Math.max(1, level - 1)
                : level,
        ];
      }),
    );
    return {
      today: { day, results: todayResults },
      last7Days,
      weeklyDays,
      goal: { days: 3, completedDays: weeklyDays },
      milestones,
      suggestedLevels,
      history: completed.slice(0, 30).map((r: any) => ({
        id: r.id,
        game: r.game,
        mode: r.mode,
        day: r.day,
        difficulty: Number(r.difficulty),
        level: Number(r.difficulty),
        score: Number(r.score_units) / 10,
        completedAt: r.completed_at,
        rounds: r.answers.map((a: any) => ({
          score: a.score,
          elapsedMs: a.elapsedMs,
          hints: a.hints,
        })),
      })),
    };
  });
}
