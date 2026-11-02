import { describe, expect, it } from "vitest";
import {
  flowHeadingFrames,
  flowJourneyHeading,
  flowHomeHop,
  flowPathSamples,
  flowUnwrapAngle,
} from "../src/flowPaths";

describe("continuous ant facing and nest entry", () => {
  it("anticipates corners and limits angular speed instead of jumping to a tangent", () => {
    for (const speed of [1, 2] as const) {
      const duration = 1400 / speed,
        frames = flowHeadingFrames(
          "M0 0L80 0Q100 0 100 20L100 80",
          duration,
          speed,
        );
      for (let i = 1; i < frames.length; i++) {
        const delta = Math.abs(frames[i].angle - frames[i - 1].angle),
          dt = (frames[i].offset - frames[i - 1].offset) * duration;
        expect(delta).toBeLessThanOrEqual((720 * speed * dt) / 1000 + 0.0001);
      }
      expect(
        frames.some((frame) => frame.angle > 95 && frame.angle < 175),
      ).toBe(true);
    }
  });
  it("unwraps across north without spinning 360 degrees", () => {
    expect(flowUnwrapAngle(1, 359)).toBe(361);
    expect(flowUnwrapAngle(359, 1)).toBe(-1);
  });
  it("finishes its pickup turn at exactly the return journey heading", () => {
    const trip = {
      outboundPath: "M0 100L0 0",
      returnPath: "M0 0L0 100",
      outbound: 1000,
      carry: 1000,
      pickupPause: 320,
    };
    const frames = flowJourneyHeading(trip, 1);
    expect(frames.outbound.at(-1)!.angle).toBe(frames.inbound[0].angle);
    const turn = frames.outbound.filter((f) => f.offset >= 1000 / 1320);
    expect(turn.length).toBeGreaterThan(10);
    for (let i = 1; i < turn.length; i++)
      expect(Math.abs(turn[i].angle - turn[i - 1].angle)).toBeLessThan(15);
  });
  it("samples the actual rounded route with monotonic distance and correct endpoints", () => {
    const samples = flowPathSamples("M0 0 L80 0 Q100 0 100 20 L100 100");
    expect(samples[0]).toEqual({ x: 0, y: 0, distance: 0 });
    expect(samples.at(-1)).toMatchObject({ x: 100, y: 100 });
    expect(
      samples.every((p, i) => !i || p.distance >= samples[i - 1].distance),
    ).toBe(true);
    expect(samples.every((p) => Number.isFinite(p.distance))).toBe(true);
  });
  it("uses the same hop phase at 1x and 2x and keeps takeoff inside short return trips", () => {
    expect(flowHomeHop(4000, 1)).toBe(340);
    expect(flowHomeHop(2000, 2)).toBe(170);
    expect(flowHomeHop(600, 1)).toBeLessThan(600);
  });
});
