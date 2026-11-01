import type { FlowEvent, FlowPuzzle } from "./flow";

export const FLOW_WORLDS = [
  {
    id: "meadow",
    name: "Тёплая поляна",
    image: "/art/flow/meadow-v2.svg",
    ground: "#ffdaa7",
  },
  {
    id: "mushroom",
    name: "Тихий сад",
    image: "/art/flow/mushroom-v2.svg",
    ground: "#c3dfcf",
  },
  {
    id: "moonlight",
    name: "Сумерки",
    image: "/art/flow/moonlight-v2.svg",
    ground: "#c9c2e2",
  },
] as const;
export function flowWorld(kind: "level" | "daily", key: string | number) {
  const index =
    kind === "daily"
      ? [...String(key)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 3
      : Math.floor((Number(key) - 1) / 12);
  return FLOW_WORLDS[Math.max(0, Math.min(2, index || 0))];
}

type Point = { x: number; y: number };
/** Rounded orthogonal walks stay in the cleared column and below the picture. */
function roundPath(points: Point[], radius = 12) {
  let path = `M ${points[0].x} ${points[0].y}`,
    length = 0,
    last = points[0];
  const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1],
      ab = distance(a, b),
      bc = distance(b, c);
    const r = Math.min(radius, ab / 2, bc / 2);
    const before = {
      x: b.x + ((a.x - b.x) * r) / (ab || 1),
      y: b.y + ((a.y - b.y) * r) / (ab || 1),
    };
    const after = {
      x: b.x + ((c.x - b.x) * r) / (bc || 1),
      y: b.y + ((c.y - b.y) * r) / (bc || 1),
    };
    path += ` L ${before.x} ${before.y} Q ${b.x} ${b.y} ${after.x} ${after.y}`;
    length += distance(last, before);
    let q = before;
    for (let s = 1; s <= 8; s++) {
      const t = s / 8,
        u = 1 - t,
        p = {
          x: u * u * before.x + 2 * u * t * b.x + t * t * after.x,
          y: u * u * before.y + 2 * u * t * b.y + t * t * after.y,
        };
      length += distance(q, p);
      q = p;
    }
    last = after;
  }
  const end = points.at(-1)!;
  path += ` L ${end.x} ${end.y}`;
  length += distance(last, end);
  return { path, length };
}
export function flowAntRoute(
  puzzle: Pick<FlowPuzzle, "width" | "height">,
  event: FlowEvent,
) {
  const step = 24,
    startX = (540 - puzzle.width * step) / 2,
    bottom = 22 + puzzle.height * step;
  const x = startX + (event.cell % puzzle.width) * step + 11.5,
    y = 22 + Math.floor(event.cell / puzzle.width) * step + 22;
  const origin = { x: 84 + event.slot * 93, y: bottom + 126 },
    gateY = bottom + 29;
  const side = x < 270 ? startX - 24 : 540 - startX + 24;
  const outward = roundPath([
    origin,
    { x: side, y: bottom + 99 },
    { x: side, y: gateY },
    { x, y: gateY },
    { x, y },
  ]);
  const homeward = roundPath([
    { x, y },
    { x, y: gateY + 7 },
    { x: 270, y: gateY + 7 },
    { x: 270, y: bottom + 66 },
  ]);
  return {
    outboundPath: outward.path,
    returnPath: homeward.path,
    outboundLength: outward.length,
    returnLength: homeward.length,
    x,
    y,
  };
}

/** Actual walking, a pickup pause, then a slower loaded return. No teleports. */
export function flowMotion(
  events: FlowEvent[],
  speed: 1 | 2,
  puzzle: Pick<FlowPuzzle, "width" | "height">,
) {
  const launch = 220 / speed,
    pickupPause = 260 / speed,
    stagger = 110 / speed;
  let previousPickup = 0;
  const columns = new Map<number, { at: number; y: number }>();
  // A bounded stream of workers; every cube has a visible round trip.
  const workers = Array(18).fill(0) as number[];
  const trips = events.map((event, index) => {
    const route = flowAntRoute(puzzle, event),
      outbound = Math.max(1400, (route.outboundLength / 125) * 1000) / speed,
      carry = Math.max(1150, (route.returnLength / 110) * 1000) / speed;
    const worker = workers.indexOf(Math.min(...workers));
    let depart = Math.max(launch + index * stagger, workers[worker]);
    let arrive = depart + outbound;
    const prior = columns.get(event.cell % puzzle.width);
    const row = Math.floor(event.cell / puzzle.width);
    if (prior)
      arrive = Math.max(
        arrive,
        prior.at +
          (((Math.max(0, prior.y - row) * 24) / 125) * 1000) / speed +
          70 / speed,
      );
    arrive = Math.max(arrive, previousPickup + 85 / speed);
    depart = arrive - outbound;
    const at = arrive + pickupPause * 0.55,
      returnAt = arrive + pickupPause,
      deliveryAt = returnAt + carry;
    previousPickup = at;
    columns.set(event.cell % puzzle.width, { at, y: row });
    workers[worker] = deliveryAt + 80 / speed;
    return {
      ...event,
      ...route,
      depart,
      arrive,
      at,
      returnAt,
      outbound,
      carry,
      deliveryAt,
      pickupPause,
    };
  });
  return {
    launch,
    pickupPause,
    stagger,
    trips,
    pickups: trips,
    deliveries: trips.map((t) => ({ ...t, at: t.deliveryAt })),
    finish: trips.length
      ? Math.max(...trips.map((t) => t.deliveryAt)) + 240 / speed
      : 300 / speed,
  };
}
