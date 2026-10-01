import { describe, it, expect, vi } from "vitest";
import { createCircleTracker, shadeTransitionGoals } from "../src/gameAnalytics";
import { newShadeSession, shadeReducer, type ShadeAction, type ShadeSession } from "../src/colorfle";
function events(state: ShadeSession, action: ShadeAction) {
  return shadeTransitionGoals(state, shadeReducer(state, action), action);
}
describe("Оттенок analytics", () => {
  it("emits start, each accepted round, completion, and restart once", () => {
    let state = newShadeSession();
    expect(events(state, { type: "start" }).map(e => e.goal)).toEqual(["ottenok_game_start"]);
    state = shadeReducer(state, { type: "start" });
    expect(events(state, { type: "start" })).toEqual([]);
    for (let i = 0; i < 5; i++) {
      expect(events(state, { type: "submit" })).toEqual([]);
      state = shadeReducer(state, { type: "pick", color: state.targets[i] });
      const emitted = events(state, { type: "submit" });
      expect(emitted.map(e => e.goal)).toEqual(i === 4 ? ["ottenok_round_complete", "ottenok_game_complete"] : ["ottenok_round_complete"]);
      state = shadeReducer(state, { type: "submit" });
      if (i < 4) state = shadeReducer(state, { type: "next" });
    }
    expect(events(state, { type: "submit" })).toEqual([]);
    const action = { type: "new", session: newShadeSession(state) } as const;
    expect(events(state, action).map(e => e.goal)).toEqual(["ottenok_game_restart", "ottenok_game_start"]);
  });
});
describe("Circle analytics lifecycle", () => {
  it("deduplicates pointer completion and cancellation; retry requires a new stroke", () => {
    const send = vi.fn();
    let time = 100;
    const tracker = createCircleTracker(send, () => time);
    expect(send).not.toHaveBeenCalled();
    tracker.start("touch");
    tracker.start("touch");
    time = 1100;
    tracker.finish({ valid: true, score: 96, radius: 100 }, 90);
    tracker.finish({ valid: false, message: "cancel" });
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      "circle_attempt_start",
      "circle_attempt_complete",
      "circle_new_record",
    ]);
    expect(send.mock.calls[1][1]).toMatchObject({
      duration_ms: 1000,
      valid: true,
      score: 96,
      pointer_type: "touch",
    });
    tracker.start("mouse");
    tracker.finish({ valid: false, message: "" }, 0, "outside_board");
    expect(send.mock.calls.slice(3).map((c) => c[0])).toEqual([
      "circle_retry",
      "circle_attempt_start",
      "circle_attempt_complete",
    ]);
    expect(send.mock.calls[5][1]).toMatchObject({
      attempt_number: 2,
      valid: false,
      reason: "outside_board",
    });
    expect(send.mock.calls[5][1]).not.toHaveProperty("score");
  });
  it("does not count an equal or lower score as a record", () => {
    const send = vi.fn();
    const tracker = createCircleTracker(send, () => 0);
    tracker.start("mouse");
    tracker.finish({ valid: true, score: 96, radius: 100 }, 96);
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      "circle_attempt_start",
      "circle_attempt_complete",
    ]);
  });
});
