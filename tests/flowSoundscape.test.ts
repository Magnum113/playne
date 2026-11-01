import { describe, expect, it } from "vitest";
import { initialFlow, launchFlow, makeFlowPuzzle } from "../src/flow";
import { flowMotion } from "../src/flowPresentation";
import { flowSoundscape } from "../src/flowSoundscape";

describe("Рой: walking and cube sound timeline", () => {
  const puzzle = makeFlowPuzzle("level", 1);
  const events = launchFlow(
    puzzle,
    initialFlow(puzzle),
    puzzle.solution[0],
  )!.events;

  it("places pickup and delivery at their visible moments and steps only while walking", () => {
    const motion = flowMotion(events, 1, puzzle);
    const cues = flowSoundscape(motion, 1);
    expect(
      cues.filter((cue) => cue.kind === "pickup").map((cue) => cue.at),
    ).toEqual(motion.trips.map((trip) => trip.at).sort((a, b) => a - b));
    expect(
      cues.filter((cue) => cue.kind === "collect").map((cue) => cue.at),
    ).toEqual(
      motion.trips.map((trip) => trip.deliveryAt).sort((a, b) => a - b),
    );
    const steps = cues.filter(
      (cue) => cue.kind === "step" || cue.kind === "carry",
    );
    expect(new Set(steps.map((cue) => cue.kind))).toEqual(
      new Set(["step", "carry"]),
    );
    for (const cue of steps) {
      expect(
        motion.trips.some(
          (trip) =>
            trip.color === cue.color &&
            (cue.kind === "step"
              ? cue.at >= trip.depart && cue.at < trip.arrive
              : cue.at >= trip.returnAt && cue.at < trip.deliveryAt),
        ),
      ).toBe(true);
    }
    expect(
      cues.every((cue) => Math.abs(cue.pan) <= 1 && cue.at < motion.finish),
    ).toBe(true);
  });

  it("scales cue times with 2× animation speed, leaving the sound identity intact", () => {
    const normal = flowSoundscape(flowMotion(events, 1, puzzle), 1);
    const fast = flowSoundscape(flowMotion(events, 2, puzzle), 2);
    expect(fast).toEqual(normal.map((cue) => ({ ...cue, at: cue.at / 2 })));
  });

  it("bounds crowd footsteps independently of worker count and stays silent for an empty wave", () => {
    const crowded = Array.from({ length: 100 }, (_, cell) => ({
      cell,
      packet: 1,
      color: 0,
      slot: 0,
    }));
    const motion = flowMotion(crowded, 1, puzzle);
    const steps = flowSoundscape(motion, 1).filter(
      (cue) => cue.kind === "step" || cue.kind === "carry",
    );
    for (let i = 1; i < steps.length; i++)
      expect(steps[i].at - steps[i - 1].at).toBeGreaterThanOrEqual(136 - 0.001);
    expect(steps.length).toBeLessThan(Math.ceil(motion.finish / 136));
    expect(flowSoundscape(flowMotion([], 1, puzzle), 1)).toEqual([]);
  });
});
