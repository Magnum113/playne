import { describe, expect, it } from "vitest";
import { initialFlow, launchFlow, makeFlowPuzzle } from "../src/flow";
import { flowGeometry } from "../src/flowGeometry";
import { flowPathSamples } from "../src/flowPaths";
import { flowMotion } from "../src/flowPresentation";

const grid = { version: 4 as const, width: 3, height: 3 };
const event = (cell: number, packet: number) => ({
  cell,
  packet,
  color: packet,
  slot: packet,
});
describe("physical colony scheduling", () => {
  it("lets a follower leave before the first pickup while delaying entry into its corridor", () => {
    const plan = flowMotion(
      [event(7, 0), { ...event(4, 1), color: 0 }],
      1,
      grid,
      {
        cells: Array(9).fill(0),
      },
    );
    const opening = plan.added.find((t) => t.cell === 7)!,
      enclosed = plan.added.find((t) => t.cell === 4)!;
    expect(opening.depart).toBe(220);
    expect(enclosed.depart).toBe(opening.depart);
    expect(enclosed.arrive).toBeGreaterThan(opening.at);
    expect(enclosed.path).toContainEqual({ x: 1, y: 2 });
  });
  it("waits for a different colour to open a sealed target, without waiting for delivery", () => {
    const plan = flowMotion([event(7, 0), event(4, 1)], 1, grid, {
      cells: Array(9).fill(0),
    });
    const opening = plan.added.find((t) => t.cell === 7)!,
      follower = plan.added.find((t) => t.cell === 4)!;
    expect(follower.depart).toBeGreaterThan(opening.at);
    expect(follower.depart).toBeLessThan(opening.deliveryAt);
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
  it("dispatches all three adjacent final black cubes before the first pickup or delivery", () => {
    const p = { version: 4 as const, width: 24, height: 24 };
    const cells = Array(576).fill(-1),
      ids = [278, 279, 280];
    ids.forEach((cell) => (cells[cell] = 7));
    for (const speed of [1, 2] as const) {
      const plan = flowMotion(
        ids.map((cell) => ({ ...event(cell, 0), color: 7 })),
        speed,
        p,
        { cells },
      );
      expect(plan.trips.map((t) => t.depart)).toEqual(
        [220, 520, 820].map((t) => t / speed),
      );
      expect(plan.trips.at(-1)!.depart).toBeLessThan(
        Math.min(...plan.trips.map((t) => t.at)),
      );
      expect(plan.trips.at(-1)!.depart).toBeLessThan(
        Math.min(...plan.trips.map((t) => t.deliveryAt)),
      );
      expect(new Set(plan.trips.map((t) => t.cell)).size).toBe(3);
    }
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
    "never enters occupied cubes on either leg throughout level %i",
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
      const pickedAt = new Map(plan.trips.map((trip) => [trip.cell, trip.at]));
      const g = flowGeometry(puzzle);
      for (const trip of plan.trips) {
        for (const [path, start, duration] of [
          [trip.outboundPath, trip.depart, trip.outbound],
          [trip.returnPath, trip.returnAt, trip.carry],
        ] as const) {
          const samples = flowPathSamples(path),
            length = samples.at(-1)!.distance;
          for (const point of samples) {
            const x = Math.floor((point.x - g.startX) / g.step),
              y = Math.floor((point.y - g.startY) / g.step);
            if (x < 0 || x >= puzzle.width || y < 0 || y >= puzzle.height)
              continue;
            const cell = y * puzzle.width + x;
            if (puzzle.cells[cell] < 0) continue;
            const at = start + (duration * point.distance) / length;
            expect(
              pickedAt.get(cell),
              `level ${level}, ant ${trip.cell}, crossing ${cell}`,
            ).toBeLessThanOrEqual(at + 0.001);
          }
        }
        expect(trip.returnPoints.at(-1)).toEqual({ x: 270, y: g.homeY });
      }
      expect(new Set(plan.trips.map((t) => t.cell)).size).toBe(
        puzzle.cells.filter((c) => c >= 0).length,
      );
    },
  );
});
