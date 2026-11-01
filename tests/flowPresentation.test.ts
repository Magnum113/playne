import { describe, expect, it } from "vitest";
import {
  flowAntRoute,
  flowMotion,
  flowRetimeMotion,
  flowWorld,
  type FlowTrip,
} from "../src/flowPresentation";
import { initialFlow, launchFlow, makeFlowPuzzle } from "../src/flow";
import { flowGeometry } from "../src/flowGeometry";

const absoluteTripTimes = [
  "depart",
  "arrive",
  "at",
  "returnAt",
  "deliveryAt",
] as const;
const tripDurations = ["outbound", "carry", "pickupPause"] as const;

function retimeScenario() {
  const puzzle = { width: 48, height: 24, version: 4 as const };
  const events = Array.from({ length: 40 }, (_, x) => ({
    cell: 23 * 48 + x,
    packet: 9,
    color: 4,
    slot: 1,
    path: [
      { x, y: 24 },
      { x, y: 23 },
    ],
  }));
  return { puzzle, events, motion: flowMotion(events, 1, puzzle) };
}

function expectSameAnt(before: FlowTrip, after: FlowTrip) {
  for (const key of [
    "id",
    "worker",
    "renderAt",
    "cell",
    "packet",
    "color",
    "slot",
    "x",
    "y",
    "outboundPath",
    "returnPath",
    "outboundLength",
    "returnLength",
  ] as const)
    expect(after[key]).toBe(before[key]);
  expect(after.path).toBe(before.path);
  expect(after.outboundPoints).toBe(before.outboundPoints);
  expect(after.returnPoints).toBe(before.returnPoints);
}

describe("Рой: changing the colony clock rate", () => {
  it("preserves outbound and pending phases while scaling all remaining times", () => {
    const { motion } = retimeScenario();
    const first = motion.trips[0];
    const now = first.depart + first.outbound * 0.4;
    const snapshot = structuredClone(motion);
    const fast = flowRetimeMotion(motion, now, 1, 2);

    expect(motion).toEqual(snapshot);
    expect(fast.trips).toHaveLength(40);
    expect(new Set(fast.trips.map((trip) => trip.id)).size).toBe(40);
    const pending = motion.trips.findIndex((trip) => trip.depart > now);
    expect(pending).toBeGreaterThan(0);
    expect(fast.trips[pending].depart).toBeGreaterThan(now);
    expect((now - fast.trips[0].depart) / fast.trips[0].outbound).toBeCloseTo(
      0.4,
    );
    motion.trips.forEach((trip, i) => {
      const next = fast.trips[i];
      expectSameAnt(trip, next);
      for (const key of absoluteTripTimes)
        expect(next[key]).toBeCloseTo(now + (trip[key] - now) / 2);
      for (const key of tripDurations)
        expect(next[key]).toBeCloseTo(trip[key] / 2);
      expect(fast.added[i]).toBe(next);
      expect(fast.pickups[i]).toBe(next);
      expect(fast.deliveries[i]).toEqual({ ...next, at: next.deliveryAt });
    });
    expect(fast.launch).toBe(motion.launch / 2);
    expect(fast.pickupPause).toBe(motion.pickupPause / 2);
    expect(fast.stagger).toBe(motion.stagger / 2);
    expect(fast.finish - now).toBeCloseTo((motion.finish - now) / 2);
  });

  it("keeps the carried cube at the same return-path position", () => {
    const { motion } = retimeScenario();
    const trip = motion.trips[0];
    const now = trip.returnAt + trip.carry * 0.65;
    const fast = flowRetimeMotion(motion, now, 1, 2);
    const carried = fast.trips[0];

    expect(carried.at).toBeLessThan(now);
    expect(carried.returnAt).toBeLessThan(now);
    expect(carried.deliveryAt).toBeGreaterThan(now);
    expect((now - carried.returnAt) / carried.carry).toBeCloseTo(0.65);
    expect(carried.deliveryAt - now).toBeCloseTo((trip.deliveryAt - now) / 2);
    expectSameAnt(trip, carried);
  });

  it("preserves each cube's CSS assignment clock across speed changes", () => {
    const { puzzle, events } = retimeScenario();
    const motion = flowMotion(events.slice(0, 1), 1, puzzle, { now: 400 });
    const original = motion.trips[0];
    const now = original.depart + original.outbound * 0.3;
    const fast = flowRetimeMotion(motion, now, 1, 2);
    const slow = flowRetimeMotion(fast, now + 100, 2, 1);

    for (const updated of [fast.trips[0], slow.trips[0]]) {
      expect(updated.renderAt).toBe(400);
      const cssPickupDelay = updated.at - updated.renderAt;
      expect(original.renderAt + cssPickupDelay).toBeCloseTo(updated.at);
    }
  });

  it("round-trips 1×→2×→1× without drift or restarting an ant", () => {
    const { motion } = retimeScenario();
    const trip = motion.trips[0];
    const now = trip.depart + trip.outbound * 0.25;
    const fast = flowRetimeMotion(motion, now, 1, 2);
    const restored = flowRetimeMotion(fast, now, 2, 1);

    for (const [i, before] of motion.trips.entries()) {
      expectSameAnt(before, restored.trips[i]);
      for (const key of [...absoluteTripTimes, ...tripDurations])
        expect(restored.trips[i][key]).toBeCloseTo(before[key]);
    }
    expect(restored.finish).toBeCloseTo(motion.finish);

    // Spending 100 real milliseconds at 2× advances the original clock by 200.
    const elapsed = 100;
    const later = flowRetimeMotion(fast, now + elapsed, 2, 1);
    expect(
      (now + elapsed - later.trips[0].depart) / later.trips[0].outbound,
    ).toBeCloseTo(0.25 + (elapsed * 2) / trip.outbound);
    motion.trips.forEach((before, i) => {
      for (const key of absoluteTripTimes)
        expect(later.trips[i][key]).toBeCloseTo(before[key] - elapsed);
      for (const key of tripDurations)
        expect(later.trips[i][key]).toBeCloseTo(before[key]);
    });
    expect(later.finish).toBeCloseTo(motion.finish - elapsed);
    expect(flowRetimeMotion(later, now + elapsed, 1, 1)).toBe(later);
  });

  it("keeps delivered ants out of all arrays and appends future work once", () => {
    const { puzzle, events, motion } = retimeScenario();
    const first = motion.trips[0];
    const now = first.deliveryAt + 1;
    const outstanding = motion.trips.filter((trip) => trip.deliveryAt > now);
    const fast = flowRetimeMotion({ ...motion, trips: outstanding }, now, 1, 2);
    const ids = outstanding.map((trip) => trip.id);
    expect(fast.trips.map((trip) => trip.id)).toEqual(ids);
    expect(fast.added.map((trip) => trip.id)).toEqual(ids);
    expect(fast.pickups.map((trip) => trip.id)).toEqual(ids);
    expect(fast.deliveries.map((trip) => trip.id)).toEqual(ids);
    expect(fast.trips.some((trip) => trip.id === first.id)).toBe(false);

    const newEvent = {
      ...events[0],
      cell: 23 * 48 + 40,
      path: [
        { x: 40, y: 24 },
        { x: 40, y: 23 },
      ],
    };
    const outstandingCells = new Set(outstanding.map((trip) => trip.cell));
    const appended = flowMotion(
      [...events.filter((event) => outstandingCells.has(event.cell)), newEvent],
      2,
      puzzle,
      { now, trips: fast.trips },
    );
    expect(appended.added).toHaveLength(1);
    expect(appended.added[0].cell).toBe(newEvent.cell);
    expect(new Set(appended.trips.map((trip) => trip.id)).size).toBe(
      appended.trips.length,
    );
    const lastDeparture = Math.max(...fast.trips.map((trip) => trip.depart));
    expect(appended.added[0].depart).toBe(
      Math.max(now + fast.launch, lastDeparture + fast.stagger),
    );
    fast.trips.forEach((trip, i) => expect(appended.trips[i]).toBe(trip));
  });
});

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
  it("gives every assigned cube its own ant without a fixed colony cap", () => {
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
    expect(peak).toBeGreaterThan(18);
    expect(new Set(time.trips.map((trip) => trip.worker)).size).toBe(100);
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
  it("sends all seven ants from a seven-cube box one by one before any returns", () => {
    const puzzle = { width: 24, height: 24, version: 4 as const };
    const events = Array.from({ length: 7 }, (_, x) => ({
      cell: 23 * 24 + x + 8,
      packet: 19,
      color: 4,
      slot: 0,
      path: [
        { x: x + 8, y: 24 },
        { x: x + 8, y: 23 },
      ],
    }));
    for (const speed of [1, 2] as const) {
      const plan = flowMotion(events, speed, puzzle, {
        slots: new Map([[19, 0]]),
      });
      expect(plan.added).toHaveLength(7);
      expect(new Set(plan.added.map((trip) => trip.worker)).size).toBe(7);
      expect(plan.added.map((trip) => trip.depart)).toEqual(
        events.map((_, index) => plan.launch + index * plan.stagger),
      );
      expect(Math.max(...plan.added.map((trip) => trip.depart))).toBeLessThan(
        Math.min(...plan.added.map((trip) => trip.deliveryAt)),
      );
    }
  });
  it.each([25, 40])(
    "dispatches the entire available quota of %i without cycling four workers",
    (count) => {
      const puzzle = { width: 36, height: 36, version: 4 as const };
      const events = Array.from({ length: count }, (_, i) => {
        const x = i < 36 ? i : 35,
          y = i < 36 ? 35 : i - 6;
        return {
          cell: y * 36 + x,
          packet: 6,
          color: 4,
          slot: 1,
          path: [
            { x: i < 36 ? x : 36, y: i < 36 ? 36 : y },
            { x, y },
          ],
        };
      });
      const plan = flowMotion(events, 1, puzzle, { slots: new Map([[6, 1]]) });
      expect(plan.trips).toHaveLength(count);
      expect(new Set(plan.trips.map((trip) => trip.worker)).size).toBe(count);
      expect(plan.trips.map((trip) => trip.depart)).toEqual(
        events.map((_, i) => plan.launch + i * plan.stagger),
      );
    },
  );
  it("dispatches only the ten assigned cubes and sends the remaining fifteen as soon as they become available", () => {
    const puzzle = { width: 36, height: 36, version: 4 as const };
    const events = Array.from({ length: 25 }, (_, x) => ({
      cell: 35 * 36 + x,
      packet: 9,
      color: 4,
      slot: 1,
      path: [
        { x, y: 36 },
        { x, y: 35 },
      ],
    }));
    const first = flowMotion(events.slice(0, 10), 1, puzzle);
    expect(first.trips).toHaveLength(10);
    const next = flowMotion(events.slice(10), 1, puzzle, {
      now: 1500,
      trips: first.trips,
    });
    expect(next.added).toHaveLength(15);
    expect(next.added[0].depart).toBe(1500 + next.launch);
    expect(new Set(next.trips.map((trip) => trip.worker)).size).toBe(25);
    first.trips.forEach((trip, i) => expect(next.trips[i]).toBe(trip));
  });
  it("paces each colour independently within the same launch batch and appends the same box without restarting it", () => {
    const puzzle = { width: 24, height: 24, version: 4 as const };
    const edgeEvent = (x: number, packet: number) => ({
      cell: 23 * 24 + x,
      packet,
      color: packet,
      slot: packet - 1,
      path: [
        { x, y: 24 },
        { x, y: 23 },
      ],
    });
    const first = flowMotion(
      [
        ...Array.from({ length: 7 }, (_, i) => edgeEvent(i, 1)),
        ...Array.from({ length: 7 }, (_, i) => edgeEvent(i + 7, 2)),
      ],
      1,
      puzzle,
    );
    expect(
      first.trips
        .filter((trip) => trip.packet === 1)
        .map((trip) => trip.depart),
    ).toEqual(
      first.trips
        .filter((trip) => trip.packet === 2)
        .map((trip) => trip.depart),
    );
    const next = flowMotion([edgeEvent(20, 1), edgeEvent(21, 3)], 1, puzzle, {
      now: 300,
      trips: first.trips,
    });
    expect(next.trips.slice(0, first.trips.length)).toEqual(first.trips);
    first.trips.forEach((trip, i) => expect(next.trips[i]).toBe(trip));
    expect(next.added[0].depart).toBe(
      first.trips.filter((trip) => trip.packet === 1).at(-1)!.depart +
        next.stagger,
    );
    expect(next.added[1].depart).toBe(300 + next.launch);
    expect(new Set(next.trips.map((trip) => trip.worker)).size).toBe(16);
  });
  it("starts new routes at the measured physical dock while preserving existing routes after a dock move", () => {
    const puzzle = { width: 24, height: 24, version: 4 as const };
    const origin = { x: 650, y: 240 };
    const event = {
      cell: 23 * 24 + 12,
      packet: 8,
      color: 4,
      slot: 2,
      path: [
        { x: 12, y: 24 },
        { x: 12, y: 23 },
      ],
    };
    const direct = flowAntRoute(puzzle, event, origin);
    expect(direct.outboundPoints[0]).toEqual(origin);
    const first = flowMotion([event], 1, puzzle, {
      origins: new Map([[8, origin]]),
    });
    const second = flowMotion(
      [
        {
          ...event,
          cell: event.cell + 1,
          path: [
            { x: 13, y: 24 },
            { x: 13, y: 23 },
          ],
        },
      ],
      1,
      puzzle,
      {
        now: 500,
        trips: first.trips,
        slots: new Map([[8, 4]]),
        origins: new Map([[8, { x: 660, y: 450 }]]),
      },
    );
    expect(first.trips[0].outboundPoints[0]).toEqual(origin);
    expect(second.trips[0]).toBe(first.trips[0]);
    expect(second.added[0].outboundPoints[0]).toEqual({ x: 660, y: 450 });
    expect(second.added[0].slot).toBe(4);
  });
  it("retargets only pending ants after their physical dock moves, keeping all absolute delivery times", () => {
    const puzzle = { width: 24, height: 24, version: 4 as const };
    const events = Array.from({ length: 7 }, (_, x) => ({
      cell: 23 * 24 + x,
      packet: 8,
      color: 4,
      slot: 1,
      path: [
        { x, y: 24 },
        { x, y: 23 },
      ],
    }));
    const oldOrigin = { x: 650, y: 200 },
      newOrigin = { x: 650, y: 400 };
    const first = flowMotion(events, 1, puzzle, {
      origins: new Map([[8, oldOrigin]]),
    });
    const now = 500;
    const next = flowMotion([], 1, puzzle, {
      now,
      trips: first.trips,
      slots: new Map([[8, 4]]),
      origins: new Map([[8, newOrigin]]),
    });
    expect(next.added).toHaveLength(0);
    first.trips.forEach((trip, i) => {
      const updated = next.trips[i];
      for (const key of [
        "id",
        "renderAt",
        "depart",
        "arrive",
        "at",
        "returnAt",
        "deliveryAt",
        "outbound",
        "carry",
      ] as const)
        expect(updated[key]).toBe(trip[key]);
      if (trip.depart > now) {
        expect(updated).not.toBe(trip);
        expect(updated.slot).toBe(4);
        expect(updated.outboundPoints[0]).toEqual(newOrigin);
      } else {
        expect(updated).toBe(trip);
        expect(updated.slot).toBe(1);
        expect(updated.outboundPoints[0]).toEqual(oldOrigin);
      }
    });
  });
  it("walks from side and upper docks around the picture instead of diagonally through occupied cubes", () => {
    const puzzle = { width: 24, height: 24, version: 4 as const };
    const g = flowGeometry(puzzle);
    const event = {
      cell: 0,
      packet: 8,
      color: 4,
      slot: 2,
      path: [
        { x: -1, y: 0 },
        { x: 0, y: 0 },
      ],
    };
    for (const origin of [
      { x: 650, y: 240 },
      { x: -80, y: 240 },
      { x: 270, y: -60 },
    ]) {
      const route = flowAntRoute(puzzle, event, origin);
      expect(route.outboundPoints[0]).toEqual(origin);
      for (const points of [route.outboundPoints, route.returnPoints]) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i];
          const samples = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
          for (let sample = 0; sample <= samples; sample++) {
            const x = a.x + ((b.x - a.x) * sample) / (samples || 1);
            const y = a.y + ((b.y - a.y) * sample) / (samples || 1);
            const column = Math.floor((x - g.startX) / g.step);
            const row = Math.floor((y - g.startY) / g.step);
            expect(
              column < 0 ||
                column >= puzzle.width ||
                row < 0 ||
                row >= puzzle.height,
            ).toBe(true);
          }
        }
      }
    }
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
  it("keeps a distinct ant for every cube in overlapping batches", () => {
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
    expect(peak).toBeGreaterThan(18);
    expect(new Set(appended.trips.map((trip) => trip.worker)).size).toBe(60);
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
      expect(plan.added.every((trip) => trip.slot === slot)).toBe(true);
      expect(plan.added.map((trip) => trip.depart)).toEqual(
        events.map((_, i) => now + plan.launch + i * plan.stagger),
      );
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
    expect(peak).toBe(40);
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

describe("dense colony picture routes", () => {
  it("reaches every corner and board edge with a pickup aligned to the target cell", () => {
    for (const [width, height] of [
      [24, 24],
      [30, 30],
      [36, 36],
      [24, 18],
      [30, 23],
      [36, 27],
    ]) {
      const puzzle = { width, height, version: 4 as const };
      const g = flowGeometry(puzzle);
      const cases = [
        { x: 0, y: 0, dx: -1, dy: 0 },
        { x: width - 1, y: 0, dx: 0, dy: -1 },
        { x: width - 1, y: height - 1, dx: 1, dy: 0 },
        { x: 0, y: height - 1, dx: 0, dy: 1 },
        { x: Math.floor(width / 2), y: 0, dx: 0, dy: -1 },
        { x: Math.floor(width / 2), y: height - 1, dx: 0, dy: 1 },
        { x: 0, y: Math.floor(height / 2), dx: -1, dy: 0 },
        { x: width - 1, y: Math.floor(height / 2), dx: 1, dy: 0 },
      ];
      for (const { x, y, dx, dy } of cases) {
        const route = flowAntRoute(puzzle, {
          cell: y * width + x,
          packet: 1,
          slot: 4,
          color: 7,
          path: [
            { x: x + dx, y: y + dy },
            { x, y },
          ],
        });
        const cube = { x: g.startX + x * g.step, y: g.startY + y * g.step };
        const center = { x: cube.x + g.size / 2, y: cube.y + g.size / 2 };
        const distance = Math.hypot(route.x - center.x, route.y - center.y);
        expect(distance).toBeLessThan(g.step);
        expect(distance).toBeGreaterThan(g.size / 2);
        if (dx) {
          expect(route.y).toBeCloseTo(center.y);
          expect(Math.sign(route.x - center.x)).toBe(dx);
        } else {
          expect(route.x).toBeCloseTo(center.x);
          expect(Math.sign(route.y - center.y)).toBe(dy);
        }
        expect(route.outboundPoints.at(-1)).toEqual({ x: route.x, y: route.y });
        expect(route.returnPoints[0]).toEqual({ x: route.x, y: route.y });
        expect(route.returnPoints.at(-1)).toEqual({ x: 270, y: g.homeY });
        for (const point of [...route.outboundPoints, ...route.returnPoints]) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(540);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(g.bottom + 132);
        }
        expect(route.outboundPath).not.toMatch(/NaN|Infinity/);
        expect(route.returnPath).not.toMatch(/NaN|Infinity/);
        expect(route.outboundLength).toBeGreaterThan(0);
        expect(route.returnLength).toBeGreaterThan(0);
      }
    }
  });

  it("walks through a native-resolution empty corridor and stops before its occupied target", () => {
    for (const width of [24, 30, 36]) {
      const puzzle = { width, height: width, version: 4 as const };
      const g = flowGeometry(puzzle),
        row = Math.floor(width / 2),
        targetX = 4;
      const path = Array.from({ length: targetX + 2 }, (_, i) => ({
        x: i - 1,
        y: row,
      }));
      const empty = new Set(path.slice(1, -1).map((p) => p.y * width + p.x));
      const route = flowAntRoute(puzzle, {
        cell: row * width + targetX,
        packet: 2,
        slot: 0,
        color: 1,
        path,
      });
      for (const points of [route.outboundPoints, route.returnPoints]) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i];
          const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
          for (let sample = 0; sample <= steps; sample++) {
            const x = a.x + ((b.x - a.x) * sample) / (steps || 1);
            const y = a.y + ((b.y - a.y) * sample) / (steps || 1);
            const column = Math.floor((x - g.startX) / g.step);
            const line = Math.floor((y - g.startY) / g.step);
            if (column >= 0 && column < width && line >= 0 && line < width)
              expect(empty.has(line * width + column)).toBe(true);
          }
        }
      }
      // Return workers retrace the same clear grid corridor.
      expect(route.returnPoints.slice(0, path.length)).toEqual(
        route.outboundPoints.slice(-path.length).reverse(),
      );
    }
  });
});
