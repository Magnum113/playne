import { describe, expect, it } from "vitest";
import { flowAntRoute, flowMotion, flowWorld } from "../src/flowPresentation";
import { initialFlow, launchFlow, makeFlowPuzzle } from "../src/flow";

describe("Рой: visual timeline without changing rules", () => {
  it("delivers every collected cube, after pickup and before unlocking input", () => {
    const puzzle = makeFlowPuzzle("level", 1),
      events = launchFlow(
        puzzle,
        initialFlow(puzzle),
        puzzle.solution[0],
      )!.events;
    for (const speed of [1, 2] as const) {
      const time = flowMotion(events, speed, puzzle);
      expect(time.deliveries).toHaveLength(events.length);
      expect(
        time.pickups.every(
          (p, i) => p.at >= time.launch && time.deliveries[i].at > p.at,
        ),
      ).toBe(true);
      expect(time.deliveries.every((d) => d.at < time.finish)).toBe(true);
    }
    expect(flowMotion(events, 2, puzzle).finish).toBe(
      flowMotion(events, 1, puzzle).finish / 2,
    );
  });
  it("shows every round trip with no more than 18 workers walking at once", () => {
    const puzzle = makeFlowPuzzle("level", 1);
    const events = Array.from({ length: 100 }, (_, cell) => ({
      cell,
      packet: 1,
      color: 0,
      slot: 0,
    }));
    const time = flowMotion(events, 1, puzzle);
    expect(time.trips).toHaveLength(100);
    expect(time.deliveries).toHaveLength(100);
    const changes = time.trips
      .flatMap((t) => [
        { at: t.depart, delta: 1 },
        { at: t.deliveryAt, delta: -1 },
      ])
      .sort((a, b) => a.at - b.at || a.delta - b.delta);
    let walking = 0,
      peak = 0;
    for (const change of changes) {
      walking += change.delta;
      peak = Math.max(peak, walking);
    }
    expect(peak).toBeLessThanOrEqual(18);
    expect(peak).toBeGreaterThan(1);
    for (const trip of time.trips) {
      expect(trip.outbound).toBeGreaterThanOrEqual(1400);
      expect(trip.arrive).toBeLessThan(trip.at);
      expect(trip.at).toBeLessThan(trip.returnAt);
      expect(trip.returnAt).toBeLessThan(trip.deliveryAt);
      expect(trip.carry).toBeGreaterThanOrEqual(1150);
      expect(trip.deliveryAt).toBeLessThan(time.finish);
    }
    expect(flowMotion(events, 2, puzzle).finish).toBe(time.finish / 2);
    expect(flowMotion([], 1, puzzle).finish).toBe(300);
  });
  it("returns loaded workers to the nest, and waits for lower cubes to clear", () => {
    const puzzle = { width: 18, height: 16 };
    const bottom = 22 + puzzle.height * 24;
    const events = [15 * 18 + 5, 14 * 18 + 5, 13 * 18 + 5].map((cell) => ({
      cell,
      packet: 1,
      color: 0,
      slot: 2,
    }));
    const time = flowMotion(events, 1, puzzle);
    expect(flowAntRoute(puzzle, events[0]).returnPath).toContain(
      `L 270 ${bottom + 66}`,
    );
    for (let i = 1; i < time.trips.length; i++) {
      expect(time.trips[i].arrive).toBeGreaterThan(
        time.trips[i - 1].at + (24 / 125) * 1000,
      );
    }
  });
  it("assigns chapters and shared daily worlds deterministically", () => {
    expect(flowWorld("level", 1).id).toBe("meadow");
    expect(flowWorld("level", 13).id).toBe("mushroom");
    expect(flowWorld("level", 25).id).toBe("moonlight");
    expect(flowWorld("daily", "2026-11-01")).toEqual(
      flowWorld("daily", "2026-11-01"),
    );
  });
  it("appends concurrent launches without moving existing workers or reusing their physical slot", () => {
    const puzzle = { width: 18, height: 16 };
    const events = [250, 251, 252].map((cell) => ({
      cell,
      packet: 7,
      color: 0,
      slot: 0,
    }));
    const first = flowMotion(events, 1, puzzle, {
      epoch: "attempt",
      slots: new Map([[7, 4]]),
    });
    const snapshot = first.trips.map((trip) => ({ ...trip }));
    const second = flowMotion(
      [{ cell: 240, packet: 8, color: 1, slot: 0 }],
      1,
      puzzle,
      {
        now: 500,
        trips: first.trips,
        slots: new Map([
          [7, 4],
          [8, 2],
        ]),
        epoch: "attempt",
      },
    );
    expect(second.trips.slice(0, first.trips.length)).toEqual(snapshot);
    first.trips.forEach((trip, index) =>
      expect(second.trips[index]).toBe(trip),
    );
    expect(
      first.trips.every((trip) => trip.slot === 4 && trip.renderAt === 0),
    ).toBe(true);
    expect(second.added).toHaveLength(1);
    expect(second.added[0].slot).toBe(2);
    expect(second.added[0].renderAt).toBe(500);
    expect(second.added[0].depart).toBeLessThan(first.trips[0].deliveryAt);
    expect(second.trips.every((trip) => trip.id.startsWith("attempt:"))).toBe(
      true,
    );
  });
  it("shares the 18-worker pool across overlapping batches", () => {
    const puzzle = { width: 18, height: 16 };
    const events = Array.from({ length: 60 }, (_, cell) => ({
      cell,
      packet: cell < 30 ? 1 : 2,
      color: 0,
      slot: cell < 30 ? 0 : 1,
    }));
    const first = flowMotion(events.slice(0, 30), 1, puzzle);
    const appended = flowMotion(events.slice(30), 1, puzzle, {
      now: 700,
      trips: first.trips,
    });
    const changes = appended.trips
      .flatMap((trip) => [
        { at: trip.depart, delta: 1 },
        { at: trip.deliveryAt, delta: -1 },
      ])
      .sort((a, b) => a.at - b.at || a.delta - b.delta);
    let active = 0,
      peak = 0;
    for (const event of changes) {
      active += event.delta;
      peak = Math.max(peak, active);
    }
    expect(peak).toBe(18);
    expect(appended.added).toHaveLength(30);
    expect(new Set(appended.trips.map((trip) => trip.id)).size).toBe(60);
  });
  it("starts every physical dock independently even when earlier colours have queued more work", () => {
    const puzzle = { width: 18, height: 16 };
    const edgeCells = [
      Array.from({ length: 8 }, (_, x) => ({
        x,
        y: 15,
        outside: { x, y: 16 },
      })),
      Array.from({ length: 8 }, (_, i) => ({
        x: i + 8,
        y: 15,
        outside: { x: i + 8, y: 16 },
      })),
      Array.from({ length: 8 }, (_, x) => ({ x, y: 0, outside: { x, y: -1 } })),
      Array.from({ length: 8 }, (_, i) => ({
        x: i + 8,
        y: 0,
        outside: { x: i + 8, y: -1 },
      })),
      Array.from({ length: 8 }, (_, i) => ({
        x: 0,
        y: i + 1,
        outside: { x: -1, y: i + 1 },
      })),
    ];
    const slots = new Map(
      Array.from({ length: 5 }, (_, slot) => [slot + 1, slot]),
    );
    let plan = flowMotion([], 1, puzzle);
    for (let slot = 0; slot < 5; slot++) {
      const now = slot * 50;
      const events = edgeCells[slot].map(({ x, y, outside }) => ({
        cell: y * 18 + x,
        packet: slot + 1,
        color: slot,
        slot,
        path: [outside, { x, y }],
      }));
      const previous = plan;
      plan = flowMotion(events, 1, puzzle, {
        now,
        trips: plan.trips,
        slots,
        slotCount: 5,
      });
      expect(plan.added[0].depart).toBe(now + plan.launch);
      expect(plan.added.every((trip) => trip.worker % 5 === slot)).toBe(true);
      previous.trips.forEach((trip, index) =>
        expect(plan.trips[index]).toBe(trip),
      );
    }
    const changes = plan.trips
      .flatMap((trip) => [
        { at: trip.depart, delta: 1 },
        { at: trip.deliveryAt, delta: -1 },
      ])
      .sort((a, b) => a.at - b.at || a.delta - b.delta);
    let active = 0,
      peak = 0;
    for (const event of changes) {
      active += event.delta;
      peak = Math.max(peak, active);
    }
    expect(peak).toBe(18);
  });
  it("waits for an earlier visible pickup before walking through its newly cleared square", () => {
    const puzzle = { width: 3, height: 3 };
    const first = flowMotion(
      [
        {
          cell: 3,
          packet: 1,
          color: 0,
          slot: 0,
          path: [
            { x: -1, y: 1 },
            { x: 0, y: 1 },
          ],
        },
      ],
      1,
      puzzle,
    );
    const appended = flowMotion(
      [
        {
          cell: 5,
          packet: 2,
          color: 1,
          slot: 1,
          path: [
            { x: -1, y: 1 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
          ],
        },
      ],
      1,
      puzzle,
      { now: 300, trips: first.trips },
    );
    expect(appended.added[0].depart).toBeGreaterThan(first.trips[0].at);
    expect(appended.trips[0]).toBe(first.trips[0]);
  });
  it("uses a currently open exterior approach instead of waiting behind a pending logical shortcut", () => {
    const puzzle = { width: 3, height: 3 };
    const slots = new Map([
      [1, 0],
      [2, 1],
    ]);
    const first = flowMotion(
      [
        {
          cell: 3,
          packet: 1,
          color: 0,
          slot: 0,
          path: [
            { x: -1, y: 1 },
            { x: 0, y: 1 },
          ],
        },
      ],
      1,
      puzzle,
      { slots },
    );
    const originalPath = [
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    const event = { cell: 4, packet: 2, color: 1, slot: 1, path: originalPath };
    const visible = Array(9).fill(0) as number[];
    visible[1] = -1; // The top opening is clear while the left shortcut is still occupied.
    const alternate = flowMotion([event], 1, puzzle, {
      now: 100,
      trips: first.trips,
      slots,
      cells: visible,
    });
    expect(alternate.added[0].depart).toBe(100 + alternate.launch);
    expect(alternate.added[0].path).not.toEqual(originalPath);
    expect(alternate.added[0].path).toContainEqual({ x: 1, y: 0 });
    expect(alternate.added[0].path).not.toContainEqual({ x: 0, y: 1 });
    expect(alternate.trips[0]).toBe(first.trips[0]);
    const blocked = flowMotion([event], 1, puzzle, {
      now: 100,
      trips: first.trips,
      slots,
      cells: Array(9).fill(0),
    });
    expect(blocked.added[0].path).toEqual(originalPath);
    expect(blocked.added[0].depart).toBeGreaterThan(first.trips[0].at);
  });
  it("approaches top, side and corridor cubes through empty air and returns by the same corridor", () => {
    const puzzle = { width: 3, height: 3 };
    const examples = [
      {
        cell: 1,
        path: [
          { x: 1, y: -1 },
          { x: 1, y: 0 },
        ],
        empty: [],
      },
      {
        cell: 3,
        path: [
          { x: -1, y: 1 },
          { x: 0, y: 1 },
        ],
        empty: [],
      },
      {
        cell: 5,
        path: [
          { x: 3, y: 1 },
          { x: 2, y: 1 },
        ],
        empty: [],
      },
      {
        cell: 7,
        path: [
          { x: 1, y: 3 },
          { x: 1, y: 2 },
        ],
        empty: [],
      },
      {
        cell: 5,
        path: [
          { x: -1, y: 1 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        empty: [3, 4],
      },
    ];
    const startX = (540 - puzzle.width * 24) / 2;
    for (const example of examples) {
      const route = flowAntRoute(puzzle, {
        ...example,
        packet: 1,
        color: 0,
        slot: 2,
      });
      for (const points of [route.outboundPoints, route.returnPoints]) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
          for (let sample = 0; sample <= steps; sample++) {
            const x = a.x + ((b.x - a.x) * sample) / (steps || 1),
              y = a.y + ((b.y - a.y) * sample) / (steps || 1),
              column = Math.floor((x - startX) / 24),
              row = Math.floor((y - 22) / 24);
            if (column >= 0 && column < 3 && row >= 0 && row < 3)
              expect(example.empty).toContain(row * 3 + column);
          }
        }
      }
      expect(route.returnPoints[0]).toEqual({ x: route.x, y: route.y });
      expect(route.returnPoints.at(-1)).toEqual({
        x: 270,
        y: 22 + 3 * 24 + 66,
      });
    }
  });
});
