import { flowApproach, type FlowEvent, type FlowPuzzle } from "./flow";

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

export type FlowPoint = { x: number; y: number };
/** Small rounded corners remain inside the empty grid corridor. */
function roundPath(points: FlowPoint[], radius = 5) {
  let path = `M ${points[0].x} ${points[0].y}`,
    length = 0,
    last = points[0];
  const distance = (a: FlowPoint, b: FlowPoint) =>
    Math.hypot(b.x - a.x, b.y - a.y);
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
  let x = startX + (event.cell % puzzle.width) * step + 11.5,
    y = 22 + Math.floor(event.cell / puzzle.width) * step + 22;
  const origin = { x: 84 + event.slot * 93, y: bottom + 126 },
    gateY = bottom + 29;
  const side = x < 270 ? startX - 24 : 540 - startX + 24;
  let outwardPoints: FlowPoint[] = [
    origin,
    { x: side, y: bottom + 99 },
    { x: side, y: gateY },
    { x, y: gateY },
    { x, y },
  ];
  let homewardPoints: FlowPoint[] = [
    { x, y },
    { x, y: gateY + 7 },
    { x: 270, y: gateY + 7 },
    { x: 270, y: bottom + 66 },
  ];
  if (event.path?.length && event.path.length > 1) {
    const corridor = event.path.map((point) => ({
      x: startX + point.x * step + 11.5,
      y: 22 + point.y * step + 11.5,
    }));
    const target = corridor.at(-1)!,
      neighbor = corridor.at(-2)!;
    const distance =
      Math.hypot(neighbor.x - target.x, neighbor.y - target.y) || step;
    // Wait on the clear side of the block instead of walking through its centre.
    const pickup = {
      x: target.x + ((neighbor.x - target.x) / distance) * 15,
      y: target.y + ((neighbor.y - target.y) / distance) * 15,
    };
    corridor[corridor.length - 1] = pickup;
    const entry = corridor[0],
      gridEntry = event.path[0];
    const routeSide =
      gridEntry.x < 0 || (gridEntry.y < 0 && entry.x < 270)
        ? startX - 12.5
        : startX + puzzle.width * step + 11.5;
    const approach =
      gridEntry.y >= puzzle.height
        ? [origin, { x: origin.x, y: gateY }, { x: entry.x, y: gateY }]
        : [
            origin,
            { x: routeSide, y: bottom + 99 },
            { x: routeSide, y: entry.y },
          ];
    outwardPoints = [...approach, ...corridor];
    const escape = [...corridor].reverse();
    homewardPoints =
      gridEntry.y >= puzzle.height
        ? [
            ...escape,
            { x: entry.x, y: gateY + 7 },
            { x: 270, y: gateY + 7 },
            { x: 270, y: bottom + 66 },
          ]
        : [
            ...escape,
            { x: routeSide, y: entry.y },
            { x: routeSide, y: gateY + 7 },
            { x: 270, y: gateY + 7 },
            { x: 270, y: bottom + 66 },
          ];
    x = pickup.x;
    y = pickup.y;
  }
  const compact = (points: FlowPoint[]) =>
    points.filter(
      (point, i) =>
        i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y,
    );
  outwardPoints = compact(outwardPoints);
  homewardPoints = compact(homewardPoints);
  const outward = roundPath(outwardPoints),
    homeward = roundPath(homewardPoints);
  return {
    outboundPath: outward.path,
    returnPath: homeward.path,
    outboundLength: outward.length,
    returnLength: homeward.length,
    x,
    y,
    outboundPoints: outwardPoints,
    returnPoints: homewardPoints,
  };
}

export type FlowTrip = FlowEvent &
  ReturnType<typeof flowAntRoute> & {
    id: string;
    worker: number;
    renderAt: number;
    depart: number;
    arrive: number;
    at: number;
    returnAt: number;
    outbound: number;
    carry: number;
    deliveryAt: number;
    pickupPause: number;
  };
export type FlowMotionContext = {
  now?: number;
  trips?: readonly FlowTrip[];
  slots?: ReadonlyMap<number, number>;
  slotCount?: number;
  cells?: readonly number[];
  epoch?: string | number;
};
export type FlowMotion = {
  launch: number;
  pickupPause: number;
  stagger: number;
  trips: FlowTrip[];
  added: FlowTrip[];
  pickups: FlowTrip[];
  deliveries: FlowTrip[];
  finish: number;
};

/** Append work on an absolute session clock; existing workers never restart. */
export function flowMotion(
  events: FlowEvent[],
  speed: 1 | 2,
  puzzle: Pick<FlowPuzzle, "width" | "height">,
  context: FlowMotionContext = {},
): FlowMotion {
  const launch = 220 / speed,
    pickupPause = 260 / speed,
    stagger = 110 / speed,
    now = context.now ?? 0,
    slotCount = Math.max(1, Math.min(18, Math.trunc(context.slotCount ?? 5)));
  let previousPickup = 0;
  const columns = new Map<number, { at: number; y: number }>();
  const trips = [...(context.trips ?? [])],
    added: FlowTrip[] = [];
  const picked = new Map(trips.map((trip) => [trip.cell, trip.at]));
  type Interval = { start: number; end: number };
  const workers: Interval[][] = Array.from({ length: 18 }, () => []);
  for (const trip of trips) {
    workers[trip.worker].push({
      start: trip.depart,
      end: trip.deliveryAt + 80 / speed,
    });
    if (!trip.path) {
      const column = trip.cell % puzzle.width;
      const prior = columns.get(column);
      if (!prior || prior.at < trip.at)
        columns.set(column, {
          at: trip.at,
          y: Math.floor(trip.cell / puzzle.width),
        });
    }
  }
  for (const intervals of workers) intervals.sort((a, b) => a.start - b.start);
  const earliest = (intervals: Interval[], start: number, duration: number) => {
    let candidate = start;
    for (const interval of intervals) {
      if (candidate + duration <= interval.start) return candidate;
      if (candidate < interval.end) candidate = interval.end;
    }
    return candidate;
  };
  events.forEach((original, index) => {
    if (picked.has(original.cell)) return;
    const event = {
      ...original,
      slot: context.slots?.get(original.packet) ?? original.slot,
      path:
        original.path && context.cells
          ? (flowApproach(puzzle, context.cells, original.cell) ??
            original.path)
          : original.path,
    };
    const route = flowAntRoute(puzzle, event),
      outbound = Math.max(1400, (route.outboundLength / 125) * 1000) / speed,
      carry = Math.max(1150, (route.returnLength / 110) * 1000) / speed;
    let earliestDepart = now + launch + index * stagger;
    // A logically cleared cube can still be waiting for its visible pickup.
    // Do not send a new worker through that square until it is really clear.
    if (event.path)
      for (const point of event.path.slice(0, -1)) {
        if (
          point.x < 0 ||
          point.x >= puzzle.width ||
          point.y < 0 ||
          point.y >= puzzle.height
        )
          continue;
        const dependency = picked.get(point.y * puzzle.width + point.x);
        if (dependency !== undefined)
          earliestDepart = Math.max(earliestDepart, dependency + 35 / speed);
      }
    const prior = columns.get(event.cell % puzzle.width);
    const row = Math.floor(event.cell / puzzle.width);
    if (prior && !event.path)
      earliestDepart = Math.max(
        earliestDepart,
        prior.at +
          (((Math.max(0, prior.y - row) * 24) / 125) * 1000) / speed +
          70 / speed -
          outbound,
      );
    earliestDepart = Math.max(
      earliestDepart,
      previousPickup + 85 / speed - outbound,
    );
    const duration = outbound + pickupPause + carry + 80 / speed;
    // A busy box cannot reserve the whole colony before another colour is opened.
    // Physical docks own small independent worker pools while keeping 18 in total.
    const poolSlot = ((event.slot % slotCount) + slotCount) % slotCount;
    const starts = workers.map((intervals, worker) =>
      context.slots && worker % slotCount !== poolSlot
        ? Infinity
        : earliest(intervals, earliestDepart, duration),
    );
    const worker = starts.indexOf(Math.min(...starts));
    const depart = starts[worker],
      arrive = depart + outbound;
    const at = arrive + pickupPause * 0.55,
      returnAt = arrive + pickupPause,
      deliveryAt = returnAt + carry;
    previousPickup = at;
    columns.set(event.cell % puzzle.width, { at, y: row });
    picked.set(event.cell, at);
    workers[worker].push({ start: depart, end: deliveryAt + 80 / speed });
    workers[worker].sort((a, b) => a.start - b.start);
    const trip: FlowTrip = {
      ...event,
      ...route,
      id: `${context.epoch ?? "flow"}:${event.packet}:${event.cell}`,
      worker,
      renderAt: now,
      depart,
      arrive,
      at,
      returnAt,
      outbound,
      carry,
      deliveryAt,
      pickupPause,
    };
    trips.push(trip);
    added.push(trip);
  });
  return {
    launch,
    pickupPause,
    stagger,
    trips,
    added,
    pickups: trips,
    deliveries: trips.map((t) => ({ ...t, at: t.deliveryAt })),
    finish: Math.max(
      now + (added.length ? 0 : 300 / speed),
      trips.length
        ? Math.max(...trips.map((t) => t.deliveryAt)) + 240 / speed
        : 0,
    ),
  };
}
