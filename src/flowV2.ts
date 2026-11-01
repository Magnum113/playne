/** Shared, deterministic rules. Visual timing never affects a move or score. */
export const FLOW_VERSION = 2;
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
    name: "Первый полёт",
    rows: [
      ".........",
      "...000...",
      "..00000..",
      ".0000000.",
      ".0000000.",
      "..11111..",
      "...111...",
      "....1....",
    ],
  },
  {
    name: "Клубничный рейс",
    rows: [
      "...000...",
      "..00000..",
      ".1111111.",
      "112111211",
      "111121111",
      ".1211121.",
      "..11111..",
      "...111...",
      "....1....",
    ],
  },
  {
    name: "Космический сад",
    rows: [
      "...222...",
      "..22222..",
      ".2233322.",
      "222333222",
      ".2233322.",
      "..22222..",
      "...000...",
      "...00000.",
      ".00000...",
    ],
  },
  {
    name: "Дом для облака",
    rows: [
      ".........",
      "....3....",
      "...333...",
      "..33333..",
      ".3333333.",
      "111111111",
      ".1444441.",
      ".1440441.",
      ".1110111.",
    ],
  },
  {
    name: "Кот на орбите",
    rows: [
      ".22...22.",
      ".222.222.",
      ".2222222.",
      ".2402042.",
      ".2221222.",
      "..22222..",
      "...000...",
      "..00000..",
      ".0000000.",
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
  },
  {
    name: "Кит и звёзды",
    rows: [
      "..4......",
      ".444.....",
      "44444..44",
      "444444444",
      "442444444",
      "444444444",
      ".0000000.",
      "..00000..",
      ".........",
    ],
  },
  {
    name: "Планета карамели",
    rows: [
      "...222...",
      "..22222..",
      ".2200022.",
      "332222333",
      "333333333",
      "333222233",
      ".2220022.",
      "..22222..",
      "...222...",
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
      ".........",
      "...333...",
      "...333...",
      "..33333..",
    ],
  },
  {
    name: "Кристальный остров",
    rows: [
      "....4....",
      "...444...",
      "..44244..",
      ".4442244.",
      "444222444",
      ".4422244.",
      "..42244..",
      "...444...",
      "....4....",
    ],
  },
  {
    name: "Бабочка",
    rows: [
      "22.....11",
      "222...111",
      "222202111",
      ".2220211.",
      "..22011..",
      ".4440333.",
      "444403333",
      "444...333",
      "44.....33",
    ],
  },
  {
    name: "Сердце команды",
    rows: [
      ".111.111.",
      "111111111",
      "112111211",
      "111222111",
      ".1122211.",
      "..11211..",
      "...111...",
      "....1....",
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
export function flowFrontier(puzzle: FlowPuzzle, cells: number[]) {
  const frontier: number[] = [];
  for (let x = 0; x < puzzle.width; x++)
    for (let y = puzzle.height - 1; y >= 0; y--) {
      const cell = y * puzzle.width + x;
      if (cells[cell] >= 0) {
        frontier.push(cell);
        break;
      }
    }
  return frontier;
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
      const cell = flowFrontier(puzzle, state.cells).find(
        (i) => state.cells[i] === team.color,
      );
      if (cell === undefined) continue;
      events.push({
        cell,
        packet: team.id,
        color: team.color,
        slot: state.active.indexOf(team),
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
): FlowPuzzle {
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
        ? (level + 3) % pictures.length
        : Math.floor(rng() * pictures.length)
    ];
  const sourceWidth = picture.rows[0].length;
  let source = picture.rows
    .join("")
    .split("")
    .map((v) => (v === "." ? -1 : Number(v)));
  // Start with a full five-colour puzzle. Each art pixel becomes four cubes,
  // so even the first board needs several launches and forward planning.
  source = source.map((c, i) =>
    c < 0
      ? -1
      : (c + Math.floor(Math.floor(i / sourceWidth) / (level < 13 ? 2 : 1))) %
        (level < 13 ? 5 : level < 25 ? 6 : 7),
  );
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
      level < 13 ? 10 + Math.floor(rng() * 7) : 7 + Math.floor(rng() * 7);
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
