import { describe, expect, it } from "vitest";
import {
  flowApproach,
  initialFlow,
  launchFlow,
  makeFlowPuzzle,
} from "../src/flow";
import { flowGeometry } from "../src/flowGeometry";
import { flowMotion } from "../src/flowPresentation";

const grid = { version: 4 as const, width: 3, height: 3 };
const event = (cell: number, packet: number) => ({
  cell,
  packet,
  color: packet,
  slot: packet,
});
describe("physical colony scheduling", () => {
  it("keeps an enclosed target in its box until a real pickup opens its corridor", () => {
    const plan = flowMotion([event(7, 0), event(4, 1)], 1, grid, {
      cells: Array(9).fill(0),
    });
    const opening = plan.added.find((t) => t.cell === 7)!,
      enclosed = plan.added.find((t) => t.cell === 4)!;
    expect(opening.depart).toBe(220);
    expect(enclosed.depart).toBeGreaterThan(opening.at);
    expect(enclosed.path).toContainEqual({ x: 1, y: 2 });
  });
  it("sends different boxes together and paces one colony without a four-ant cap", () => {
    const p = { version: 4 as const, width: 9, height: 1 };
    const events = Array.from({ length: 8 }, (_, cell) =>
      event(cell, cell === 7 ? 1 : 0),
    );
    const plan = flowMotion(events, 1, p, { cells: Array(9).fill(0) });
    const a = plan.added.filter((t) => t.packet === 0),
      b = plan.added.find((t) => t.packet === 1)!;
    expect(a).toHaveLength(7);
    expect(a.map((t) => t.depart)).toEqual([
      220, 520, 820, 1120, 1420, 1720, 2020,
    ]);
    expect(b.depart).toBe(220);
    expect(new Set(plan.trips.map((t) => t.cell)).size).toBe(8);
  });
  it("chooses the nearer accessible cube rather than the supplied array order", () => {
    const g = flowGeometry(grid);
    const plan = flowMotion([event(8, 0), event(6, 0)], 1, grid, {
      cells: Array(9).fill(0),
      origins: new Map([[0, { x: g.startX, y: g.bottom + 120 }]]),
    });
    expect(plan.added[0].cell).toBe(6);
  });
  it("appends another box without resetting a walking ant or reserving its cube twice", () => {
    const first = flowMotion([event(6, 0)], 1, grid, {
      cells: Array(9).fill(0),
    });
    const next = flowMotion([event(6, 0), event(8, 1)], 1, grid, {
      cells: Array(9).fill(0),
      trips: first.trips,
      now: 300,
    });
    expect(next.trips[0]).toBe(first.trips[0]);
    expect(next.added.map((t) => t.cell)).toEqual([8]);
  });
  it.each([1, 13, 36])(
    "only departs through physically open air throughout level %i",
    (level) => {
      const puzzle = makeFlowPuzzle("level", level);
      let state = initialFlow(puzzle),
        plan = flowMotion([], 1, puzzle);
      for (const lane of puzzle.solution) {
        const next = launchFlow(puzzle, state, lane)!;
        plan = flowMotion(next.events, 1, puzzle, {
          cells: puzzle.cells,
          trips: plan.trips,
        });
        state = next.state;
      }
      const picked = [...plan.trips].sort((a, b) => a.at - b.at),
        visible = [...puzzle.cells];
      let cursor = 0;
      for (const trip of [...plan.trips].sort((a, b) => a.depart - b.depart)) {
        while (cursor < picked.length && picked[cursor].at <= trip.depart)
          visible[picked[cursor++].cell] = -1;
        expect(flowApproach(puzzle, visible, trip.cell)).toBeDefined();
        expect(trip.returnPoints.at(-1)).toEqual({
          x: 270,
          y: flowGeometry(puzzle).homeY,
        });
      }
      expect(new Set(plan.trips.map((t) => t.cell)).size).toBe(
        puzzle.cells.filter((c) => c >= 0).length,
      );
    },
  );
});
