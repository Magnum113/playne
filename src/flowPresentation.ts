import {
  flowApproach,
  flowApproaches,
  flowOpenCells,
  type FlowEvent,
  type FlowPuzzle,
} from "./flow";
import { flowGeometry } from "./flowGeometry";
import { flowSegmentClear } from "./flowRouteGrid";
import { flowCachedPathSamples as flowPathSamples } from "./flowPaths";

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
function roundPath(
  points: FlowPoint[],
  radius: number | ((point: FlowPoint) => number) = 5,
) {
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
    const r = Math.min(
      typeof radius === "number" ? radius : radius(b),
      ab / 2,
      bc / 2,
    );
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
  puzzle: Pick<FlowPuzzle, "width" | "height"> &
    Partial<Pick<FlowPuzzle, "version" | "id">>,
  event: FlowEvent,
  originOverride?: FlowPoint,
  navigationCells?: readonly number[],
  deferClearance = false,
) {
  const { step, size, startX, startY, bottom, homeY } = flowGeometry(puzzle);
  let x = startX + (event.cell % puzzle.width) * step + size / 2,
    y =
      startY + Math.floor(event.cell / puzzle.width) * step + step * (22 / 24);
  const origin = originOverride ?? { x: 84 + event.slot * 93, y: bottom + 126 },
    gateY = bottom + 29;
  const side = x < 270 ? startX - 24 : 540 - startX + 24;
  // Side docks must first go around the picture, even when their target is on
  // the opposite edge. A diagonal from the dock to that edge crosses the cubes.
  const boardRight = startX + puzzle.width * step;
  const abovePicture =
    origin.y < startY && origin.x >= startX && origin.x <= boardRight;
  const hubX = abovePicture
    ? origin.x < 270
      ? startX - step
      : boardRight + step
    : origin.x;
  const originApproach: FlowPoint[] = originOverride
    ? [
        origin,
        ...(abovePicture ? [{ x: hubX, y: origin.y }] : []),
        { x: hubX, y: bottom + 99 },
      ]
    : [origin];
  let outwardPoints: FlowPoint[] = [
    ...originApproach,
    { x: side, y: bottom + 99 },
    { x: side, y: gateY },
    { x, y: gateY },
    { x, y },
  ];
  let homewardPoints: FlowPoint[] = [
    { x, y },
    { x, y: gateY + 7 },
    { x: 270, y: gateY + 7 },
    { x: 270, y: homeY },
  ];
  if (event.path?.length && event.path.length > 1) {
    const corridor = event.path.map((point) => ({
      x: startX + point.x * step + size / 2,
      y: startY + point.y * step + size / 2,
    }));
    const target = corridor.at(-1)!,
      neighbor = corridor.at(-2)!;
    const distance =
      Math.hypot(neighbor.x - target.x, neighbor.y - target.y) || step;
    // Wait on the clear side of the block instead of walking through its centre.
    const pickup = {
      x: target.x + ((neighbor.x - target.x) / distance) * step * 0.625,
      y: target.y + ((neighbor.y - target.y) / distance) * step * 0.625,
    };
    corridor[corridor.length - 1] = pickup;
    const entry = corridor[0],
      gridEntry = event.path[0];
    const routeSide =
      gridEntry.x < 0 || (gridEntry.y < 0 && entry.x < 270)
        ? startX - step / 2 - 0.5
        : startX + puzzle.width * step + size / 2;
    const approach =
      gridEntry.y >= puzzle.height
        ? [
            ...originApproach,
            { x: originApproach.at(-1)!.x, y: gateY },
            { x: entry.x, y: gateY },
          ]
        : [
            ...originApproach,
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
            { x: 270, y: homeY },
          ]
        : [
            ...escape,
            { x: routeSide, y: entry.y },
            { x: routeSide, y: gateY + 7 },
            { x: 270, y: gateY + 7 },
            { x: 270, y: homeY },
          ];
    x = pickup.x;
    y = pickup.y;
  }
  if (puzzle.version === 4 && event.path?.length && origin.y >= bottom) {
    const corridor = event.path.map((point) => ({
      x: startX + point.x * step + size / 2,
      y: startY + point.y * step + size / 2,
    }));
    corridor[corridor.length - 1] = { x, y };
    const entry = corridor[0],
      gridEntry = event.path[0];
    const spread = (((event.cell * 7 + event.packet * 3) % 5) - 2) * 1.2;
    const left = startX - 20 + spread,
      right = startX + puzzle.width * step + 20 + spread;
    const routeSide =
      gridEntry.x < 0 || (gridEntry.y < 0 && entry.x < 270) ? left : right;
    const lower = bottom + 18 + Math.abs(spread);
    const approach =
      gridEntry.y >= puzzle.height
        ? [origin, entry]
        : [
            origin,
            { x: routeSide, y: lower },
            { x: routeSide, y: entry.y },
            entry,
          ];
    const escape = [...corridor].reverse();
    outwardPoints = [...approach, ...corridor.slice(1)];
    homewardPoints =
      gridEntry.y >= puzzle.height
        ? [...escape, { x: 270, y: homeY }]
        : [
            ...escape,
            { x: routeSide, y: entry.y },
            { x: routeSide, y: lower },
            { x: 270, y: homeY },
          ];
  }
  const compact = (points: FlowPoint[]) =>
    points.filter(
      (point, i) =>
        i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y,
    );
  outwardPoints = compact(outwardPoints);
  homewardPoints = compact(homewardPoints);
  const clearAt = (point: FlowPoint, cells: readonly number[]) => {
    const column = Math.floor((point.x - startX) / step),
      row = Math.floor((point.y - startY) / step);
    return (
      column < 0 ||
      column >= puzzle.width ||
      row < 0 ||
      row >= puzzle.height ||
      cells[row * puzzle.width + column] < 0
    );
  };
  const clearLine = (a: FlowPoint, b: FlowPoint, cells: readonly number[]) =>
    flowSegmentClear(a, b, cells, {
      width: puzzle.width,
      height: puzzle.height,
      startX,
      startY,
      step,
    });
  const shortcut = (points: FlowPoint[], cells: readonly number[]) => {
    const result = [points[0]];
    for (let at = 0; at < points.length - 1; ) {
      let next = points.length - 1;
      while (next > at + 1 && !clearLine(points[at], points[next], cells))
        next--;
      result.push(points[next]);
      at = next;
    }
    return result;
  };
  const returnCells = navigationCells ? [...navigationCells] : undefined;
  if (returnCells) returnCells[event.cell] = -1;
  if (puzzle.version === 4 && navigationCells) {
    outwardPoints = shortcut(outwardPoints, navigationCells);
    homewardPoints = shortcut(homewardPoints, returnCells!);
  }
  const radius =
    puzzle.version === 4
      ? (point: FlowPoint) =>
          point.x < startX - step / 2 ||
          point.x > boardRight + step / 2 ||
          point.y > bottom + 8 ||
          point.y < startY - 8
            ? 20
            : Math.min(5, step * 0.35)
      : 5;
  const safeRound = (points: FlowPoint[], cells?: readonly number[]) => {
    const rounded = roundPath(points, radius);
    if (!cells || deferClearance) return rounded;
    const samples = flowPathSamples(rounded.path);
    return samples.some(
      (point, index) =>
        !clearAt(point, cells) ||
        (index > 0 && !clearLine(samples[index - 1], point, cells)),
    )
      ? roundPath(points, 0)
      : rounded;
  };
  const outward = safeRound(outwardPoints, navigationCells),
    homeward = safeRound(homewardPoints, returnCells);
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
    /** Fixed CSS assignment clock; keep it unchanged when retiming a journey. */
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
  /** Packet origins measured from their current physical dock in SVG coordinates. */
  origins?: ReadonlyMap<number, FlowPoint>;
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

/** Change the remaining clock rate without restarting an ant's current phase. */
export function flowRetimeMotion(
  motion: FlowMotion,
  now: number,
  fromSpeed: 1 | 2,
  toSpeed: 1 | 2,
): FlowMotion {
  if (fromSpeed === toSpeed) return motion;
  const ratio = fromSpeed / toSpeed;
  const time = (at: number) => now + (at - now) * ratio;
  const trips = motion.trips.map((trip) => ({
    ...trip,
    // Cube pickup delays are measured from their original CSS assignment time.
    // Only phase boundaries move; shifting renderAt would remove cubes early.
    depart: time(trip.depart),
    arrive: time(trip.arrive),
    at: time(trip.at),
    returnAt: time(trip.returnAt),
    deliveryAt: time(trip.deliveryAt),
    outbound: trip.outbound * ratio,
    carry: trip.carry * ratio,
    pickupPause: trip.pickupPause * ratio,
  }));
  const current = new Map(trips.map((trip) => [trip.id, trip]));
  return {
    launch: motion.launch * ratio,
    pickupPause: motion.pickupPause * ratio,
    stagger: motion.stagger * ratio,
    trips,
    // Delivery removes a trip from the active timeline before the next launch.
    // Old batch arrays must never resurrect it when the clock rate changes.
    added: motion.added.flatMap((trip) => {
      const updated = current.get(trip.id);
      return updated ? [updated] : [];
    }),
    pickups: trips,
    deliveries: trips.map((trip) => ({ ...trip, at: trip.deliveryAt })),
    finish: time(motion.finish),
  };
}

/** Append work on an absolute session clock; existing workers never restart. */
export function flowMotion(
  events: FlowEvent[],
  speed: 1 | 2,
  puzzle: Pick<FlowPuzzle, "width" | "height"> &
    Partial<Pick<FlowPuzzle, "version" | "id">>,
  context: FlowMotionContext = {},
): FlowMotion {
  if (puzzle.version === 4 && context.cells)
    return referenceMotion(events, speed, puzzle, context);
  const launch = 220 / speed,
    pickupPause = 260 / speed,
    stagger = (puzzle.version === 4 ? 300 : 110) / speed,
    now = context.now ?? 0;
  const columns = new Map<number, { at: number; y: number }>();
  const trips = (context.trips ?? []).map((trip) => {
      const slot = context.slots?.get(trip.packet);
      if (slot === undefined || slot === trip.slot || trip.depart <= now)
        return trip;
      // Repacking docks only moves ants that have not left yet. Their queued
      // pickup/delivery timers and keys stay on the same absolute session clock.
      return {
        ...trip,
        ...flowAntRoute(
          puzzle,
          { ...trip, slot },
          context.origins?.get(trip.packet),
        ),
        slot,
      };
    }),
    added: FlowTrip[] = [];
  const picked = new Map(trips.map((trip) => [trip.cell, trip.at]));
  // The number on a box is its colony size: every assigned cube gets an ant.
  // Keep each box's departures paced without making another colour wait for it.
  const lastDeparture = new Map<number, number>();
  for (const trip of trips) {
    lastDeparture.set(
      trip.packet,
      Math.max(lastDeparture.get(trip.packet) ?? -Infinity, trip.depart),
    );
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
  events.forEach((original) => {
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
    const route = flowAntRoute(
        puzzle,
        event,
        context.origins?.get(event.packet),
      ),
      outbound = Math.max(1400, (route.outboundLength / 125) * 1000) / speed,
      carry = Math.max(1150, (route.returnLength / 110) * 1000) / speed;
    let earliestDepart = Math.max(
      now + launch,
      (lastDeparture.get(event.packet) ?? -Infinity) + stagger,
    );
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
          earliestDepart = Math.max(earliestDepart, dependency + 120 / speed);
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
    const depart = earliestDepart,
      arrive = depart + outbound;
    const at = arrive + pickupPause * 0.55,
      returnAt = arrive + pickupPause,
      deliveryAt = returnAt + carry;
    lastDeparture.set(event.packet, depart);
    columns.set(event.cell % puzzle.width, { at, y: row });
    picked.set(event.cell, at);
    const trip: FlowTrip = {
      ...event,
      ...route,
      id: `${context.epoch ?? "flow"}:${event.packet}:${event.cell}`,
      worker: event.cell,
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

/** Schedule only physically exposed, unreserved targets on a shared colony clock.
 * Future openings wake every waiting packet; walking ants outlive their boxes.
 * The deterministic move journal and packet quotas remain owned by flow.ts.
 */
function referenceMotion(
  events: FlowEvent[],
  speed: 1 | 2,
  puzzle: Pick<FlowPuzzle, "width" | "height"> &
    Partial<Pick<FlowPuzzle, "version" | "id">>,
  context: FlowMotionContext,
): FlowMotion {
  const now = context.now ?? 0,
    launch = 220 / speed,
    stagger = 300 / speed,
    pickupPause = 320 / speed;
  const geometry = flowGeometry(puzzle);
  const trips = (context.trips ?? []).map((trip) => {
    const slot = context.slots?.get(trip.packet);
    if (slot === undefined || slot === trip.slot || trip.depart <= now)
      return trip;
    return {
      ...trip,
      ...flowAntRoute(
        puzzle,
        { ...trip, slot },
        context.origins?.get(trip.packet),
      ),
      slot,
    };
  });
  const added: FlowTrip[] = [],
    reserved = new Set(trips.map((t) => t.cell));
  const pending = events
    .filter((event) => !reserved.has(event.cell))
    .map((event) => ({
      ...event,
      slot: context.slots?.get(event.packet) ?? event.slot,
    }));
  // Same-colour followers may head out together. Other colours still open
  // their passages through real pickups, preserving the original dock puzzle.
  const clearance = new Map(
    trips.map((trip) => [trip.cell, trip.at + 40 / speed]),
  );
  const reservedColors = new Map(trips.map((trip) => [trip.cell, trip.color]));
  const nextDeparture = new Map<number, number>();
  for (const trip of trips)
    nextDeparture.set(
      trip.packet,
      Math.max(nextDeparture.get(trip.packet) ?? 0, trip.depart + stagger),
    );
  const origin = (event: FlowEvent) =>
    context.origins?.get(event.packet) ?? {
      x: 84 + event.slot * 93,
      y: geometry.bottom + 126,
    };
  let clock = now + launch;
  while (pending.length) {
    const navigationByColor = new Map<number, number[]>(),
      edgeByColor = new Map<number, Set<number>>();
    const navigation = (color: number) => {
      let cells = navigationByColor.get(color);
      if (!cells) {
        cells = [...context.cells!];
        for (const [cell, at] of clearance)
          if (at <= clock || reservedColors.get(cell) === color)
            cells[cell] = -1;
        navigationByColor.set(color, cells);
      }
      return cells;
    };
    const ready = pending.filter((event) => {
      if ((nextDeparture.get(event.packet) ?? now + launch) > clock)
        return false;
      let edge = edgeByColor.get(event.color);
      if (!edge) {
        edge = new Set(flowOpenCells(puzzle, navigation(event.color)));
        edgeByColor.set(event.color, edge);
      }
      return edge.has(event.cell);
    });
    if (!ready.length) {
      const next = Math.min(
        ...[...clearance.values()].filter((at) => at > clock),
        ...pending.map((event) => {
          const at = nextDeparture.get(event.packet) ?? now + launch;
          return at > clock ? at : Infinity;
        }),
      );
      if (!Number.isFinite(next)) throw new Error("Unreachable colony target");
      clock = next;
      continue;
    }
    // Shortlist by distance, then compare actual clear walking routes.
    ready.sort((a, b) => {
      const distance = (e: FlowEvent) => {
        const from = origin(e);
        return Math.hypot(
          geometry.startX + (e.cell % puzzle.width) * geometry.step - from.x,
          geometry.startY +
            Math.floor(e.cell / puzzle.width) * geometry.step -
            from.y,
        );
      };
      return distance(a) - distance(b) || a.cell - b.cell;
    });
    const approaches = new Map<number, ReturnType<typeof flowApproaches>>();
    const choices = ready
      .slice(0, 8)
      .map((event) => {
        const from = origin(event);
        let approach = approaches.get(event.packet);
        if (!approach) {
          approach = flowApproaches(puzzle, navigation(event.color), {
            x: (from.x - geometry.startX) / geometry.step,
            y: puzzle.height,
          });
          approaches.set(event.packet, approach);
        }
        const path = approach(event.cell);
        if (!path) throw new Error("Target is not on the physical frontier");
        const candidate = { ...event, path };
        return {
          candidate,
          route: flowAntRoute(
            puzzle,
            candidate,
            from,
            navigation(event.color),
            true,
          ),
        };
      })
      .sort(
        (a, b) =>
          a.route.outboundLength - b.route.outboundLength ||
          a.candidate.cell - b.candidate.cell,
      );
    // Rounded route lengths are lower bounds: validate the nearest candidate,
    // and only visit another if it could still beat the validated winner.
    let best: (typeof choices)[number] | undefined;
    for (const choice of choices) {
      if (best && choice.route.outboundLength > best.route.outboundLength)
        break;
      const route = flowAntRoute(
        puzzle,
        choice.candidate,
        origin(choice.candidate),
        navigation(choice.candidate.color),
      );
      if (
        !best ||
        route.outboundLength < best.route.outboundLength ||
        (route.outboundLength === best.route.outboundLength &&
          choice.candidate.cell < best.candidate.cell)
      )
        best = { candidate: choice.candidate, route };
    }
    const { candidate: event, route } = best!;
    const variation =
      1 + (((event.cell * 13 + event.packet * 7) % 7) - 3) * 0.012;
    const safeDuration = (path: string, start: number, base: number) => {
      const samples = flowPathSamples(path),
        length = samples.at(-1)!.distance;
      const checked = new Set<number>();
      let duration = base;
      for (const point of samples) {
        const column = Math.floor((point.x - geometry.startX) / geometry.step),
          row = Math.floor((point.y - geometry.startY) / geometry.step);
        if (
          column < 0 ||
          column >= puzzle.width ||
          row < 0 ||
          row >= puzzle.height
        )
          continue;
        const cell = row * puzzle.width + column;
        if (cell === event.cell || checked.has(cell)) continue;
        checked.add(cell);
        const clearAt = clearance.get(cell);
        if (clearAt !== undefined)
          duration = Math.max(
            duration,
            ((clearAt - start) * length) / Math.max(1, point.distance - 2),
          );
      }
      return duration;
    };
    // Constrain entry into reserved squares, while allowing a whole visible
    // wave to leave the box at its regular cadence.
    const depart = clock;
    const outbound = safeDuration(
      route.outboundPath,
      depart,
      Math.max(650, (route.outboundLength / (165 * variation)) * 1000) / speed,
    );
    const arrive = depart + outbound,
      at = arrive + pickupPause * 0.55,
      returnAt = arrive + pickupPause;
    const carry = safeDuration(
      route.returnPath,
      returnAt,
      Math.max(600, (route.returnLength / (150 * variation)) * 1000) / speed,
    );
    const trip: FlowTrip = {
      ...event,
      ...route,
      id: `${context.epoch ?? "flow"}:${event.packet}:${event.cell}`,
      worker: event.cell,
      renderAt: now,
      depart,
      arrive,
      at,
      returnAt,
      outbound,
      carry,
      deliveryAt: returnAt + carry,
      pickupPause,
    };
    trips.push(trip);
    added.push(trip);
    reserved.add(trip.cell);
    clearance.set(trip.cell, trip.at + 40 / speed);
    reservedColors.set(trip.cell, trip.color);
    nextDeparture.set(trip.packet, depart + stagger);
    pending.splice(
      pending.findIndex((item) => item.cell === event.cell),
      1,
    );
  }
  return {
    launch,
    stagger,
    pickupPause,
    trips,
    added,
    pickups: trips,
    deliveries: trips.map((t) => ({ ...t, at: t.deliveryAt })),
    finish: Math.max(now, ...trips.map((t) => t.deliveryAt)) + 960 / speed,
  };
}
