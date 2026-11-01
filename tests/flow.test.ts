import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as legacy from "../src/flowV2";
import * as publishedV3 from "../src/flowV3";
import {
  FLOW_LEVELS,
  FLOW_VERSION,
  flowLaunchPackets,
  flowApproach,
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
        250,
      );
      expect(
        new Set(puzzle.cells.filter((c) => c >= 0)).size,
      ).toBeGreaterThanOrEqual(3);
      expect(puzzle.solution.length).toBeGreaterThanOrEqual(10);
      expect([3, 4]).toContain(puzzle.lanes.length);
      expect(puzzle.lanes.every((l) => l.length > 0)).toBe(true);
      expect(puzzle.slots).toBe(5);
    }
  });
  it("every campaign level has a legal winning supply sequence and conserves cubes", () => {
    const signatures = new Set<string>();
    const drawings = new Set<string>();
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
      drawings.add(JSON.stringify(puzzle.cells));
    }
    expect(signatures.size).toBe(FLOW_LEVELS);
    expect(drawings.size).toBe(FLOW_LEVELS);
  });
  it("keeps painted features coherent instead of changing colour every row", () => {
    const cat = makeFlowPuzzle("level", 1, 3);
    const rocket = makeFlowPuzzle("level", 2, 3);
    const strawberry = makeFlowPuzzle("level", 3, 3);
    const pixel = (p: FlowPuzzle, x: number, y: number) =>
      p.cells[y * 2 * p.width + x * 2];
    expect(pixel(cat, 1, 0)).toBe(2);
    expect(pixel(cat, 1, 4)).toBe(2);
    expect(pixel(cat, 4, 1)).toBe(-1);
    expect(pixel(cat, 3, 7)).toBe(0);
    expect(pixel(rocket, 4, 0)).toBe(1);
    expect(pixel(rocket, 4, 2)).toBe(1);
    expect(pixel(rocket, 4, 3)).toBe(4);
    expect(pixel(rocket, 4, 8)).toBe(3);
    expect(pixel(strawberry, 4, 0)).toBe(0);
    expect(pixel(strawberry, 4, 2)).toBe(1);
    expect(pixel(strawberry, 4, 8)).toBe(1);
    expect(cat.version).toBe(3);
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
  }, 15000);
  it("daily date changes at Moscow midnight, independent of local timezone", () => {
    expect(flowDay(new Date("2026-11-01T20:59:59Z"))).toBe("2026-11-01");
    expect(flowDay(new Date("2026-11-01T21:00:00Z"))).toBe("2026-11-02");
  });
});
const tiny: FlowPuzzle = {
  version: 2,
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
describe("Рой: exterior access, waiting teams and quotas", () => {
  const side: FlowPuzzle = {
    version: 4,
    id: "side:v4",
    name: "Side-access regression",
    width: 3,
    height: 3,
    cells: [4, 4, 4, 3, 3, 3, -1, -1, 4],
    slots: 5,
    lanes: [[{ id: 0, color: 4, count: 4 }], [{ id: 1, color: 3, count: 3 }]],
    solution: [0, 1],
  };
  const ring: FlowPuzzle = {
    version: 4,
    id: "hole:v4",
    name: "A sealed hole",
    width: 5,
    height: 5,
    cells: [
      3, 3, 3, 3, 3, 3, -1, -1, -1, 3, 3, -1, 4, -1, 3, 3, -1, -1, -1, 3, 3, 3,
      3, 3, 3,
    ],
    slots: 5,
    lanes: [[{ id: 0, color: 4, count: 1 }], [{ id: 1, color: 3, count: 2 }]],
    solution: [],
  };
  it("collects all four exposed blue cubes even when yellow cubes block their column bottoms", () => {
    const result = launchFlow(side, initialFlow(side), 0)!;
    expect(result.events.map((event) => event.cell).sort()).toEqual([
      0, 1, 2, 8,
    ]);
    expect(result.state.cells).toEqual([-1, -1, -1, 3, 3, 3, -1, -1, -1]);
    expect(result.state.active).toEqual([]);
    const old = { ...side, version: 2 as const };
    expect(launchFlow(old, initialFlow(old), 0)!.state.active[0].left).toBe(3);
  });
  it("keeps an enclosed hole inaccessible until its outer wall opens, then resumes the waiting team", () => {
    expect(flowFrontier(ring, ring.cells)).not.toContain(12);
    const waiting = launchFlow(ring, initialFlow(ring), 0)!;
    expect(waiting.events).toEqual([]);
    expect(waiting.state.active[0].left).toBe(1);
    const opened = launchFlow(ring, waiting.state, 1)!;
    expect(opened.events.map((event) => event.packet)).toEqual([1, 1, 0]);
    expect(opened.events.at(-1)?.cell).toBe(12);
    expect(opened.state.active).toEqual([]);
  });
  it("honours the printed quota even when more matching cubes remain exposed", () => {
    const quota = { ...side, lanes: [[{ id: 0, color: 4, count: 2 }]] };
    const result = launchFlow(quota, initialFlow(quota), 0)!;
    expect(result.events).toHaveLength(2);
    expect(result.state.active).toEqual([]);
    expect(
      flowFrontier(quota, result.state.cells).filter(
        (cell) => result.state.cells[cell] === 4,
      ),
    ).toHaveLength(2);
  });
  it("assigns the original outer layer before digging into newly exposed interior cubes", () => {
    const slab: FlowPuzzle = {
      version: 4,
      id: "layers:v4",
      name: "Peel the contour",
      width: 5,
      height: 5,
      cells: Array(25).fill(4),
      slots: 5,
      lanes: [
        [
          { id: 0, color: 4, count: 6 },
          { id: 1, color: 4, count: 10 },
          { id: 2, color: 4, count: 9 },
        ],
      ],
      solution: [0, 0, 0],
    };
    const originalEdge = flowFrontier(slab, slab.cells);
    expect(originalEdge).toHaveLength(16);
    const first = launchFlow(slab, initialFlow(slab), 0)!;
    const second = launchFlow(slab, first.state, 0)!;
    const allocated = [...first.events, ...second.events].map(
      (event) => event.cell,
    );
    expect(allocated).toEqual(originalEdge);
    expect(
      second.events.every((event) => originalEdge.includes(event.cell)),
    ).toBe(true);
    expect(flowFrontier(slab, second.state.cells)).toHaveLength(8);
    expect(
      replayFlow(
        slab,
        slab.solution.map((lane) => ({ type: "launch", lane })),
      ).won,
    ).toBe(true);
  });
  it("exposes an approach only through currently visible air, including dimension-only geometry", () => {
    const geometry = { width: 5, height: 5 };
    expect(flowApproach(geometry, ring.cells, 12)).toBeUndefined();
    const opened = [...ring.cells];
    opened[21] = -1;
    const path = flowApproach(geometry, opened, 12)!;
    expect(path.at(-1)).toEqual({ x: 2, y: 2 });
    for (const point of path.slice(1, -1))
      expect(opened[point.y * geometry.width + point.x]).toBe(-1);
    expect(flowApproach(geometry, opened, 21)).toBeUndefined();
    expect(flowApproach(geometry, opened, -1)).toBeUndefined();
    expect(
      flowApproach({ ...geometry, version: 2 }, opened, 12),
    ).toBeUndefined();
  });
  it("routes each worker only through externally reachable air before its target", () => {
    for (const level of [1, 2, 3, 12, 25, 36]) {
      const puzzle = makeFlowPuzzle("level", level);
      let state = initialFlow(puzzle);
      for (const lane of puzzle.solution) {
        const next = launchFlow(puzzle, state, lane)!;
        const cells = [...state.cells];
        for (const event of next.events) {
          expect(event.path?.length).toBeGreaterThanOrEqual(2);
          const path = event.path!;
          const first = path[0];
          expect(
            first.x < 0 ||
              first.x >= puzzle.width ||
              first.y < 0 ||
              first.y >= puzzle.height,
          ).toBe(true);
          for (let i = 1; i < path.length; i++) {
            expect(
              Math.abs(path[i].x - path[i - 1].x) +
                Math.abs(path[i].y - path[i - 1].y),
            ).toBe(1);
            const cell = path[i].y * puzzle.width + path[i].x;
            if (i < path.length - 1) expect(cells[cell]).toBe(-1);
            else expect(cell).toBe(event.cell);
          }
          cells[event.cell] = -1;
        }
        state = next.state;
      }
    }
  });
});

describe("Рой: frozen version 2 compatibility", () => {
  it("keeps published v2 board fingerprints unchanged", () => {
    const hash = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(hash(legacy.makeFlowPuzzle("level", 1))).toBe(
      "f08bafd570a4fc9de786b21ba4748fe696d592d335c8285db2d0a4aa4c446362",
    );
    expect(hash(legacy.makeFlowPuzzle("daily", "2026-11-01"))).toBe(
      "f945a30ba80363f88247da20f679518ad9a18d258f019f571ce683c631413b73",
    );
  });
  it("replays every legacy campaign identically, including legacy ids without a version marker", () => {
    for (let level = 1; level <= FLOW_LEVELS; level++) {
      const original = legacy.makeFlowPuzzle("level", level);
      const puzzle = makeFlowPuzzle("level", level, 2);
      const { version, ...content } = puzzle;
      expect(version).toBe(2);
      expect(content).toEqual(original);
      const actions = original.solution.map((lane) => ({
        type: "launch",
        lane,
      }));
      expect(replayFlow(puzzle, actions)).toEqual(
        legacy.replayFlow(original, actions),
      );
      expect(replayFlow(original, actions)).toEqual(
        legacy.replayFlow(original, actions),
      );
    }
  });
});
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
  it("preserves the legacy v2 lowest-column rule and waiting-team behavior", () => {
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

describe("Рой: frozen version 3 compatibility", () => {
  it("keeps both published board fingerprints byte-for-byte", () => {
    const hash = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(hash(makeFlowPuzzle("level", 1, 3))).toBe(
      "ad0f54f455765a1553bb7ec3646b064806ee6f69fb078b8ab542b66ae0f2b0a6",
    );
    expect(hash(makeFlowPuzzle("daily", "2026-11-01", 3))).toBe(
      "08358be1a7252848686fc58bc3b7f7e8175fbbacb02b885aa62f861e55f34492",
    );
  });
  it("dispatches every old campaign replay and unversioned v3 id to the frozen rules", () => {
    for (let level = 1; level <= FLOW_LEVELS; level++) {
      const original = publishedV3.makeFlowPuzzle("level", level);
      const puzzle = makeFlowPuzzle("level", level, 3);
      const actions = original.solution.map((lane) => ({
        type: "launch",
        lane,
      }));
      expect(puzzle).toEqual(original);
      expect(replayFlow(puzzle, actions)).toEqual(
        publishedV3.replayFlow(original, actions),
      );
      expect(replayFlow({ ...puzzle, version: undefined }, actions)).toEqual(
        publishedV3.replayFlow(original, actions),
      );
      expect(flowFrontier(puzzle, puzzle.cells)).toEqual(
        publishedV3.flowFrontier(original, original.cells),
      );
    }
  });
});

describe("Рой v4: paired commands and concealed information", () => {
  const pair: FlowPuzzle = {
    version: 4,
    id: "pair:v4",
    name: "Atomic pair",
    width: 3,
    height: 1,
    cells: [0, 1, 2],
    slots: 2,
    lanes: [
      [{ id: 0, color: 0, count: 1, link: "a" }],
      [{ id: 1, color: 1, count: 1, link: "a" }],
      [{ id: 2, color: 2, count: 1 }],
    ],
    solution: [0, 2],
  };
  it("launches both visible heads from either end as one journal action", () => {
    const before = initialFlow(pair);
    expect(
      flowLaunchPackets(pair, before, 0)?.map((item) => item.packet.id),
    ).toEqual([0, 1]);
    const first = launchFlow(pair, before, 0)!;
    expect(launchFlow(pair, before, 1)).toEqual(first);
    expect(first.state.lanes).toEqual([1, 1, 0]);
    expect(first.state.launches).toBe(1);
    expect(first.events.map((event) => event.packet)).toEqual([0, 1]);
    expect(
      replayFlow(
        pair,
        pair.solution.map((lane) => ({ type: "launch", lane })),
      ).won,
    ).toBe(true);
    expect(
      replayFlow(pair, [{ type: "launch", lane: 1 }, { type: "undo" }]).state,
    ).toEqual(before);
  });
  it("requires two free logical docks before doing any collection", () => {
    const before = {
      ...initialFlow(pair),
      active: [{ id: 10, color: 4, count: 2, left: 2 }],
    };
    const snapshot = structuredClone(before);
    expect(flowLaunchPackets(pair, before, 0)).toBeNull();
    expect(launchFlow(pair, before, 1)).toBeNull();
    expect(before).toEqual(snapshot);
  });
  it("waits until the partner reaches the head, then permits the pair", () => {
    const buried: FlowPuzzle = {
      ...pair,
      lanes: [
        pair.lanes[0],
        [{ id: 2, color: 2, count: 1 }, ...pair.lanes[1]],
        [],
      ],
      solution: [1, 0],
    };
    const before = initialFlow(buried);
    expect(flowLaunchPackets(buried, before, 0)).toBeNull();
    expect(launchFlow(buried, before, 0)).toBeNull();
    const opened = launchFlow(buried, before, 1)!.state;
    expect(flowLaunchPackets(buried, opened, 0)).toHaveLength(2);
    expect(
      replayFlow(
        buried,
        buried.solution.map((lane) => ({ type: "launch", lane })),
      ).won,
    ).toBe(true);
  });
  const delayedPair: FlowPuzzle = {
    version: 4,
    id: "delayed-pair:v4",
    name: "A finished end waits behind its bridge",
    width: 5,
    height: 5,
    cells: [
      0, 3, 3, 3, 3, 3, -1, -1, -1, 3, 3, -1, 1, -1, 3, 3, -1, -1, -1, 3, 3, 2,
      3, 3, 3,
    ],
    slots: 3,
    lanes: [
      [{ id: 0, color: 0, count: 1, link: "waiting" }],
      [{ id: 1, color: 1, count: 1, link: "waiting" }],
      [{ id: 2, color: 2, count: 1 }],
      [{ id: 3, color: 3, count: 14 }],
    ],
    solution: [0, 2, 3],
  };
  it("keeps both linked docks occupied when only one end has finished", () => {
    const puzzle = { ...delayedPair, slots: 2 };
    const before = initialFlow(puzzle);
    const first = launchFlow(puzzle, before, 0)!;
    expect(first.events.map((event) => event.packet)).toEqual([0]);
    expect(
      first.state.active.map((packet) => [packet.id, packet.left]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(
      first.state.active.every((packet) => packet.link === "waiting"),
    ).toBe(true);
    expect(first.state.lanes).toEqual([1, 1, 0, 0]);
    expect(flowLaunchPackets(puzzle, first.state, 2)).toBeNull();
    expect(launchFlow(puzzle, first.state, 2)).toBeNull();
    expect(flowStuck(puzzle, first.state)).toBe(true);
    expect(
      replayFlow(puzzle, [{ type: "launch", lane: 1 }, { type: "undo" }]).state,
    ).toEqual(before);
  });
  it("releases both ends together when a later command opens the partner's colour", () => {
    const first = launchFlow(delayedPair, initialFlow(delayedPair), 1)!;
    expect(first.state.active).toHaveLength(2);
    const opened = launchFlow(delayedPair, first.state, 2)!;
    expect(opened.events.map((event) => event.packet)).toEqual([2, 1]);
    expect(opened.state.active).toEqual([]);
    expect(opened.state.collected).toBe(3);
    expect(first.state.active.map((packet) => packet.left)).toEqual([0, 1]);
    expect(
      replayFlow(
        delayedPair,
        delayedPair.solution.map((lane) => ({ type: "launch", lane })),
      ).won,
    ).toBe(true);
  });
  it("introduces queue mysteries, linked pairs and interior patches in stages", () => {
    expect(FLOW_VERSION).toBe(4);
    expect(
      makeFlowPuzzle("level", 6)
        .lanes.flat()
        .some((p) => p.mystery),
    ).toBe(false);
    for (let level = 7; level <= FLOW_LEVELS; level++) {
      const puzzle = makeFlowPuzzle("level", level);
      expect(
        puzzle.lanes.flat().some((p) => p.mystery),
        `mystery ${level}`,
      ).toBe(true);
      expect(puzzle.lanes.every((lane) => !lane[0]?.mystery)).toBe(true);
      expect(puzzle.lanes.flat().some((p) => p.link)).toBe(level >= 13);
      if (level >= 21) {
        expect(puzzle.hiddenCells?.length).toBeGreaterThanOrEqual(6);
        const exposed = new Set(flowFrontier(puzzle, puzzle.cells));
        expect(
          puzzle.hiddenCells!.every(
            (cell) => puzzle.cells[cell] >= 0 && !exposed.has(cell),
          ),
        ).toBe(true);
      } else expect(puzzle.hiddenCells).toBeUndefined();
    }
  });
  it("hiding artwork and future labels does not alter collection rules", () => {
    const puzzle = makeFlowPuzzle("level", 29);
    const visible = {
      ...puzzle,
      hiddenCells: undefined,
      lanes: puzzle.lanes.map((lane) =>
        lane.map(({ mystery: _mystery, ...packet }) => packet),
      ),
    };
    const actions = puzzle.solution.map((lane) => ({ type: "launch", lane }));
    const actual = replayFlow(puzzle, actions),
      revealed = replayFlow(visible, actions);
    expect(actual.won).toBe(revealed.won);
    expect(actual.state.cells).toEqual(revealed.state.cells);
    expect(actual.state.collected).toBe(revealed.state.collected);
    expect(actual.events).toEqual(revealed.events);
  });
  it("preserves every colour total and uses substantial quotas instead of tiny fragments", () => {
    let blockedStarts = 0;
    for (let level = 1; level <= FLOW_LEVELS; level++) {
      const puzzle = makeFlowPuzzle("level", level),
        packets = puzzle.lanes.flat();
      const colors = new Set(puzzle.cells.filter((c) => c >= 0));
      for (const color of colors)
        expect(
          packets
            .filter((p) => p.color === color)
            .reduce((sum, p) => sum + p.count, 0),
        ).toBe(puzzle.cells.filter((c) => c === color).length);
      expect(packets.every((p) => p.count > 0 && p.count <= 49)).toBe(true);
      expect(
        packets.filter((p) => p.count >= 15).length / packets.length,
      ).toBeGreaterThan(0.6);
      expect(packets.filter((p) => p.count < 5).length).toBeLessThanOrEqual(3);
      const exposed = new Set(
        flowFrontier(puzzle, puzzle.cells).map((i) => puzzle.cells[i]),
      );
      if (puzzle.lanes.some((lane) => !exposed.has(lane[0].color)))
        blockedStarts++;
    }
    expect(blockedStarts).toBeGreaterThan(12);
  });
  it("caches immutable v4 puzzles without letting consumers change the daily layout", () => {
    const puzzle = makeFlowPuzzle("daily", "2026-11-01");
    expect(makeFlowPuzzle("daily", "2026-11-01")).toBe(puzzle);
    expect(Object.isFrozen(puzzle)).toBe(true);
    expect(Object.isFrozen(puzzle.cells)).toBe(true);
    expect(Object.isFrozen(puzzle.lanes[0][0])).toBe(true);
    expect(() => puzzle.cells.splice(0, 1)).toThrow();
    expect(makeFlowPuzzle("level", 1, 3)).not.toBe(
      makeFlowPuzzle("level", 1, 3),
    );
  });
});
