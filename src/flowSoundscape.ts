import type { flowMotion } from "./flowPresentation";

export type FlowMotionCue = {
  kind: "step" | "carry" | "pickup" | "collect";
  at: number;
  color: number;
  variation: number;
  pan: number;
};

/** One soft walking layer represents the crowd; cube cues follow the actual trips. */
export function flowSoundscape(
  timing: ReturnType<typeof flowMotion>,
  speed: 1 | 2,
): FlowMotionCue[] {
  if (!timing.trips.length) return [];
  const cues: FlowMotionCue[] = [];
  const panAt = (x: number) => Math.max(-1, Math.min(1, (x - 270) / 270));
  timing.trips.forEach((trip, variation) => {
    cues.push(
      {
        kind: "pickup",
        at: trip.at,
        color: trip.color,
        variation,
        pan: panAt(trip.x),
      },
      {
        kind: "collect",
        at: trip.deliveryAt,
        color: trip.color,
        variation,
        pan: 0,
      },
    );
  });
  const first = Math.min(...timing.trips.map((trip) => trip.depart));
  const last = Math.max(...timing.trips.map((trip) => trip.deliveryAt));
  for (let beat = 0, at = first; at < last; beat++) {
    const moving = timing.trips.filter(
      (trip) =>
        (at >= trip.depart && at < trip.arrive) ||
        (at >= trip.returnAt && at < trip.deliveryAt),
    );
    if (moving.length) {
      const trip = moving[beat % moving.length];
      const loaded = at >= trip.returnAt;
      const progress = loaded
        ? (at - trip.returnAt) / trip.carry
        : (at - trip.depart) / trip.outbound;
      const start = loaded ? trip.x : 84 + trip.slot * 93;
      const end = loaded ? 270 : trip.x;
      cues.push({
        kind: loaded ? "carry" : "step",
        at,
        color: trip.color,
        variation: beat,
        pan: panAt(start + (end - start) * progress),
      });
    }
    // Small deterministic variations avoid a mechanical metronome.
    at += (150 + ((beat * 17) % 29) - 14) / speed;
  }
  return cues.sort((a, b) => a.at - b.at);
}
