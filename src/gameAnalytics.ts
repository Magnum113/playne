import {
  CIRCLE_GOALS,
  COLORFLE_GOALS,
  reachGoal,
  type MetrikaGoal,
  type MetrikaParams,
} from "./analytics";
import {
  colorOutcome,
  colorSimilarity,
  MAX_COLOR_TRIES,
  type ColorAction,
  type ColorSession,
} from "./colorfle";
import type { CircleResult } from "./circle";

type GoalEvent = { goal: MetrikaGoal; params: MetrikaParams };

// Pure transition description: reducers and restoration never send events.
export function colorTransitionGoals(
  before: ColorSession,
  after: ColorSession,
  action: ColorAction,
): GoalEvent[] {
  if (before === after) return [];
  if (action.type === "start" && !before.started && after.started) {
    return [
      {
        goal: COLORFLE_GOALS.gameStart,
        params: { source: "initial", max_attempts: MAX_COLOR_TRIES },
      },
    ];
  }
  if (action.type === "new" && colorOutcome(before) !== "playing") {
    return [
      {
        goal: COLORFLE_GOALS.gameRestart,
        params: {
          previous_outcome: colorOutcome(before),
          previous_attempts: before.guesses.length,
        },
      },
      {
        goal: COLORFLE_GOALS.gameStart,
        params: { source: "restart", max_attempts: MAX_COLOR_TRIES },
      },
    ];
  }
  if (
    action.type !== "submit" ||
    after.guesses.length !== before.guesses.length + 1
  )
    return [];
  const attempt = after.guesses.length;
  const outcome = colorOutcome(after);
  const events: GoalEvent[] = [
    {
      goal: COLORFLE_GOALS.attemptComplete,
      params: {
        attempt_number: attempt,
        similarity: colorSimilarity(after.guesses[attempt - 1], after.secret),
        outcome,
      },
    },
  ];
  if (outcome !== "playing" && colorOutcome(before) === "playing") {
    const params = {
      outcome,
      attempts: attempt,
      previous_best: before.stats.best ?? 0,
      new_record:
        outcome === "won" &&
        (before.stats.best === null || attempt < before.stats.best),
    };
    events.push({ goal: COLORFLE_GOALS.gameComplete, params });
    if (outcome === "won")
      events.push({ goal: COLORFLE_GOALS.gameWin, params });
  }
  return events;
}

// One tracker per mounted board; consuming an attempt prevents pointer-up/cancel duplicates.
export function createCircleTracker(
  send = reachGoal,
  now = () => performance.now(),
) {
  let count = 0;
  let active: { started: number; pointer: string } | null = null;
  return {
    start(pointer: string) {
      if (active) return;
      count += 1;
      active = { started: now(), pointer };
      const params = { attempt_number: count, pointer_type: pointer };
      if (count > 1) send(CIRCLE_GOALS.retry, params);
      send(CIRCLE_GOALS.attemptStart, params);
    },
    finish(result: CircleResult, previousBest = 0, reason = "invalid_shape") {
      if (!active) return;
      const params: MetrikaParams = {
        attempt_number: count,
        pointer_type: active.pointer,
        duration_ms: Math.max(0, Math.round(now() - active.started)),
        valid: result.valid,
        ...(result.valid ? { score: result.score } : { reason }),
      };
      active = null;
      send(CIRCLE_GOALS.attemptComplete, params);
      if (result.valid && result.score > previousBest) {
        send(CIRCLE_GOALS.newRecord, {
          ...params,
          previous_best: previousBest,
        });
      }
    },
  };
}
