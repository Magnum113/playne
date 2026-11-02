import { describe, it, expect } from "vitest";
import { flowAntPose, flowPrepareJourney } from "../src/flowAntPose";
import { flowMotion, flowRetimeMotion } from "../src/flowPresentation";
const puzzle = {
  version: 4 as const,
  id: "last-three:v4",
  width: 24,
  height: 24,
  cells: Array.from({ length: 576 }, (_, i) =>
    [278, 279, 280].includes(i) ? 7 : -1,
  ),
};
const plan = () =>
  flowMotion(
    [278, 279, 280].map((cell) => ({ cell, packet: 0, color: 7, slot: 0 })),
    1,
    puzzle,
    { cells: puzzle.cells },
  );
describe("canvas colony preserves the shared animation clock", () => {
  it("shows every departed worker, including all three final adjacent cubes before pickup", () => {
    const motion = plan(),
      now = motion.trips[2].depart + 1;
    expect(now).toBeLessThan(motion.trips[0].at);
    expect(
      motion.trips.filter((t) =>
        flowAntPose(t, flowPrepareJourney(t, 1), now, 1),
      ),
    ).toHaveLength(3);
    for (const t of motion.trips) {
      expect(
        flowAntPose(t, flowPrepareJourney(t, 1), t.depart - 1, 1),
      ).toBeNull();
      expect(
        flowAntPose(t, flowPrepareJourney(t, 1), t.deliveryAt, 1),
      ).toBeNull();
    }
  });
  it("retains position and facing when x2 is enabled mid-walk or on the way home", () => {
    for (const returning of [false, true]) {
      const motion = plan(),
        t = motion.trips[0],
        now = returning
          ? t.returnAt + t.carry * 0.4
          : t.depart + t.outbound * 0.4;
      const before = flowAntPose(t, flowPrepareJourney(t, 1), now, 1)!;
      const changed = flowRetimeMotion(motion, now, 1, 2).trips[0],
        after = flowAntPose(changed, flowPrepareJourney(changed, 2), now, 2)!;
      expect(after.x).toBeCloseTo(before.x, 5);
      expect(after.y).toBeCloseTo(before.y, 5);
      expect(after.angle).toBeCloseTo(before.angle, 0);
      expect(after.loaded).toBe(returning);
    }
  });
  it("keeps the pickup turn continuous and hops up before shrinking into the nest", () => {
    const t = plan().trips[0],
      shape = flowPrepareJourney(t, 1);
    const a = flowAntPose(t, shape, t.returnAt - 0.01, 1)!,
      b = flowAntPose(t, shape, t.returnAt, 1)!;
    expect(a.angle).toBeCloseTo(b.angle, 2);
    expect(a.x).toBeCloseTo(b.x, 2);
    expect(a.y).toBeCloseTo(b.y, 2);
    const top = flowAntPose(t, shape, t.deliveryAt - 340 + 340 * 0.43, 1)!;
    expect(top.hopY).toBeCloseTo(-22);
    expect(top.alpha).toBe(1);
    const sink = flowAntPose(t, shape, t.deliveryAt - 1, 1)!;
    expect(sink.hopY).toBeGreaterThan(10);
    expect(sink.scaleX).toBeLessThan(0.2);
    expect(sink.alpha).toBeLessThan(0.05);
  });
});
