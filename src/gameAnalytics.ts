import { CIRCLE_GOALS, SHADE_GOALS, reachGoal, type MetrikaGoal, type MetrikaParams } from "./analytics";
import { ROUND_COUNT, shadePhase, shadeTotal, type ShadeAction, type ShadeSession } from "./colorfle";
import type { CircleResult } from "./circle";

type GoalEvent = { goal: MetrikaGoal; params: MetrikaParams };
export function shadeTransitionGoals(before: ShadeSession, after: ShadeSession, action: ShadeAction): GoalEvent[] {
  if (before === after) return [];
  if (action.type === "start") return [{ goal: SHADE_GOALS.gameStart, params: { source: "initial", round_count: ROUND_COUNT } }];
  if (action.type === "new") return [
    { goal: SHADE_GOALS.gameRestart, params: { previous_score: shadeTotal(before) } },
    { goal: SHADE_GOALS.gameStart, params: { source: "restart", round_count: ROUND_COUNT } },
  ];
  if (action.type !== "submit" || after.answers.length !== before.answers.length + 1) return [];
  const events: GoalEvent[] = [{ goal: SHADE_GOALS.roundComplete, params: { round_number: after.answers.length, score: after.answers.at(-1)!.score } }];
  if (shadePhase(after) === "finished") events.push({ goal: SHADE_GOALS.gameComplete, params: {
    score: shadeTotal(after), previous_best: before.stats.best, new_record: shadeTotal(after) > before.stats.best,
  } });
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
