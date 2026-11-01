/** Shared, deterministic rules. Visual timing never affects a move or score. */
import * as legacy from "./flowV2";

export const FLOW_VERSION = 3;
export const FLOW_LEVELS = 36;
export const FLOW_COLORS = [
  { name: "мятная", hex: "#46d6b1", dark: "#0e5342", symbol: "◆" },
  { name: "коралловая", hex: "#ff846d", dark: "#68261b", symbol: "●" },
  { name: "сиреневая", hex: "#ad99ff", dark: "#3c2b6d", symbol: "✦" },
  { name: "золотая", hex: "#ffd16b", dark: "#72500e", symbol: "▲" },
  { name: "голубая", hex: "#70c8ff", dark: "#19486a", symbol: "■" },
  { name: "розовая", hex: "#ef9ac3", dark: "#76294d", symbol: "♥" },
  { name: "персиковая", hex: "#ffb879", dark: "#713a17", symbol: "✚" },
] as const;
export type FlowPacket = { id: number; color: number; count: number };
export type FlowPuzzle = {
  version?: 2 | 3;
  id: string;
  name: string;
  width: number;
  height: number;
  cells: number[];
  lanes: FlowPacket[][];
  slots: number;
  solution: number[];
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

const pictures = [
  {
    name: "Кот на орбите",
    rows: [
      ".22...22.",
      ".252.252.",
      ".2222222.",
      ".2342432.",
      ".2221222.",
      "..22222..",
      "...000...",
      "..00000..",
      ".0000000.",
      ".000.000.",
    ],
    palettes: [
      [2, 5, 6, 3, 4, 1, 0],
      [0, 2, 5, 3, 4, 1, 6],
    ],
  },
  {
    name: "Маленькая ракета",
    rows: [
      "....1....",
      "...111...",
      "...111...",
      "..14441..",
      "..14441..",
      "..11111..",
      ".2211122.",
      "222111222",
      "...333...",
      "....3....",
    ],
    palettes: [
      [0, 6, 4, 1, 0, 5, 2],
      [6, 4, 5, 3, 0, 1, 2],
    ],
  },
  {
    name: "Клубничный рейс",
    rows: [
      "...000...",
      "..00000..",
      ".1111111.",
      "115131511",
      "111111111",
      "131115131",
      ".1111111.",
      "..11311..",
      "...111...",
      "....1....",
    ],
    palettes: [
      [0, 5, 2, 3, 4, 6, 1],
      [0, 2, 1, 3, 4, 5, 6],
    ],
  },
  {
    name: "Солнечный цветок",
    rows: [
      "...333...",
      ".3333333.",
      "333111333",
      "331515133",
      "333111333",
      ".3333333.",
      "...000...",
      "000000...",
      ".0000000.",
      "...000000",
      "...000...",
    ],
    palettes: [
      [0, 3, 2, 5, 4, 1, 6],
      [0, 6, 2, 1, 4, 3, 5],
    ],
  },
  {
    name: "Дом для облака",
    rows: [
      "....1....",
      "...111...",
      "..11111..",
      ".1111111.",
      "111111111",
      ".6666666.",
      ".6446446.",
      ".6446226.",
      ".6666236.",
      "000000000",
    ],
    palettes: [
      [0, 2, 1, 3, 4, 5, 6],
      [0, 1, 2, 3, 4, 6, 5],
    ],
  },
  {
    name: "Кит и звёзды",
    rows: [
      "..3......",
      ".333.....",
      "..3......",
      "..444..44",
      ".44444444",
      "442444444",
      "445444444",
      "444444444",
      ".0000000.",
      "..00000..",
    ],
    palettes: [
      [4, 1, 2, 3, 0, 5, 6],
      [0, 1, 4, 3, 2, 5, 6],
    ],
  },
  {
    name: "Планета карамели",
    rows: [
      "...222...",
      "..22222..",
      ".2255222.",
      "332222233",
      "333333333",
      "332222233",
      ".2225522.",
      "..22222..",
      "...222...",
      "......4..",
    ],
    palettes: [
      [0, 1, 4, 6, 3, 0, 2],
      [0, 1, 5, 3, 4, 2, 6],
    ],
  },
  {
    name: "Солнечный гриб",
    rows: [
      "...111...",
      "..11311..",
      ".1111111.",
      "113111311",
      "111131111",
      ".6666666.",
      "...666...",
      "...666...",
      "..66666..",
      ".0000000.",
    ],
    palettes: [
      [0, 5, 2, 3, 4, 1, 6],
      [0, 2, 1, 3, 4, 5, 6],
    ],
  },
  {
    name: "Бабочка",
    rows: [
      "22.....11",
      "222...111",
      "225202511",
      ".2220111.",
      "..22011..",
      ".4440333.",
      "445403533",
      "444...333",
      "44.....33",
    ],
    palettes: [
      [0, 5, 4, 1, 2, 3, 6],
      [0, 3, 5, 2, 4, 1, 6],
    ],
  },
  {
    name: "Мороженое",
    rows: [
      "...555...",
      "..55555..",
      ".5545555.",
      "555555255",
      "555455555",
      ".6666666.",
      ".6336336.",
      "..63336..",
      "..66366..",
      "...666...",
      "....6....",
    ],
    palettes: [
      [0, 1, 5, 3, 2, 4, 6],
      [0, 1, 4, 3, 5, 2, 6],
    ],
  },
  {
    name: "Радуга",
    rows: [
      "...111...",
      "..15551..",
      ".1522251.",
      "152444251",
      "152000251",
      "1520.0251",
      "152...251",
      "666...666",
      "6666.6666",
      ".6666666.",
    ],
    palettes: [
      [0, 1, 2, 3, 6, 5, 4],
      [0, 1, 2, 3, 4, 6, 5],
    ],
  },
  {
    name: "Краб на пляже",
    rows: [
      "11.....11",
      "111...111",
      ".11...11.",
      ".144.441.",
      "..11111..",
      ".1155511.",
      "111111111",
      ".1111111.",
      "11.111.11",
      "1..333..1",
    ],
    palettes: [
      [0, 5, 2, 3, 4, 6, 1],
      [0, 6, 2, 3, 4, 1, 5],
    ],
  },
];
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
const isLegacy = (puzzle: FlowPuzzle) =>
  puzzle.version === 2 ||
  (puzzle.version === undefined && puzzle.id.endsWith(":v2"));

/** Air comes from outside the silhouette; sealed holes are not accessible. */
function flowAccess(
  puzzle: Pick<FlowPuzzle, "width" | "height">,
  cells: readonly number[],
) {
  const stride = puzzle.width + 2;
  const total = stride * (puzzle.height + 2);
  const parents = new Int32Array(total).fill(-1);
  const edge = new Uint8Array(cells.length);
  const queue = new Int32Array(total);
  const start = (puzzle.height + 1) * stride + Math.floor(stride / 2);
  parents[start] = start;
  queue[0] = start;
  let head = 0,
    tail = 1;
  while (head < tail) {
    const at = queue[head++];
    const x = at % stride,
      y = Math.floor(at / stride);
    for (const next of [
      y > 0 ? at - stride : -1,
      x > 0 ? at - 1 : -1,
      x < stride - 1 ? at + 1 : -1,
      y < puzzle.height + 1 ? at + stride : -1,
    ]) {
      if (next < 0 || parents[next] >= 0) continue;
      parents[next] = at;
      const nx = (next % stride) - 1,
        ny = Math.floor(next / stride) - 1;
      const cell = ny * puzzle.width + nx;
      if (
        nx >= 0 &&
        nx < puzzle.width &&
        ny >= 0 &&
        ny < puzzle.height &&
        cells[cell] >= 0
      )
        edge[cell] = 1;
      else queue[tail++] = next;
    }
  }
  const frontier: number[] = [];
  for (let y = puzzle.height - 1; y >= 0; y--)
    for (let x = 0; x < puzzle.width; x++) {
      const cell = y * puzzle.width + x;
      if (edge[cell]) frontier.push(cell);
    }
  return {
    frontier,
    path(cell: number) {
      let at =
        (Math.floor(cell / puzzle.width) + 1) * stride +
        (cell % puzzle.width) +
        1;
      const points: { x: number; y: number }[] = [];
      while (at >= 0) {
        const x = (at % stride) - 1,
          y = Math.floor(at / stride) - 1;
        points.push({ x, y });
        if (x < 0 || x >= puzzle.width || y < 0 || y >= puzzle.height) break;
        at = parents[at];
      }
      return points.reverse();
    },
  };
}

const peelLayers = new WeakMap<FlowPuzzle, Uint16Array>();
function prioritizedFrontier(puzzle: FlowPuzzle, frontier: number[]) {
  let layers = peelLayers.get(puzzle);
  if (!layers) {
    layers = new Uint16Array(puzzle.cells.length).fill(0xffff);
    const remaining = [...puzzle.cells];
    let layer = 0;
    while (remaining.some((color) => color >= 0)) {
      const edge = flowAccess(puzzle, remaining).frontier;
      if (!edge.length) break;
      for (const cell of edge) {
        layers[cell] = layer;
        remaining[cell] = -1;
      }
      layer++;
    }
    peelLayers.set(puzzle, layers);
  }
  const originalLayers = layers;
  return frontier.sort(
    (a, b) =>
      originalLayers[a] - originalLayers[b] ||
      Math.floor(b / puzzle.width) - Math.floor(a / puzzle.width) ||
      (a % puzzle.width) - (b % puzzle.width),
  );
}

/** A route through the air that is visibly open now, without speculative pickups. */
export function flowApproach(
  puzzle: Pick<FlowPuzzle, "width" | "height"> &
    Partial<Pick<FlowPuzzle, "version" | "id">>,
  cells: readonly number[],
  cell: number,
): { x: number; y: number }[] | undefined {
  if (
    puzzle.version === 2 ||
    (puzzle.version === undefined && puzzle.id?.endsWith(":v2")) ||
    !Number.isInteger(cell) ||
    cell < 0 ||
    cell >= cells.length ||
    cells[cell] < 0
  )
    return undefined;
  const access = flowAccess(puzzle, cells);
  return access.frontier.includes(cell) ? access.path(cell) : undefined;
}

export function flowFrontier(puzzle: FlowPuzzle, cells: number[]) {
  return isLegacy(puzzle)
    ? legacy.flowFrontier(puzzle, cells)
    : prioritizedFrontier(puzzle, flowAccess(puzzle, cells).frontier);
}
export function initialFlow(puzzle: FlowPuzzle): FlowState {
  return {
    cells: [...puzzle.cells],
    lanes: puzzle.lanes.map(() => 0),
    active: [],
    launches: 0,
    collected: 0,
  };
}
export function launchFlow(
  puzzle: FlowPuzzle,
  before: FlowState,
  lane: number,
): { state: FlowState; events: FlowEvent[] } | null {
  if (isLegacy(puzzle)) return legacy.launchFlow(puzzle, before, lane);
  if (
    !Number.isInteger(lane) ||
    lane < 0 ||
    lane >= puzzle.lanes.length ||
    before.active.length >= puzzle.slots
  )
    return null;
  const packet = puzzle.lanes[lane][before.lanes[lane]];
  if (!packet) return null;
  const state: FlowState = {
    ...before,
    cells: [...before.cells],
    lanes: [...before.lanes],
    active: before.active.map((p) => ({ ...p })),
    launches: before.launches + 1,
  };
  state.lanes[lane]++;
  state.active.push({ ...packet, left: packet.count });
  const events: FlowEvent[] = [];
  let working = true;
  while (working) {
    working = false;
    for (const team of state.active) {
      if (!team.left) continue;
      const access = flowAccess(puzzle, state.cells);
      const cell = prioritizedFrontier(puzzle, access.frontier).find(
        (i) => state.cells[i] === team.color,
      );
      if (cell === undefined) continue;
      events.push({
        cell,
        packet: team.id,
        color: team.color,
        slot: state.active.indexOf(team),
        path: access.path(cell),
      });
      state.cells[cell] = -1;
      state.collected++;
      team.left--;
      working = true;
    }
  }
  state.active = state.active.filter((p) => p.left > 0);
  return { state, events };
}
export function flowWon(puzzle: FlowPuzzle, state: FlowState) {
  return (
    state.cells.every((c) => c < 0) &&
    !state.active.length &&
    puzzle.lanes.every((lane, i) => state.lanes[i] === lane.length)
  );
}
export function flowStuck(puzzle: FlowPuzzle, state: FlowState) {
  return (
    !flowWon(puzzle, state) &&
    (state.active.length >= puzzle.slots ||
      puzzle.lanes.every((lane, i) => state.lanes[i] >= lane.length))
  );
}

/** Build a guaranteed solution first, then weave it into ordered supply lanes. */
export function makeFlowPuzzle(
  kind: "level" | "daily",
  key: number | string,
  version: 2 | 3 = FLOW_VERSION,
): FlowPuzzle {
  if (version === 2) return { ...legacy.makeFlowPuzzle(kind, key), version: 2 };
  if (version !== 3) throw Error("Неизвестная версия поля");
  if (
    kind === "level" &&
    (!Number.isInteger(key) || Number(key) < 1 || Number(key) > FLOW_LEVELS)
  )
    throw Error("Неизвестный уровень");
  if (kind === "daily" && !/^\d{4}-\d{2}-\d{2}$/.test(String(key)))
    throw Error("Некорректная дата");
  const id = `${kind}:${key}:v${FLOW_VERSION}`,
    rng = random(id);
  const level = kind === "level" ? Number(key) : 25 + Math.floor(rng() * 12);
  const picture =
    pictures[
      kind === "level"
        ? (level - 1) % pictures.length
        : Math.floor(rng() * pictures.length)
    ];
  const sourceWidth = picture.rows[0].length;
  const chapter = Math.floor((level - 1) / 12);
  const palette = chapter > 0 ? picture.palettes[chapter - 1] : null;
  const source = picture.rows
    .join("")
    .split("")
    .map((v) => (v === "." ? -1 : (palette?.[Number(v)] ?? Number(v))));
  // Every painted pixel becomes four cubes. Whole-object palettes preserve
  // leaves, eyes, windows, roofs and other recognisable picture details.
  const width = sourceWidth * 2,
    height = picture.rows.length * 2;
  const cells = Array.from(
    { length: width * height },
    (_, i) =>
      source[
        Math.floor(Math.floor(i / width) / 2) * sourceWidth +
          Math.floor((i % width) / 2)
      ],
  );
  const puzzle: FlowPuzzle = {
    version: 3,
    id,
    name: picture.name,
    width,
    height,
    cells,
    lanes: [[], [], [], []],
    slots: 5,
    solution: [],
  };
  const work = [...cells];
  let packetId = 0;
  while (work.some((c) => c >= 0)) {
    const frontier = flowFrontier(puzzle, work);
    const colors = [...new Set(frontier.map((i) => work[i]))];
    const color = colors[Math.floor(rng() * colors.length)];
    const capacity =
      level < 13 ? 8 + Math.floor(rng() * 6) : 6 + Math.floor(rng() * 6);
    let count = 0;
    while (count < capacity) {
      const cell = flowFrontier(puzzle, work).find((i) => work[i] === color);
      if (cell === undefined) break;
      work[cell] = -1;
      count++;
    }
    const lane =
      packetId < puzzle.lanes.length
        ? packetId
        : Math.floor(rng() * puzzle.lanes.length);
    puzzle.lanes[lane].push({ id: packetId++, color, count });
    puzzle.solution.push(lane);
  }
  return puzzle;
}

export function flowSolution(
  puzzle: FlowPuzzle,
  state: FlowState,
  budget = 16000,
): number[] | null {
  // The generated route is an exact, cheap hint for any state on that route.
  // Search remains available after the player chooses a different order.
  let canonical = initialFlow(puzzle);
  const signature = (s: FlowState) =>
    JSON.stringify([s.cells, s.lanes, s.active]);
  const wanted = signature(state);
  for (let i = 0; i <= puzzle.solution.length; i++) {
    if (signature(canonical) === wanted) return puzzle.solution.slice(i);
    if (i < puzzle.solution.length)
      canonical = launchFlow(puzzle, canonical, puzzle.solution[i])!.state;
  }
  const seen = new Set<string>();
  let visits = 0;
  const dfs = (current: FlowState): number[] | null => {
    if (flowWon(puzzle, current)) return [];
    if (flowStuck(puzzle, current) || ++visits > budget) return null;
    const key =
      current.cells.join(",") +
      "/" +
      current.lanes.join(",") +
      "/" +
      current.active.map((p) => `${p.id}:${p.left}`).join(",");
    if (seen.has(key)) return null;
    seen.add(key);
    const frontier = new Set(
      flowFrontier(puzzle, current.cells).map((i) => current.cells[i]),
    );
    const lanes = puzzle.lanes
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Number(frontier.has(puzzle.lanes[b][current.lanes[b]]?.color)) -
          Number(frontier.has(puzzle.lanes[a][current.lanes[a]]?.color)),
      );
    for (const lane of lanes) {
      const next = launchFlow(puzzle, current, lane);
      if (!next) continue;
      const rest = dfs(next.state);
      if (rest) return [lane, ...rest];
    }
    return null;
  };
  return dfs(state);
}
export function replayFlow(puzzle: FlowPuzzle, actions: unknown): FlowReplay {
  if (!Array.isArray(actions) || actions.length > 600)
    throw Error("Некорректный журнал партии");
  let state = initialFlow(puzzle),
    hints = 0,
    undos = 0,
    events: FlowEvent[] = [];
  const history: FlowState[] = [];
  for (const action of actions) {
    if (!action || typeof action !== "object" || flowWon(puzzle, state))
      throw Error("Некорректное действие");
    if (action.type === "hint") {
      hints++;
      continue;
    }
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
  return {
    state,
    history,
    events,
    hints,
    undos,
    score,
    stars: score >= 960 ? 3 : score >= 800 ? 2 : 1,
    won: flowWon(puzzle, state),
    stuck: flowStuck(puzzle, state),
  };
}
