import { describe, expect, it } from "vitest";
import {
  FLOW_LEVELS,
  flowDay,
  flowFrontier,
  flowSolution,
  flowStuck,
  initialFlow,
  launchFlow,
  makeFlowPuzzle,
  replayFlow,
  type FlowPuzzle,
} from "../src/flow";

describe("Рой: deterministic and solvable levels", () => {
  it("starts with full puzzles rather than three-move tutorials", () => {
    for (let level = 1; level <= 3; level++) {
      const puzzle = makeFlowPuzzle("level", level);
      expect(puzzle.cells.filter((c) => c >= 0).length).toBeGreaterThanOrEqual(
        160,
      );
      expect(
        new Set(puzzle.cells.filter((c) => c >= 0)).size,
      ).toBeGreaterThanOrEqual(4);
      expect(puzzle.solution.length).toBeGreaterThanOrEqual(16);
      expect(puzzle.lanes).toHaveLength(4);
      expect(puzzle.lanes.every((l) => l.length > 0)).toBe(true);
      expect(puzzle.slots).toBe(5);
    }
  });
  it("every campaign level has a legal winning supply sequence and conserves cubes", () => {
    const signatures = new Set<string>();
    for (let level = 1; level <= FLOW_LEVELS; level++) {
      const puzzle = makeFlowPuzzle("level", level);
      expect(puzzle).toEqual(makeFlowPuzzle("level", level));
      expect(puzzle.lanes.flat().reduce((sum, p) => sum + p.count, 0)).toBe(
        puzzle.cells.filter((c) => c >= 0).length,
      );
      const result = replayFlow(
        puzzle,
        puzzle.solution.map((lane) => ({ type: "launch", lane })),
      );
      expect(result.won, `level ${level}`).toBe(true);
      expect(result.score).toBe(1000);
      expect(result.state.active).toEqual([]);
      signatures.add(JSON.stringify([puzzle.cells, puzzle.lanes]));
    }
    expect(signatures.size).toBe(FLOW_LEVELS);
  });
  it("a full year of daily challenges is reproducible and solvable", () => {
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10),
        puzzle = makeFlowPuzzle("daily", day);
      expect(
        replayFlow(
          puzzle,
          puzzle.solution.map((lane) => ({ type: "launch", lane })),
        ).won,
        day,
      ).toBe(true);
    }
    expect(makeFlowPuzzle("daily", "2026-11-01")).not.toEqual(
      makeFlowPuzzle("daily", "2026-11-02"),
    );
  });
  it("daily date changes at Moscow midnight, independent of local timezone", () => {
    expect(flowDay(new Date("2026-11-01T20:59:59Z"))).toBe("2026-11-01");
    expect(flowDay(new Date("2026-11-01T21:00:00Z"))).toBe("2026-11-02");
  });
});
const tiny: FlowPuzzle = {
  id: "test",
  name: "A blocked column",
  width: 1,
  height: 3,
  cells: [0, 1, 2],
  slots: 2,
  lanes: [
    [{ id: 0, color: 0, count: 1 }],
    [{ id: 1, color: 1, count: 1 }],
    [{ id: 2, color: 2, count: 1 }],
  ],
  solution: [2, 1, 0],
};
describe("Рой: queues, waiting, recovery and validation", () => {
  it("supports the fourth queue in replay and hint search", () => {
    const four: FlowPuzzle = {
      ...tiny,
      height: 4,
      cells: [0, 1, 2, 3],
      lanes: [...tiny.lanes, [{ id: 3, color: 3, count: 1 }]],
      solution: [3, 2, 1, 0],
    };
    const first = launchFlow(four, initialFlow(four), 3)!;
    expect(first.state.collected).toBe(1);
    expect(first.state.lanes).toEqual([0, 0, 0, 1]);
    expect(flowSolution(four, first.state)).toEqual([2, 1, 0]);
    expect(
      replayFlow(
        four,
        four.solution.map((lane) => ({ type: "launch", lane })),
      ).won,
    ).toBe(true);
    expect(launchFlow(four, first.state, 4)).toBeNull();
  });
  it("only the lowest cube is accessible; a team waits for its colour", () => {
    expect(flowFrontier(tiny, tiny.cells)).toEqual([2]);
    const first = launchFlow(tiny, initialFlow(tiny), 0)!;
    expect(first.events).toEqual([]);
    expect(first.state.active[0].left).toBe(1);
    const next = launchFlow(tiny, first.state, 2)!;
    expect(next.state.cells).toEqual([0, 1, -1]);
    expect(next.state.active[0].color).toBe(0);
    const end = launchFlow(tiny, next.state, 1)!;
    expect(end.state.cells).toEqual([-1, -1, -1]);
    expect(end.state.active).toEqual([]);
  });
  it("detects a full-dock deadlock and undo restores the exact previous state", () => {
    const one = replayFlow(tiny, [{ type: "launch", lane: 0 }]);
    const stuck = replayFlow(tiny, [
      { type: "launch", lane: 0 },
      { type: "launch", lane: 1 },
    ]);
    expect(flowStuck(tiny, stuck.state)).toBe(true);
    expect(launchFlow(tiny, stuck.state, 2)).toBeNull();
    expect(flowSolution(tiny, stuck.state)).toBeNull();
    const recovered = replayFlow(tiny, [
      { type: "launch", lane: 0 },
      { type: "launch", lane: 1 },
      { type: "undo" },
    ]);
    expect(recovered.state).toEqual(one.state);
    expect(recovered.undos).toBe(1);
    const path = flowSolution(tiny, recovered.state)!;
    expect(
      replayFlow(tiny, [
        { type: "launch", lane: 0 },
        ...path.map((lane) => ({ type: "launch", lane })),
      ]).won,
    ).toBe(true);
  });
  it("finds winning hints for the campaign", () => {
    for (const level of [1, 5, 12, 17, 25, 36]) {
      const puzzle = makeFlowPuzzle("level", level),
        path = flowSolution(puzzle, initialFlow(puzzle));
      expect(path, `hint for level ${level}`).not.toBeNull();
      expect(
        replayFlow(
          puzzle,
          path!.map((lane) => ({ type: "launch", lane })),
        ).won,
      ).toBe(true);
    }
  });
  it("replays penalties rather than trusting client-provided scores", () => {
    const result = replayFlow(tiny, [
      { type: "hint" },
      { type: "launch", lane: 0 },
      { type: "undo" },
      ...tiny.solution.map((lane) => ({ type: "launch", lane })),
    ]);
    expect(result.won).toBe(true);
    expect(result.score).toBe(880);
    expect(result.stars).toBe(2);
  });
  it("rejects forged, excessive, impossible and post-victory actions", () => {
    for (const actions of [
      null,
      Array(601).fill({ type: "hint" }),
      [{ type: "undo" }],
      [{ type: "launch", lane: 3 }],
      [{ type: "launch", lane: 0.5 }],
      [{ type: "teleport" }],
      [
        ...tiny.solution.map((lane) => ({ type: "launch", lane })),
        { type: "hint" },
      ],
    ])
      expect(() => replayFlow(tiny, actions)).toThrow();
    for (const level of [0, 37, 1.5, NaN])
      expect(() => makeFlowPuzzle("level", level)).toThrow();
  });
});
