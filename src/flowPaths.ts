import type { FlowPoint } from "./flowPresentation";

export type FlowPathSample = FlowPoint & { distance: number };

/** Sample the small M/L/Q vocabulary emitted by the colony router, without DOM APIs. */
export function flowPathSamples(path: string): FlowPathSample[] {
  const tokens = path.match(/[MLQ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const points: FlowPathSample[] = [];
  let cursor = 0,
    current = { x: 0, y: 0 },
    distance = 0;
  const append = (point: FlowPoint) => {
    const previous = points.at(-1);
    if (previous)
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    points.push({ ...point, distance });
    current = point;
  };
  while (cursor < tokens.length) {
    const command = tokens[cursor++].toUpperCase();
    if (command === "M")
      append({ x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) });
    else if (command === "L") {
      const start = current,
        end = { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) };
      const count = Math.max(
        1,
        Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 2),
      );
      for (let i = 1; i <= count; i++)
        append({
          x: start.x + ((end.x - start.x) * i) / count,
          y: start.y + ((end.y - start.y) * i) / count,
        });
    } else if (command === "Q") {
      const start = current,
        control = { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) },
        end = { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) };
      const count = Math.max(
        12,
        Math.ceil(
          (Math.hypot(control.x - start.x, control.y - start.y) +
            Math.hypot(end.x - control.x, end.y - control.y)) /
            2,
        ),
      );
      for (let i = 1; i <= count; i++) {
        const t = i / count,
          u = 1 - t;
        append({
          x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
          y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
        });
      }
    } else throw new Error(`Unsupported colony path command: ${command}`);
  }
  return points;
}
function pointAt(samples: FlowPathSample[], distance: number): FlowPoint {
  let low = 0,
    high = samples.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].distance < distance) low = mid + 1;
    else high = mid;
  }
  const b = samples[low],
    a = samples[Math.max(0, low - 1)];
  const t = Math.max(
    0,
    Math.min(1, (distance - a.distance) / (b.distance - a.distance || 1)),
  );
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export const flowUnwrapAngle = (angle: number, previous: number) =>
  previous + ((((angle - previous + 540) % 360) + 360) % 360) - 180;
function headingAt(samples: FlowPathSample[], fraction: number) {
  const length = samples.at(-1)!.distance,
    at = length * fraction;
  const a = pointAt(samples, Math.max(0, at - 12)),
    b = pointAt(samples, Math.min(length, at + 18));
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
}
export type FlowHeadingFrame = {
  offset: number;
  transform: string;
  angle: number;
};
/** Anticipate a bend and cap yaw speed rather than snapping to the path tangent. */
export function flowHeadingFrames(
  path: string,
  duration: number,
  speed: 1 | 2,
  initialAngle?: number,
): FlowHeadingFrame[] {
  const samples = flowPathSamples(path),
    count = Math.max(2, Math.ceil(duration / 16));
  let angle = initialAngle ?? headingAt(samples, 0);
  const maxStep = (720 * speed * duration) / count / 1000;
  return Array.from({ length: count + 1 }, (_, i) => {
    if (i) {
      const desired = flowUnwrapAngle(headingAt(samples, i / count), angle);
      angle += Math.max(-maxStep, Math.min(maxStep, desired - angle));
    }
    return { offset: i / count, transform: `rotate(${angle}deg)`, angle };
  });
}
export function flowJourneyHeading(
  trip: {
    outboundPath: string;
    returnPath: string;
    outbound: number;
    carry: number;
    pickupPause: number;
  },
  speed: 1 | 2,
) {
  const walking = flowHeadingFrames(trip.outboundPath, trip.outbound, speed);
  const returning = flowHeadingFrames(trip.returnPath, trip.carry, speed);
  const before = walking.at(-1)!.angle,
    after = flowUnwrapAngle(returning[0].angle, before);
  const duration = trip.outbound + trip.pickupPause,
    walkEnd = trip.outbound / duration;
  const outbound = walking.map((frame) => ({
    ...frame,
    offset: frame.offset * walkEnd,
  }));
  const turns = Math.max(4, Math.ceil(trip.pickupPause / 16));
  for (let i = 1; i <= turns; i++) {
    const t = i / turns,
      smooth = t * t * (3 - 2 * t),
      angle = before + (after - before) * smooth;
    outbound.push({
      offset: walkEnd + (1 - walkEnd) * t,
      transform: `rotate(${angle}deg)`,
      angle,
    });
  }
  const inbound = flowHeadingFrames(trip.returnPath, trip.carry, speed, after);
  return { outbound, inbound };
}

/** Shared with rendering/tests so the takeoff and delivery use one clock. */
export function flowHomeHop(carry: number, speed: 1 | 2) {
  return Math.min(340 / speed, carry * 0.45);
}
