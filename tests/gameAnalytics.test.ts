import { describe, it, expect, vi } from "vitest";
import {
  createCircleTracker,
  colorTransitionGoals,
} from "../src/gameAnalytics";
import {
  colorReducer,
  newColorSession,
  type ColorSession,
  type ColorAction,
  type Recipe,
} from "../src/colorfle";

function session(): ColorSession {
  return { ...newColorSession(), secret: [0, 4, 7] };
}
function events(state: ColorSession, action: ColorAction) {
  return colorTransitionGoals(state, colorReducer(state, action), action);
}
describe("Colorfle analytics transitions", () => {
  it("counts a real start once, not an already restored game", () => {
    const initial = session();
    expect(events(initial, { type: "start" }).map((e) => e.goal)).toEqual([
      "colorfle_game_start",
    ]);
    expect(events({ ...initial, started: true }, { type: "start" })).toEqual(
      [],
    );
  });
  it("ignores incomplete, duplicate and non-submit actions", () => {
    const state = { ...session(), started: true };
    expect(events(state, { type: "submit" })).toEqual([]);
    expect(events(state, { type: "choose", color: 1 })).toEqual([]);
    expect(
      events(
        { ...state, guesses: [[1, 2, 3]], draft: [1, 2, 3] },
        { type: "submit" },
      ),
    ).toEqual([]);
  });
  it("reports a win and record exactly once", () => {
    const state: ColorSession = {
      ...session(),
      started: true,
      draft: [0, 4, 7],
    };
    const action = { type: "submit" } as const;
    const result = events(state, action);
    expect(result.map((e) => e.goal)).toEqual([
      "colorfle_attempt_complete",
      "colorfle_game_complete",
      "colorfle_game_win",
    ]);
    expect(result[1].params).toMatchObject({
      outcome: "won",
      attempts: 1,
      new_record: true,
    });
    const won = colorReducer(state, action);
    expect(events(won, action)).toEqual([]);
    expect(events(won, { type: "start" })).toEqual([]);
  });
  it("reports six accepted guesses and one loss without a win", () => {
    let state = { ...session(), started: true };
    const all = [];
    const guesses: Recipe[] = [
      [1, 2, 3],
      [1, 2, 5],
      [1, 2, 6],
      [1, 2, 8],
      [1, 3, 5],
      [1, 3, 6],
    ];
    for (const draft of guesses) {
      state = { ...state, draft };
      all.push(...events(state, { type: "submit" }));
      state = colorReducer(state, { type: "submit" });
    }
    expect(
      all.filter((e) => e.goal === "colorfle_attempt_complete"),
    ).toHaveLength(6);
    expect(all.filter((e) => e.goal === "colorfle_game_complete")).toEqual([
      expect.objectContaining({
        params: expect.objectContaining({
          outcome: "lost",
          attempts: 6,
          new_record: false,
        }),
      }),
    ]);
    expect(all.some((e) => e.goal === "colorfle_game_win")).toBe(false);
    expect(events(state, { type: "submit" })).toEqual([]);
    const action = { type: "new", session: newColorSession(state) } as const;
    expect(events(state, action).map((e) => e.goal)).toEqual([
      "colorfle_game_restart",
      "colorfle_game_start",
    ]);
    expect(events(action.session, action)).toEqual([]);
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
