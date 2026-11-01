/** Shared deterministic rules. Visual timing never affects a move or score. */
import * as legacyV2 from "./flowV2";
import * as legacyV3 from "./flowV3";
import { FLOW_ART_COLORS, flowLevelArt } from "./flowLevelArt";

export const FLOW_VERSION = 4;
export const FLOW_LEVELS = 36;
export const FLOW_COLORS = FLOW_ART_COLORS;
export type FlowPacket = {
  id: number;
  color: number;
  count: number;
  /** A pair launches atomically when both commands reach their lane heads. */
  link?: string;
  /** Concealed in the supply queue; the lane head always reveals its colour. */
  mystery?: boolean;
};
export type FlowPuzzle = {
  version?: 2 | 3 | 4;
  id: string;
  name: string;
  width: number;
  height: number;
  cells: number[];
  lanes: FlowPacket[][];
  slots: number;
  solution: number[];
  hiddenCells?: number[];
  family?: string;
};
export type FlowState = {
  cells: number[];
  lanes: number[];
  active: (FlowPacket & { left: number })[];
  launches: number;
  collected: number;
};
export type FlowAction =
  { type: "launch"; lane: number } | { type: "undo" } | { type: "hint" };
export type FlowEvent = {
  cell: number;
  packet: number;
  color: number;
  slot: number;
  /** Grid coordinates: exterior air -> empty approach cells -> target cube. */
  path?: { x: number; y: number }[];
};
export type FlowReplay = {
  state: FlowState;
  history: FlowState[];
  events: FlowEvent[];
  hints: number;
  undos: number;
  score: number;
  stars: number;
  won: boolean;
  stuck: boolean;
};

function random(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n += 0x6d2b79f5;
    let x = n;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function flowDay(now = new Date()) {
  return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}
function puzzleVersion(puzzle: Partial<Pick<FlowPuzzle, "version" | "id">>) {
  return puzzle.version ?? (puzzle.id?.endsWith(":v2") ? 2 : puzzle.id?.endsWith(":v3") ? 3 : 4);
}
const v2 = (puzzle: FlowPuzzle) => puzzle as legacyV2.FlowPuzzle;
const v3 = (puzzle: FlowPuzzle) => puzzle as legacyV3.FlowPuzzle;

/**
 * One exterior flood fill per launch, extended as cubes disappear. A previously
 * sealed cavity is visited only when it connects to exterior air. Parent paths
 * always pass through cells that have already become empty.
 */
function flowAccess(puzzle: Pick<FlowPuzzle, "width" | "height">, cells: readonly number[]) {
  const { width, height } = puzzle;
  const stride = width + 2, total = stride * (height + 2);
  const parents = new Int32Array(total).fill(-1);
  const air = new Uint8Array(total), edge = new Uint8Array(cells.length);
  const queue = new Int32Array(total);
  const start = (height + 1) * stride + Math.floor(stride / 2);
  let head = 0, tail = 1;
  parents[start] = start;
  air[start] = 1;
  queue[0] = start;
  function flood() {
    while (head < tail) {
      const at = queue[head++], x = at % stride, y = Math.floor(at / stride);
      const neighbors = [y > 0 ? at - stride : -1, x > 0 ? at - 1 : -1, x < stride - 1 ? at + 1 : -1, y < height + 1 ? at + stride : -1];
      for (const next of neighbors) {
        if (next < 0 || air[next]) continue;
        const nx = next % stride - 1, ny = Math.floor(next / stride) - 1;
        const cell = ny * width + nx;
        const occupied = nx >= 0 && nx < width && ny >= 0 && ny < height && cells[cell] >= 0;
        if (parents[next] < 0) parents[next] = at;
        if (occupied) edge[cell] = 1;
        else {
          air[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  flood();
  return {
    edge,
    remove(cell: number) {
      edge[cell] = 0;
      const at = (Math.floor(cell / width) + 1) * stride + cell % width + 1;
      if (air[at]) return;
      air[at] = 1;
      queue[tail++] = at;
      flood();
    },
    path(cell: number) {
      let at = (Math.floor(cell / width) + 1) * stride + cell % width + 1;
      const points: { x: number; y: number }[] = [];
      while (at >= 0) {
        const x = at % stride - 1, y = Math.floor(at / stride) - 1;
        points.push({ x, y });
        if (x < 0 || x >= width || y < 0 || y >= height) break;
        at = parents[at];
      }
      return points.reverse();
    },
  };
}
const peelLayers = new WeakMap<FlowPuzzle, Uint16Array>();
const peelOrders = new WeakMap<FlowPuzzle, number[]>();
function originalLayers(puzzle: FlowPuzzle) {
  let layers = peelLayers.get(puzzle);
  if (!layers) {
    layers = new Uint16Array(puzzle.cells.length).fill(0xffff);
    const remaining = [...puzzle.cells];
    let count = remaining.filter(color => color >= 0).length, layer = 0;
    while (count > 0) {
      const edge = flowAccess(puzzle, remaining).edge;
      let removed = 0;
      for (let cell = 0; cell < edge.length; cell++) if (edge[cell]) {
        layers[cell] = layer;
        remaining[cell] = -1;
        removed++;
      }
      if (!removed) break;
      count -= removed;
      layer++;
    }
    peelLayers.set(puzzle, layers);
  }
  return layers;
}
function originalOrder(puzzle: FlowPuzzle) {
  let order = peelOrders.get(puzzle);
  if (!order) {
    const layers = originalLayers(puzzle);
    order = puzzle.cells.map((_, i) => i).filter(i => puzzle.cells[i] >= 0).sort((a, b) => layers[a] - layers[b] || Math.floor(b / puzzle.width) - Math.floor(a / puzzle.width) || a % puzzle.width - b % puzzle.width);
    peelOrders.set(puzzle, order);
  }
  return order;
}
/** An approach through presently visible air, without speculative pickups. */
export function flowApproach(
  puzzle: Pick<FlowPuzzle, "width" | "height"> & Partial<Pick<FlowPuzzle, "version" | "id">>,
  cells: readonly number[], cell: number,
): { x: number; y: number }[] | undefined {
  if (puzzleVersion(puzzle) === 2 || !Number.isInteger(cell) || cell < 0 || cell >= cells.length || cells[cell] < 0) return undefined;
  if (puzzleVersion(puzzle) === 3) return legacyV3.flowApproach(puzzle as Parameters<typeof legacyV3.flowApproach>[0], cells, cell);
  const access = flowAccess(puzzle, cells);
  return access.edge[cell] ? access.path(cell) : undefined;
}
export function flowFrontier(puzzle: FlowPuzzle, cells: number[]) {
  if (puzzleVersion(puzzle) === 2) return legacyV2.flowFrontier(v2(puzzle), cells);
  if (puzzleVersion(puzzle) === 3) return legacyV3.flowFrontier(v3(puzzle), cells);
  const edge = flowAccess(puzzle, cells).edge;
  return originalOrder(puzzle).filter(i => edge[i]);
}
export function initialFlow(puzzle: FlowPuzzle): FlowState {
  return { cells: [...puzzle.cells], lanes: puzzle.lanes.map(() => 0), active: [], launches: 0, collected: 0 };
}

/** All commands belonging to this click, including their actual dock cost. */
export function flowLaunchPackets(puzzle: FlowPuzzle, state: FlowState, lane: number): { lane: number; packet: FlowPacket }[] | null {
  if (!Number.isInteger(lane) || lane < 0 || lane >= puzzle.lanes.length) return null;
  const packet = puzzle.lanes[lane][state.lanes[lane]];
  if (!packet) return null;
  let group = [{ lane, packet }];
  if (puzzleVersion(puzzle) === 4 && packet.link) {
    const linked = puzzle.lanes.flatMap((packets, at) => packets.filter(p => p.link === packet.link).map(p => ({ lane: at, packet: p })));
    if (linked.length !== 2 || new Set(linked.map(p => p.lane)).size !== 2 || linked.some(p => puzzle.lanes[p.lane][state.lanes[p.lane]]?.id !== p.packet.id)) return null;
    group = linked.sort((a, b) => a.packet.id - b.packet.id);
  }
  return state.active.length + group.length <= puzzle.slots ? group : null;
}

function settle(puzzle: FlowPuzzle, state: FlowState, recordEvents: boolean): FlowEvent[] {
  const access = flowAccess(puzzle, state.cells), order = originalOrder(puzzle);
  const events: FlowEvent[] = [];
  let working = true;
  while (working) {
    working = false;
    for (let slot = 0; slot < state.active.length; slot++) {
      const team = state.active[slot];
      if (!team.left) continue;
      const cell = order.find(i => access.edge[i] && state.cells[i] === team.color);
      if (cell === undefined) continue;
      if (recordEvents) events.push({ cell, packet: team.id, color: team.color, slot, path: access.path(cell) });
      state.cells[cell] = -1;
      state.collected++;
      team.left--;
      access.remove(cell);
      working = true;
    }
  }
  // A bridge is one dock group: its finished end keeps its place until the
  // partner also finishes, even if it has no cubes left to collect itself.
  const pendingLinks = new Set(state.active.filter(p => p.left > 0 && p.link).map(p => p.link));
  state.active = state.active.filter(p => p.left > 0 || (p.link && pendingLinks.has(p.link)));
  return events;
}
function launchCurrent(puzzle: FlowPuzzle, before: FlowState, lane: number, recordEvents: boolean) {
  const group = flowLaunchPackets(puzzle, before, lane);
  if (!group) return null;
  const state: FlowState = { ...before, cells: [...before.cells], lanes: [...before.lanes], active: before.active.map(p => ({ ...p })), launches: before.launches + 1 };
  for (const item of group) {
    state.lanes[item.lane]++;
    state.active.push({ ...item.packet, left: item.packet.count });
  }
  return { state, events: settle(puzzle, state, recordEvents) };
}
export function launchFlow(puzzle: FlowPuzzle, before: FlowState, lane: number): { state: FlowState; events: FlowEvent[] } | null {
  if (puzzleVersion(puzzle) === 2) return legacyV2.launchFlow(v2(puzzle), before, lane);
  if (puzzleVersion(puzzle) === 3) return legacyV3.launchFlow(v3(puzzle), before, lane);
  return launchCurrent(puzzle, before, lane, true);
}
export function flowWon(puzzle: FlowPuzzle, state: FlowState) {
  return state.cells.every(c => c < 0) && !state.active.length && puzzle.lanes.every((lane, i) => state.lanes[i] === lane.length);
}
export function flowStuck(puzzle: FlowPuzzle, state: FlowState) {
  if (puzzleVersion(puzzle) === 2) return legacyV2.flowStuck(v2(puzzle), state);
  if (puzzleVersion(puzzle) === 3) return legacyV3.flowStuck(v3(puzzle), state);
  return !flowWon(puzzle, state) && puzzle.lanes.every((_, i) => !flowLaunchPackets(puzzle, state, i));
}

function winningRoute(puzzle: FlowPuzzle, route: number[]) {
  let state = initialFlow(puzzle);
  for (const lane of route) {
    const next = launchCurrent(puzzle, state, lane, false);
    if (!next) return false;
    state = next.state;
  }
  return flowWon(puzzle, state);
}
function hideInterior(puzzle: FlowPuzzle, level: number, rng: () => number) {
  if (level < 21) return;
  const layers = originalLayers(puzzle), size = level >= 29 ? 3 : 2;
  const candidates: number[][] = [];
  for (let y = 1; y + 3 < puzzle.height; y++) for (let x = 1; x + size < puzzle.width; x++) {
    const patch = Array.from({ length: size * 3 }, (_, i) => (y + Math.floor(i / size)) * puzzle.width + x + i % size);
    if (patch.every(i => puzzle.cells[i] >= 0 && layers[i] >= 2)) candidates.push(patch);
  }
  const hidden = new Set<number>();
  for (let n = 0; n < (level >= 29 ? 3 : 2) && candidates.length; n++) {
    const free = candidates.filter(patch => patch.every(i => !hidden.has(i)));
    if (!free.length) break;
    const patch = free[Math.floor(rng() * free.length)];
    for (const cell of patch) hidden.add(cell);
  }
  if (hidden.size) puzzle.hiddenCells = [...hidden].sort((a, b) => a - b);
}
const puzzleCache = new Map<string, FlowPuzzle>();
function freezePuzzle(puzzle: FlowPuzzle) {
  Object.freeze(puzzle.cells);
  Object.freeze(puzzle.solution);
  if (puzzle.hiddenCells) Object.freeze(puzzle.hiddenCells);
  for (const lane of puzzle.lanes) {
    lane.forEach(Object.freeze);
    Object.freeze(lane);
  }
  Object.freeze(puzzle.lanes);
  return Object.freeze(puzzle);
}

/** Build a safe chronological supply, then distribute it among ordered lanes. */
export function makeFlowPuzzle(kind: "level" | "daily", key: number | string, version: 2 | 3 | 4 = FLOW_VERSION): FlowPuzzle {
  if (version === 2) return { ...legacyV2.makeFlowPuzzle(kind, key), version: 2 };
  if (version === 3) return legacyV3.makeFlowPuzzle(kind, key);
  if (version !== 4) throw Error("Неизвестная версия поля");
  if (kind === "level" && (!Number.isInteger(key) || Number(key) < 1 || Number(key) > FLOW_LEVELS)) throw Error("Неизвестный уровень");
  if (kind === "daily" && !/^\d{4}-\d{2}-\d{2}$/.test(String(key))) throw Error("Некорректная дата");
  const id = `${kind}:${key}:v4`, cached = puzzleCache.get(id);
  if (cached) {
    puzzleCache.delete(id);
    puzzleCache.set(id, cached);
    return cached;
  }
  const rng = random(id), level = kind === "level" ? Number(key) : 25 + Math.floor(rng() * 12);
  const art = flowLevelArt(kind === "level" ? level - 1 : Math.floor(rng() * FLOW_LEVELS));
  const colorCounts = Array(FLOW_COLORS.length).fill(0);
  for (const color of art.cells) if (color >= 0) colorCounts[color]++;
  const colorCount = colorCounts.filter(Boolean).length;
  const laneCount = level <= 12 && colorCount <= 5 ? 3 : 4;
  const puzzle: FlowPuzzle = { version: 4, id, name: art.name, family: art.family, width: art.width, height: art.height, cells: [...art.cells], lanes: Array.from({ length: laneCount }, () => []), slots: 5, solution: [] };
  const chronological: FlowPacket[] = [];
  let state = initialFlow(puzzle);
  while (state.collected < puzzle.cells.filter(c => c >= 0).length) {
    const frontier = flowFrontier(puzzle, state.cells), exposed = Array(FLOW_COLORS.length).fill(0);
    for (const cell of frontier) exposed[state.cells[cell]]++;
    const available = exposed.map((count, color) => ({ color, weight: count * (0.8 + rng() * 0.4) })).filter(item => item.weight > 0 && colorCounts[item.color] > 0);
    available.sort((a, b) => b.weight - a.weight);
    if (!available.length) throw Error(`Не удалось построить маршрут ${id}`);
    const color = available[0].color, capacity = (level <= 12 ? 20 : level <= 24 ? 25 : 30) + Math.floor(rng() * (level <= 12 ? 13 : 16));
    let count = Math.min(capacity, colorCounts[color]);
    if (colorCounts[color] - count > 0 && colorCounts[color] - count < 5) count = colorCounts[color];
    const packet: FlowPacket = { id: chronological.length, color, count };
    const simulate = () => {
      const next = { ...state, cells: [...state.cells], lanes: [], active: [...state.active.map(p => ({ ...p })), { ...packet, left: packet.count }] };
      settle(puzzle, next, false);
      return next;
    };
    let next = simulate();
    // Keep a spare dock for a newly exposed colour. A pressure-safe short quota
    // can clear narrow details without filling all five docks with waiting teams.
    const waiting = next.active.find(p => p.id === packet.id);
    if (next.active.length >= puzzle.slots && waiting) {
      count -= waiting.left;
      if (!count) throw Error(`Закрытый контур ${id}`);
      packet.count = count;
      next = simulate();
    }
    chronological.push(packet);
    colorCounts[color] -= count;
    state = next;
  }
  const firstColorLane = new Map<number, number>();
  const route: number[] = [];
  const firstColor = chronological[0]?.color;
  for (const packet of chronological) {
    let lane = firstColorLane.get(packet.color);
    if (lane === undefined) {
      lane = firstColorLane.size < laneCount ? firstColorLane.size : Math.floor(rng() * laneCount);
      firstColorLane.set(packet.color, lane);
    } else if (!(packet.color === firstColor && firstColorLane.size < laneCount)) {
      const sizes = puzzle.lanes.map(l => l.length + rng() * 2);
      lane = sizes.indexOf(Math.min(...sizes));
    }
    puzzle.lanes[lane].push(packet);
    route.push(lane);
  }
  puzzle.solution = route;
  if (level >= 7) {
    const future = puzzle.lanes.flatMap(lane => lane.slice(1));
    for (const packet of future) if (rng() < 0.2) packet.mystery = true;
    if (future.length && !future.some(p => p.mystery)) future[Math.floor(rng() * future.length)].mystery = true;
  }
  if (level >= 13) {
    const maximum = Math.min(3, 1 + Math.floor((level - 13) / 8));
    let linked = 0, attempts = 0;
    const candidates = chronological.slice(0, -1).map((_, i) => i).filter(i => route[i] !== route[i + 1]);
    // Evenly spread candidates before deterministic shuffling: links remain
    // occasional decisions rather than dominating the initial supply row.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const joined = new Set<number>(), used = new Set<number>();
    for (const at of candidates) {
      if (linked >= maximum || attempts++ >= 12) break;
      if (used.has(at) || used.has(at + 1)) continue;
      const link = `pair-${linked + 1}`;
      chronological[at].link = link;
      chronological[at + 1].link = link;
      const trialJoined = new Set([...joined, at + 1]);
      const candidate = route.filter((_, i) => !trialJoined.has(i));
      if (winningRoute(puzzle, candidate)) {
        joined.add(at + 1);
        used.add(at);
        used.add(at + 1);
        // Prevent overlap at either end of an accepted adjacent pair.
        linked++;
        puzzle.solution = candidate;
      } else {
        delete chronological[at].link;
        delete chronological[at + 1].link;
      }
    }
  }
  hideInterior(puzzle, level, rng);
  const frozen = freezePuzzle(puzzle);
  puzzleCache.set(id, frozen);
  while (puzzleCache.size > 64) puzzleCache.delete(puzzleCache.keys().next().value!);
  return frozen;
}

export function flowSolution(puzzle: FlowPuzzle, state: FlowState, budget = 16000): number[] | null {
  if (puzzleVersion(puzzle) === 2) return legacyV2.flowSolution(v2(puzzle), state, budget);
  if (puzzleVersion(puzzle) === 3) return legacyV3.flowSolution(v3(puzzle), state, budget);
  const signature = (s: FlowState) => JSON.stringify([s.cells, s.lanes, s.active]);
  let canonical = initialFlow(puzzle);
  const wanted = signature(state);
  for (let i = 0; i <= puzzle.solution.length; i++) {
    if (signature(canonical) === wanted) return puzzle.solution.slice(i);
    if (i < puzzle.solution.length) {
      const next = launchCurrent(puzzle, canonical, puzzle.solution[i], false);
      if (!next) break;
      canonical = next.state;
    }
  }
  const seen = new Set<string>();
  let visits = 0;
  const dfs = (current: FlowState): number[] | null => {
    if (flowWon(puzzle, current)) return [];
    if (flowStuck(puzzle, current) || ++visits > budget) return null;
    const key = current.cells.join(",") + "/" + current.lanes.join(",") + "/" + current.active.map(p => `${p.id}:${p.left}`).join(",");
    if (seen.has(key)) return null;
    seen.add(key);
    const frontier = new Set(flowFrontier(puzzle, current.cells).map(i => current.cells[i]));
    const lanes = puzzle.lanes.map((_, i) => i).sort((a, b) => Number(frontier.has(puzzle.lanes[b][current.lanes[b]]?.color)) - Number(frontier.has(puzzle.lanes[a][current.lanes[a]]?.color)));
    for (const lane of lanes) {
      const next = launchCurrent(puzzle, current, lane, false);
      if (!next) continue;
      const rest = dfs(next.state);
      if (rest) return [lane, ...rest];
    }
    return null;
  };
  return dfs(state);
}
export function replayFlow(puzzle: FlowPuzzle, actions: unknown): FlowReplay {
  if (puzzleVersion(puzzle) === 2) return legacyV2.replayFlow(v2(puzzle), actions);
  if (puzzleVersion(puzzle) === 3) return legacyV3.replayFlow(v3(puzzle), actions);
  if (!Array.isArray(actions) || actions.length > 600) throw Error("Некорректный журнал партии");
  let state = initialFlow(puzzle), hints = 0, undos = 0, events: FlowEvent[] = [];
  const history: FlowState[] = [];
  for (const action of actions) {
    if (!action || typeof action !== "object" || flowWon(puzzle, state)) throw Error("Некорректное действие");
    if (action.type === "hint") { hints++; continue; }
    if (action.type === "undo") {
      if (!history.length) throw Error("Нечего отменять");
      state = history.pop()!;
      undos++;
      events = [];
      continue;
    }
    if (action.type !== "launch") throw Error("Неизвестное действие");
    const next = launchFlow(puzzle, state, action.lane);
    if (!next) throw Error("Эту команду сейчас нельзя запустить");
    history.push(state);
    state = next.state;
    events = next.events;
  }
  const score = Math.max(100, 1000 - hints * 100 - undos * 20);
  return { state, history, events, hints, undos, score, stars: score >= 960 ? 3 : score >= 800 ? 2 : 1, won: flowWon(puzzle, state), stuck: flowStuck(puzzle, state) };
}
