import type { FlowTrip } from "./flowPresentation";
import {
  flowHomeHop,
  flowJourneyHeading,
  flowCachedPathSamples,
  type FlowPathSample,
  type FlowHeadingFrame,
} from "./flowPaths";

export type FlowJourneyShape = {
  outbound: FlowPathSample[];
  inbound: FlowPathSample[];
  heading: ReturnType<typeof flowJourneyHeading>;
};
const journeyShapes = new Map<string, FlowJourneyShape>();
export function flowPrepareJourney(
  trip: FlowTrip,
  speed: 1 | 2,
): FlowJourneyShape {
  // Retiming changes milliseconds, not the route or normalized turn. Reuse the
  // same steering table through x2 so a crowded speed switch cannot freeze.
  const outbound = trip.outbound * speed,
    carry = trip.carry * speed,
    pickupPause = trip.pickupPause * speed;
  const key = `${trip.outboundPath}|${trip.returnPath}|${outbound.toFixed(4)}:${carry.toFixed(4)}:${pickupPause.toFixed(4)}`;
  let shape = journeyShapes.get(key);
  if (!shape) {
    shape = {
      outbound: flowCachedPathSamples(trip.outboundPath),
      inbound: flowCachedPathSamples(trip.returnPath),
      heading: flowJourneyHeading({ ...trip, outbound, carry, pickupPause }, 1),
    };
    journeyShapes.set(key, shape);
    if (journeyShapes.size > 256)
      journeyShapes.delete(journeyShapes.keys().next().value!);
  }
  return shape;
}
function bounds<T>(items: T[], at: number, value: (item: T) => number) {
  let low = 0,
    high = items.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (value(items[mid]) < at) low = mid + 1;
    else high = mid;
  }
  const b = items[low],
    a = items[Math.max(0, low - 1)];
  return {
    a,
    b,
    t: Math.max(0, Math.min(1, (at - value(a)) / (value(b) - value(a) || 1))),
  };
}
function position(samples: FlowPathSample[], fraction: number) {
  const { a, b, t } = bounds(
    samples,
    Math.max(0, Math.min(1, fraction)) * samples.at(-1)!.distance,
    (p) => p.distance,
  );
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function heading(frames: FlowHeadingFrame[], fraction: number) {
  const { a, b, t } = bounds(frames, fraction, (f) => f.offset);
  return a.angle + (b.angle - a.angle) * t;
}
export function flowAntPose(
  trip: FlowTrip,
  shape: FlowJourneyShape,
  now: number,
  speed: 1 | 2,
) {
  if (now < trip.depart || now >= trip.deliveryAt) return null;
  const loaded = now >= trip.returnAt;
  const start = loaded ? trip.returnAt : trip.depart,
    duration = loaded ? trip.carry : trip.outbound;
  const point = position(
    loaded ? shape.inbound : shape.outbound,
    (now - start) / duration,
  );
  const angle = heading(
    loaded ? shape.heading.inbound : shape.heading.outbound,
    Math.min(
      1,
      (now - start) / (loaded ? trip.carry : trip.outbound + trip.pickupPause),
    ),
  );
  const hop = flowHomeHop(trip.carry, speed),
    jump = loaded ? Math.max(0, (now - (trip.deliveryAt - hop)) / hop) : 0;
  const stops = [
    [0, 0, 1, 1, 1, 0.18, 1],
    [0.12, 2, 1.06, 0.83, 1, 0.18, 1],
    [0.43, -22, 1.04, 1.04, 1, 0.07, 0.6],
    [0.65, -16, 0.98, 0.98, 1, 0.1, 0.75],
    [0.84, 3, 0.65, 0.8, 0.95, 0.04, 0.4],
    [1, 13, 0.12, 0.18, 0, 0, 0.1],
  ];
  const { a, b, t } = bounds(stops, jump, (s) => s[0]);
  const tween = (i: number) => a[i] + (b[i] - a[i]) * t;
  return {
    ...point,
    angle,
    loaded,
    cargo: loaded
      ? 1
      : Math.max(0, Math.min(1, (now - trip.at) / (trip.pickupPause * 0.35))),
    stride: (now - start) / (260 / speed),
    hopY: tween(1),
    scaleX: tween(2),
    scaleY: tween(3),
    alpha: tween(4),
    shadowAlpha: tween(5),
    shadowScale: tween(6),
  };
}
