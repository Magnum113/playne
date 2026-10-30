import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  dispatchSnapshot,
  replaySlideMoves,
  rotationAlignment,
  type BrainCell,
  type DispatchRound,
  type SlideRound,
} from "../src/brain";
import { BRAIN_GAME_IDS, type BrainGameId } from "../src/brainContent";
import {
  BRAIN_INSIGHT_MIN_PREVIOUS,
  currentInsightFact,
  insightNumber,
  insightPercent,
  nextInsightTarget,
  type BrainInsightMetric,
  type BrainInsightResult,
} from "../src/brainInsights";

type Queryable = Pick<Pool, "query">;
export type InsightRun = {
  id: string;
  game: BrainGameId;
  version?: unknown;
  mode?: unknown;
  challenge?: unknown;
  answers?: unknown;
  completed_at?: unknown;
};
type Measurement = {
  signature: string;
  metric: BrainInsightMetric;
  assisted: boolean;
};
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = 1_000_000): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
const gameId = (value: unknown): value is BrainGameId =>
  typeof value === "string" &&
  (BRAIN_GAME_IDS as readonly string[]).includes(value);
function selectedCells(
  value: unknown,
  count: number,
  size: number,
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === count &&
    new Set(value).size === count &&
    value.every((cell) => integer(cell, 0, size - 1))
  );
}
function shape(value: unknown): value is BrainCell[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 36 &&
    value.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 2 &&
        cell.every((coordinate) => integer(coordinate, -32, 32)),
    ) &&
    new Set(value.map((cell) => `${cell[0]}:${cell[1]}`)).size === value.length
  );
}
function normalizedShape(cells: BrainCell[]) {
  const x = Math.min(...cells.map((c) => c[0])),
    y = Math.min(...cells.map((c) => c[1]));
  return cells
    .map((c) => [c[0] - x, c[1] - y])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
function completionTime(run: InsightRun) {
  if (!(
    typeof run.completed_at === "string" || run.completed_at instanceof Date
  ))
    return null;
  const value = new Date(run.completed_at).getTime();
  return Number.isFinite(value) ? value : null;
}

/** Reads stored raw answers; legacy/malformed records are skipped, never inferred from score. */
export function measureBrainRun(run: InsightRun): Measurement | null {
  try {
    if (
      !gameId(run.game) ||
      !integer(run.version, 1, 1000) ||
      !["classic", "practice"].includes(String(run.mode)) ||
      completionTime(run) === null ||
      !object(run.challenge)
    )
      return null;
    const challenge = run.challenge;
    if (
      !integer(challenge.difficulty, 1, 3) ||
      challenge.game !== run.game ||
      (challenge.mode !== undefined && challenge.mode !== run.mode) ||
      (challenge.version !== undefined && challenge.version !== run.version) ||
      !Array.isArray(challenge.rounds) ||
      challenge.rounds.length !== 5 ||
      !Array.isArray(run.answers) ||
      run.answers.length !== 5
    )
      return null;
    const controls: unknown[] = [];
    let numerator = 0,
      denominator = 0,
      extra = 0,
      hints = 0;
    for (let index = 0; index < 5; index++) {
      const round = challenge.rounds[index],
        answer = run.answers[index];
      if (
        !object(round) ||
        !object(answer) ||
        round.kind !== run.game ||
        !integer(round.stage, 0, 100)
      )
        return null;
      if (run.game === "flash") {
        if (
          !integer(round.rows, 2, 10) ||
          !integer(round.cols, 2, 10) ||
          !integer(round.count, 1, round.rows * round.cols) ||
          !integer(round.showMs, 1, 60_000) ||
          !selectedCells(round.cells, round.count, round.rows * round.cols) ||
          !selectedCells(answer.cells, round.count, round.rows * round.cols)
        )
          return null;
        numerator += answer.cells.filter((cell) =>
          round.cells.includes(cell),
        ).length;
        denominator += round.count;
        // Target positions are stimulus content; board size, count and exposure are controlled.
        controls.push({
          stage: round.stage,
          rows: round.rows,
          cols: round.cols,
          count: round.count,
          showMs: round.showMs,
        });
      } else if (run.game === "rotate") {
        if (
          !shape(round.shapeA) ||
          !shape(round.shapeB) ||
          typeof round.correctSame !== "boolean" ||
          typeof answer.same !== "boolean"
        )
          return null;
        const alignment = rotationAlignment(round.shapeA, round.shapeB);
        if (!alignment || !alignment.mirrored !== round.correctSame)
          return null;
        numerator += Number(answer.same === round.correctSame);
        denominator++;
        controls.push({
          stage: round.stage,
          a: normalizedShape(round.shapeA),
          b: normalizedShape(round.shapeB),
          same: round.correctSame,
        });
      } else if (run.game === "slide") {
        if (round.size !== 6 || !integer(round.parMoves, 1, 1000)) return null;
        const replay = replaySlideMoves(
          round as unknown as SlideRound,
          answer.moves,
        );
        const hintCount =
          answer.hints ??
          (object(challenge.states?.[index])
            ? challenge.states[index].hints
            : undefined);
        if (
          !replay.valid ||
          !replay.solved ||
          !integer(hintCount, 0, 1000) ||
          replay.moves < round.parMoves
        )
          return null;
        numerator += replay.moves;
        denominator += round.parMoves;
        extra += replay.moves - round.parMoves;
        hints += hintCount;
        controls.push({
          stage: round.stage,
          size: round.size,
          parMoves: round.parMoves,
          cars: round.cars
            .map((car: any) => ({
              target: car.id === "R",
              x: car.x,
              y: car.y,
              length: car.length,
              axis: car.axis,
            }))
            .sort(
              (a: any, b: any) =>
                Number(b.target) - Number(a.target) ||
                a.y - b.y ||
                a.x - b.x ||
                a.length - b.length ||
                a.axis.localeCompare(b.axis),
            ),
        });
      } else {
        if (
          !integer(round.durationMs, 1, 120_000) ||
          !Array.isArray(round.stations) ||
          ![2, 3].includes(round.stations.length) ||
          new Set(round.stations).size !== round.stations.length ||
          !round.stations.every((station: unknown) => integer(station, 0, 2)) ||
          !Array.isArray(round.initialSwitches) ||
          round.initialSwitches.length !== 2 ||
          !round.initialSwitches.every((position: unknown) =>
            integer(position, 0, 1),
          ) ||
          !Array.isArray(round.activeSwitches) ||
          !round.activeSwitches.length ||
          !round.activeSwitches.every((position: unknown) =>
            integer(position, 0, 1),
          ) ||
          !Array.isArray(round.trains) ||
          !round.trains.length ||
          round.trains.length > 40 ||
          !Array.isArray(answer.actions)
        )
          return null;
        for (const train of round.trains)
          if (
            !object(train) ||
            !integer(train.destination, 0, 2) ||
            !round.stations.includes(train.destination) ||
            !integer(train.spawnMs) ||
            !integer(train.switch0Ms) ||
            !integer(train.switch1Ms) ||
            !integer(train.arrivalMs) ||
            !(
              train.spawnMs < train.switch0Ms &&
              train.switch0Ms < train.switch1Ms &&
              train.switch1Ms < train.arrivalMs &&
              train.arrivalMs <= round.durationMs
            )
          )
            return null;
        const result = dispatchSnapshot(
          round as unknown as DispatchRound,
          answer.actions,
          round.durationMs,
        );
        numerator += result.correct;
        denominator += round.trains.length;
        controls.push({
          stage: round.stage,
          durationMs: round.durationMs,
          stations: [...round.stations].sort(),
          initialSwitches: round.initialSwitches,
          activeSwitches: [...round.activeSwitches].sort(),
          trains: round.trains.map((train: any) => ({
            destination: train.destination,
            spawnMs: train.spawnMs,
            switch0Ms: train.switch0Ms,
            switch1Ms: train.switch1Ms,
            arrivalMs: train.arrivalMs,
          })),
        });
      }
    }
    const kind =
      run.game === "flash"
        ? "flash_recovery"
        : run.game === "rotate"
          ? "rotate_accuracy"
          : run.game === "slide"
            ? "slide_extra_moves"
            : "dispatch_delivery";
    const label =
      run.game === "flash"
        ? "Восстановленные клетки"
        : run.game === "rotate"
          ? "Верно определённые фигуры"
          : run.game === "slide"
            ? "Лишние ходы на пяти полях"
            : "Поезда на своих станциях";
    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          game: run.game,
          mode: run.mode,
          version: run.version,
          difficulty: challenge.difficulty,
          controls,
        }),
      )
      .digest("hex");
    return {
      signature,
      assisted: run.game === "slide" && hints > 0,
      metric: {
        kind,
        label,
        current: run.game === "slide" ? extra : numerator / denominator,
        numerator,
        denominator,
        ...(run.game === "slide" ? { hints } : {}),
      },
    };
  } catch {
    return null;
  }
}

const comparisonNote =
  "Сравниваем только завершённые партии той же игры, режима, сложности и версии правил с совпадающими параметрами всех пяти раундов. Для фигур совпадает геометрия, для парковок — расстановка и кратчайший путь, для поездов — расписание и назначения. Для памяти совпадают размер поля, число клеток и время показа. Партии парковки с подсказками в сравнение не входят. Это личная игровая статистика.";
export function buildBrainInsight(
  current: InsightRun,
  history: InsightRun[],
): BrainInsightResult {
  const measured = measureBrainRun(current);
  const base: Pick<
    BrainInsightResult,
    "game" | "mode" | "difficulty" | "sample" | "comparisonNote"
  > = {
    game: current.game,
    mode:
      current.mode === "classic" || current.mode === "practice"
        ? current.mode
        : null,
    difficulty:
      object(current.challenge) && integer(current.challenge.difficulty, 1, 3)
        ? current.challenge.difficulty
        : null,
    sample: {
      previous: 0,
      required: BRAIN_INSIGHT_MIN_PREVIOUS,
      missing: BRAIN_INSIGHT_MIN_PREVIOUS,
    },
    comparisonNote,
  };
  if (!measured)
    return {
      ...base,
      status: "unavailable",
      metric: null,
      fact: "Для этой партии не хватает подробных данных для личного разбора.",
      nextStep:
        "Закончи новую практику, чтобы начать собирать подробную статистику.",
    };
  if (object(current.challenge) && current.challenge.comparison === true)
    return {
      ...base,
      status: "replay",
      metric: measured.metric,
      fact: `${currentInsightFact(measured.metric)} Повтор по вызову не участвует в сравнении.`,
      nextStep: "Выбери новую практику на этой сложности.",
    };
  const seen = new Set<string>([current.id]);
  const currentTime = completionTime(current)!;
  const prior = history.flatMap((run) => {
    if (object(run.challenge) && run.challenge.comparison === true) return [];
    if (seen.has(run.id)) return [];
    seen.add(run.id);
    const time = completionTime(run),
      measurement = measureBrainRun(run);
    return time !== null &&
      time < currentTime &&
      measurement &&
      !measurement.assisted &&
      measurement.signature === measured.signature
      ? [measurement]
      : [];
  });
  const sample = {
    previous: prior.length,
    required: BRAIN_INSIGHT_MIN_PREVIOUS,
    missing: Math.max(0, BRAIN_INSIGHT_MIN_PREVIOUS - prior.length),
  };
  const target = nextInsightTarget(measured.metric, measured.assisted);
  const raw = currentInsightFact(measured.metric);
  if (measured.assisted)
    return {
      ...base,
      status: "assisted",
      metric: measured.metric,
      sample,
      fact: `${raw} Использовано подсказок: ${measured.metric.hints}.`,
      nextStep: target,
    };
  if (sample.missing)
    return {
      ...base,
      status: "insufficient",
      metric: measured.metric,
      sample,
      fact: `${raw} Пока мало сопоставимых партий для сравнения.`,
      nextStep: target,
    };
  const baseline =
    prior.reduce((sum, item) => sum + item.metric.current, 0) / prior.length;
  const fact =
    measured.metric.kind === "slide_extra_moves"
      ? `${insightNumber(measured.metric.current)} лишних ходов без подсказок; в прошлых сопоставимых партиях в среднем — ${insightNumber(baseline)}.`
      : `${raw} В прошлых сопоставимых партиях в среднем — ${insightPercent(baseline)}.`;
  return {
    ...base,
    status: "ready",
    metric: { ...measured.metric, baseline },
    sample,
    fact,
    nextStep: target,
  };
}

export async function readBrainInsight(
  pool: Queryable,
  viewer: { userId?: string; browserHash: string },
  id: string,
): Promise<{ code: number; body: BrainInsightResult | { error: string } }> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return { code: 404, body: { error: "Партия не найдена" } };
  const { rows } = await pool.query(
    `SELECT id,game,version,mode,challenge,answers,completed_at,owner_id,published_at,expires_at FROM playne_games g WHERE g.id=$1 AND ((g.owner_id=$2::uuid AND $2::uuid IS NOT NULL) OR (g.owner_id IS NULL AND EXISTS(SELECT 1 FROM playne_guest_trials t WHERE t.run_id=g.id AND t.browser_hash=$3)))`,
    [id, viewer.userId ?? null, viewer.browserHash],
  );
  const current = rows[0];
  if (!current || !gameId(current.game))
    return { code: 404, body: { error: "Партия не найдена" } };
  if (!current.completed_at)
    return { code: 409, body: { error: "Сначала закончи партию" } };
  if (
    !current.published_at &&
    !(current.owner_id && current.mode === "practice") &&
    current.expires_at &&
    new Date(current.expires_at).getTime() < Date.now()
  )
    return { code: 410, body: { error: "Срок сохранения этой партии истёк" } };
  const owner = current.owner_id;
  const history = await pool.query(
    `SELECT id,game,version,mode,challenge,answers,completed_at FROM playne_games g WHERE g.game=$1 AND g.version=$2 AND g.mode=$3 AND g.completed_at<$4 AND ${owner ? "g.owner_id=$5::uuid" : "g.owner_id IS NULL AND EXISTS(SELECT 1 FROM playne_guest_trials t WHERE t.run_id=g.id AND t.browser_hash=$5)"} ORDER BY g.completed_at DESC,g.id`,
    [
      current.game,
      current.version,
      current.mode,
      current.completed_at,
      owner ?? viewer.browserHash,
    ],
  );
  return { code: 200, body: buildBrainInsight(current, history.rows) };
}

export async function registerBrainInsightRoutes(
  app: FastifyInstance,
  pool: Queryable,
  browser: (req: any, reply: any) => string,
  user: (req: any) => Promise<{ id: string } | null>,
) {
  app.get<{ Params: { id: string } }>(
    "/api/games/:id/insight",
    async (req, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const browserHash = browser(req, reply),
        signed = await user(req);
      const result = await readBrainInsight(
        pool,
        { browserHash, userId: signed?.id },
        req.params.id,
      );
      return reply.code(result.code).send(result.body);
    },
  );
}
