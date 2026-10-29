import { LINE_STAGE_POOLS } from "./linePuzzles";

export type LinePuzzle = {
  id: string;
  rows: number;
  cols: number;
  numbers: Record<number, number>;
  walls?: [number, number][];
  parSeconds: number;
};

export type LinePathState = {
  valid: boolean;
  complete: boolean;
  nextCheckpoint: number;
  message?: string;
};

export type LineHint = {
  /** The repaired prefix already includes the revealed next cell. */
  path: number[];
  nextCell: number | null;
  retracted: number;
};

export const LINE_RULES_VERSION = 1;
export const LINE_ROUNDS = 5;
export const LINE_INTRO_PUZZLE: LinePuzzle = {
  id: "line-intro-v1",
  rows: 3,
  cols: 3,
  numbers: { 0: 1, 2: 2, 3: 3, 8: 4 },
  parSeconds: 30,
};
// This unranked worked example is shown in the rules, never in a game pack.
export const LINE_INTRO_PATH: readonly number[] = Object.freeze([
  0, 1, 2, 5, 4, 3, 6, 7, 8,
]);

type PreparedPuzzle = {
  size: number;
  checkpoint: number[];
  lastCheckpoint: number;
  start: number;
  end: number;
  neighbors: number[][];
  signature: string;
};

const edgeKey = (a: number, b: number) =>
  a < b ? `${a}:${b}` : `${b}:${a}`;

function preparePuzzle(puzzle: LinePuzzle): PreparedPuzzle | null {
  if (
    !puzzle ||
    !Number.isInteger(puzzle.rows) ||
    !Number.isInteger(puzzle.cols) ||
    puzzle.rows < 2 ||
    puzzle.cols < 2 ||
    puzzle.rows > 8 ||
    puzzle.cols > 8 ||
    puzzle.rows * puzzle.cols > 64 ||
    !puzzle.numbers ||
    typeof puzzle.numbers !== "object" ||
    Array.isArray(puzzle.numbers) ||
    !Number.isFinite(puzzle.parSeconds) ||
    puzzle.parSeconds <= 0
  )
    return null;

  const size = puzzle.rows * puzzle.cols;
  const entries = Object.entries(puzzle.numbers);
  if (entries.length < 2 || entries.length > size) return null;
  const checkpoint = Array<number>(size).fill(0);
  const numbered = new Set<number>();
  let start = -1,
    end = -1;
  for (const [key, value] of entries) {
    const cell = Number(key);
    if (
      !Number.isInteger(cell) ||
      String(cell) !== key ||
      cell < 0 ||
      cell >= size ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > entries.length ||
      numbered.has(value)
    )
      return null;
    checkpoint[cell] = value;
    numbered.add(value);
    if (value === 1) start = cell;
    if (value === entries.length) end = cell;
  }
  if (start < 0 || end < 0) return null;

  const adjacent = (a: number, b: number) =>
    Math.abs(Math.floor(a / puzzle.cols) - Math.floor(b / puzzle.cols)) +
      Math.abs((a % puzzle.cols) - (b % puzzle.cols)) ===
    1;
  if (puzzle.walls !== undefined && !Array.isArray(puzzle.walls)) return null;
  const walls = new Set<string>();
  for (const wall of puzzle.walls ?? []) {
    if (
      !Array.isArray(wall) ||
      wall.length !== 2 ||
      !wall.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < size) ||
      !adjacent(wall[0], wall[1])
    )
      return null;
    walls.add(edgeKey(wall[0], wall[1]));
  }
  const neighbors = Array.from({ length: size }, (_, cell) =>
    [cell - puzzle.cols, cell - 1, cell + 1, cell + puzzle.cols].filter(
      (next) =>
        next >= 0 &&
        next < size &&
        adjacent(cell, next) &&
        !walls.has(edgeKey(cell, next)),
    ),
  );
  return {
    size,
    checkpoint,
    lastCheckpoint: entries.length,
    start,
    end,
    neighbors,
    signature: `${puzzle.rows}x${puzzle.cols}|${checkpoint.join(",")}|${[...walls].sort().join(",")}`,
  };
}

export function linePathState(puzzle: LinePuzzle, input: unknown): LinePathState {
  const prepared = preparePuzzle(puzzle);
  let nextCheckpoint = 1;
  const invalid = (message: string): LinePathState => ({
    valid: false,
    complete: false,
    nextCheckpoint,
    message,
  });
  if (!prepared) return invalid("Некорректное поле.");
  if (!Array.isArray(input) || input.length > prepared.size)
    return invalid("Некорректный путь.");
  const seen = new Set<number>();
  for (let i = 0; i < input.length; i++) {
    const cell: unknown = input[i];
    if (
      typeof cell !== "number" ||
      !Number.isInteger(cell) ||
      cell < 0 ||
      cell >= prepared.size
    )
      return invalid("Линия вышла за поле.");
    if (seen.has(cell)) return invalid("В каждую клетку можно войти один раз.");
    if (i === 0 && cell !== prepared.start) return invalid("Начни с числа 1.");
    if (i > 0 && !prepared.neighbors[input[i - 1]].includes(cell))
      return invalid("Веди линию через соседние клетки, не пересекая стены.");
    const number = prepared.checkpoint[cell];
    if (number) {
      if (number !== nextCheckpoint) return invalid("Соединяй числа по порядку.");
      if (number === prepared.lastCheckpoint && i !== prepared.size - 1)
        return invalid("Последнее число должно завершать путь.");
      nextCheckpoint++;
    }
    seen.add(cell);
  }
  const complete =
    input.length === prepared.size &&
    nextCheckpoint === prepared.lastCheckpoint + 1 &&
    input[input.length - 1] === prepared.end;
  return { valid: true, complete, nextCheckpoint };
}

export function validateLineAnswer(puzzle: LinePuzzle, path: unknown): boolean {
  return linePathState(puzzle, path).complete;
}

/** Clicking a visited cell retracts to it; an invalid append leaves the path intact. */
export function updateLinePath(
  puzzle: LinePuzzle,
  path: readonly number[],
  cell: number,
): number[] {
  if (!linePathState(puzzle, path).valid) return [];
  const previous = path.indexOf(cell);
  if (previous >= 0) return path.slice(0, previous + 1);
  const next = [...path, cell];
  return linePathState(puzzle, next).valid ? next : [...path];
}

type SearchResult = { count: number; first: number[] | null; exhausted: boolean };
const solutionCache = new Map<string, number[]>();

/** Bounded search is used for hints and offline bank verification, never pack selection. */
function searchSolutions(
  prepared: PreparedPuzzle,
  limit: number,
  maxNodes = 2_000_000,
): SearchResult {
  const { size, checkpoint, lastCheckpoint, start, end, neighbors } = prepared;
  const visited = new Uint8Array(size);
  const path = [start];
  visited[start] = 1;
  let count = 0,
    nodes = 0,
    first: number[] | null = null,
    exhausted = false;

  function visit(cell: number, nextCheckpoint: number): void {
    if (count >= limit || exhausted) return;
    if (++nodes > maxNodes) {
      exhausted = true;
      return;
    }
    if (path.length === size) {
      if (cell === end && nextCheckpoint === lastCheckpoint + 1) {
        count++;
        first ??= [...path];
      }
      return;
    }

    // Every remaining internal vertex needs two residual edges. A dead leaf
    // cannot later be rescued because the path cannot revisit a cell.
    for (let vertex = 0; vertex < size; vertex++) {
      if (visited[vertex]) continue;
      let degree = 0;
      for (const next of neighbors[vertex])
        if (!visited[next] || next === cell) degree++;
      if (degree === 0 || (vertex !== end && degree < 2)) return;
    }

    // The remaining cells must stay connected after leaving the current tip.
    let firstUnvisited = -1;
    for (let vertex = 0; vertex < size; vertex++)
      if (!visited[vertex]) {
        firstUnvisited = vertex;
        break;
      }
    const reached = new Uint8Array(size);
    const queue = [firstUnvisited];
    reached[firstUnvisited] = 1;
    for (let i = 0; i < queue.length; i++)
      for (const next of neighbors[queue[i]])
        if (!visited[next] && !reached[next]) {
          reached[next] = 1;
          queue.push(next);
        }
    if (queue.length !== size - path.length) return;

    const options = neighbors[cell]
      .filter((next) => {
        if (visited[next]) return false;
        const number = checkpoint[next];
        return (
          (!number || number === nextCheckpoint) &&
          (next !== end || path.length === size - 1)
        );
      })
      .sort((a, b) => {
        const degree = (vertex: number) =>
          neighbors[vertex].filter((next) => !visited[next]).length;
        return degree(a) - degree(b) || a - b;
      });
    for (const next of options) {
      visited[next] = 1;
      path.push(next);
      visit(next, nextCheckpoint + (checkpoint[next] ? 1 : 0));
      path.pop();
      visited[next] = 0;
      if (count >= limit || exhausted) return;
    }
  }
  visit(start, 2);
  return { count, first, exhausted };
}

/** Returns a count, never a solution. Throws rather than claiming uniqueness on timeout. */
export function countLineSolutions(puzzle: LinePuzzle, limit = 2): number {
  const prepared = preparePuzzle(puzzle);
  if (!prepared) return 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Некорректный предел поиска.");
  const result = searchSolutions(prepared, limit);
  if (result.exhausted) throw new Error("Превышен предел проверки поля.");
  return result.count;
}

export function hintLinePath(puzzle: LinePuzzle, prefix: unknown): LineHint {
  const prepared = preparePuzzle(puzzle);
  if (!prepared) throw new Error("Некорректное поле.");
  let solution = solutionCache.get(prepared.signature);
  if (!solution) {
    const result = searchSolutions(prepared, 1);
    if (result.exhausted || !result.first)
      throw new Error("Не удалось найти подсказку для этого поля.");
    solution = result.first;
    if (solutionCache.size >= 256) solutionCache.clear();
    solutionCache.set(prepared.signature, solution);
  }
  const input = Array.isArray(prefix) ? prefix : [];
  let common = 0;
  while (
    common < input.length &&
    common < solution.length &&
    input[common] === solution[common]
  )
    common++;
  const nextCell = common < solution.length ? solution[common] : null;
  return {
    path: solution.slice(0, common + (nextCell === null ? 0 : 1)),
    nextCell,
    retracted: input.length - common,
  };
}

export function scoreLinePuzzle(
  elapsedMs: number,
  hints: number,
  par: number | Pick<LinePuzzle, "parSeconds"> = 60,
): number {
  const parSeconds = typeof par === "number" ? par : par?.parSeconds;
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    !Number.isSafeInteger(hints) ||
    hints < 0 ||
    !Number.isFinite(parSeconds) ||
    parSeconds <= 0
  )
    return 0;
  const ratio = elapsedMs / (parSeconds * 1000);
  const bonus = 20 * Math.max(0, Math.min(1, (4 - ratio) / 3));
  return Math.max(0, Math.min(100, Math.round(80 + bonus - 15 * hints)));
}

export function lineMoscowDate(now: Date | number = Date.now()): string {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Некорректная дата.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function clonePuzzle(puzzle: LinePuzzle): LinePuzzle {
  return {
    ...puzzle,
    numbers: { ...puzzle.numbers },
    ...(puzzle.walls ? { walls: puzzle.walls.map(([a, b]) => [a, b]) as [number, number][] } : {}),
  };
}

function seedRandom(seed: string | number): () => number {
  if (typeof seed !== "string" && (typeof seed !== "number" || !Number.isFinite(seed)))
    throw new RangeError("Некорректный seed.");
  let state = 2166136261;
  for (const char of String(seed).slice(0, 1024)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Selection only: the bank was generated and verified offline. */
export function getLinePuzzles(seed: string | number): LinePuzzle[] {
  const random = seedRandom(seed);
  return LINE_STAGE_POOLS.map((pool) => {
    if (pool.length === 0) throw new Error("Каталог полей пуст.");
    return clonePuzzle(pool[Math.floor(random() * pool.length)]);
  });
}

export function getDailyLinePuzzles(date = lineMoscowDate()): LinePuzzle[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new RangeError("Некорректная дата задания.");
  return getLinePuzzles(`line:v${LINE_RULES_VERSION}:daily:${date}`);
}

export function linePuzzleById(id: string): LinePuzzle | undefined {
  const puzzle = LINE_STAGE_POOLS.flat().find((entry) => entry.id === id);
  return puzzle ? clonePuzzle(puzzle) : undefined;
}
