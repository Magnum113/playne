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
});
