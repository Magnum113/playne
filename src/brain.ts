import { SLIDE_STAGE_POOLS } from "./brainPuzzles";

export type BrainGame = "flash" | "rotate" | "slide" | "dispatch";
export type BrainDifficulty = 1 | 2 | 3;
export type BrainCell = [number, number];
type RoundBase = { id: string; stage: number };
export type FlashRound = RoundBase & {
  kind: "flash"; rows: number; cols: number; count: number; showMs: number; cells: number[];
};
export type PublicFlashRound = Omit<FlashRound, "cells"> & { cells?: number[] };
export type RotateRound = RoundBase & {
  kind: "rotate"; shapeA: BrainCell[]; shapeB: BrainCell[]; correctSame: boolean;
};
export type PublicRotateRound = Omit<RotateRound, "correctSame">;
export type SlideCar = { id: string; x: number; y: number; length: 2 | 3; axis: "x" | "y" };
export type SlideMove = { carId: string; delta: number };
export type SlidePuzzle = { id: string; cars: SlideCar[]; parMoves: number };
export type SlideRound = RoundBase & SlidePuzzle & { kind: "slide"; size: 6 };
export type DispatchAction = { atMs: number; switch: 0 | 1; position: 0 | 1 };
export type DispatchTrain = {
  id: string; destination: 0 | 1 | 2; spawnMs: number;
  switch0Ms: number; switch1Ms: number; arrivalMs: number;
};
export type DispatchRound = RoundBase & {
  kind: "dispatch"; durationMs: number; stations: (0 | 1 | 2)[];
  initialSwitches: [0 | 1, 0 | 1]; activeSwitches: (0 | 1)[]; trains: DispatchTrain[];
};
export type BrainRound = FlashRound | RotateRound | SlideRound | DispatchRound;
export type PublicBrainRound = PublicFlashRound | PublicRotateRound | SlideRound | DispatchRound;
export type BrainChallenge = {
  game: BrainGame; version: 1; day: string; difficulty: BrainDifficulty; rounds: BrainRound[];
};
export const BRAIN_RULES_VERSION = 1;
export const BRAIN_GAMES: readonly BrainGame[] = ["flash", "rotate", "slide", "dispatch"];
export const BRAIN_ROUNDS = 5;

export function brainMoscowDate(now: Date | number = Date.now()): string {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Некорректная дата.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

function randomFrom(seed: string | number) {
  if ((typeof seed !== "string" && typeof seed !== "number") || (typeof seed === "number" && !Number.isFinite(seed)))
    throw new RangeError("Некорректный seed.");
  let state = 2166136261;
  for (const ch of String(seed).slice(0, 1024)) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeShape(shape: readonly BrainCell[]): BrainCell[] {
  const minX = Math.min(...shape.map(([x]) => x)), minY = Math.min(...shape.map(([, y]) => y));
  return shape.map(([x, y]) => [x - minX, y - minY] as BrainCell).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
export function rotateShape(shape: readonly BrainCell[], turns = 0, mirror = false): BrainCell[] {
  const count = ((Math.trunc(turns) % 4) + 4) % 4;
  return normalizeShape(shape.map(([originalX, originalY]) => {
    let x = mirror ? -originalX : originalX, y = originalY;
    for (let i = 0; i < count; i++) [x, y] = [-y, x];
    return [x, y];
  }));
}
const shapeKey = (shape: readonly BrainCell[]) => JSON.stringify(normalizeShape(shape));
export function rotationAlignment(a: readonly BrainCell[], b: readonly BrainCell[]): { turns: number; mirrored: boolean } | null {
  const target = shapeKey(b);
  for (const mirrored of [false, true]) for (let turns = 0; turns < 4; turns++)
    if (shapeKey(rotateShape(a, turns, mirrored)) === target) return { turns, mirrored };
  return null;
}
function makeShape(count: number, random: () => number): BrainCell[] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const cells: BrainCell[] = [[0, 0]], occupied = new Set(["0,0"]);
    while (cells.length < count) {
      const [x, y] = cells[Math.floor(random() * cells.length)];
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(random() * 4)];
      const key = `${x + dx},${y + dy}`;
      if (!occupied.has(key)) { occupied.add(key); cells.push([x + dx, y + dy]); }
    }
    const shape = normalizeShape(cells), key = shapeKey(shape);
    if ([1, 2, 3].some((turn) => shapeKey(rotateShape(shape, turn)) === key)) continue;
    if ([0, 1, 2, 3].some((turn) => shapeKey(rotateShape(shape, turn, true)) === key)) continue;
    return shape;
  }
  throw new Error("Не удалось подготовить фигуру.");
}

function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
}

/** Stages are shared by daily and practice; difficulty only shifts the practice ladder. */
export function makeBrainChallenge(
  game: BrainGame, seed: string | number, difficulty: BrainDifficulty = 1, day = brainMoscowDate(),
): BrainChallenge {
  if (!BRAIN_GAMES.includes(game) || ![1, 2, 3].includes(difficulty) || !validDay(day) ||
    (typeof seed !== "string" && typeof seed !== "number") || (typeof seed === "number" && !Number.isFinite(seed)))
    throw new RangeError("Некорректные параметры игры.");
  const random = randomFrom(`${game}:v1:${seed}:difficulty:${difficulty}`);
  const sameValues = shuffled([true, true, false, false, random() < .5], random);
  const rounds: BrainRound[] = [];
  for (let index = 0; index < 5; index++) {
    const stage = index + 1 + (difficulty - 1) * 2;
    // IDs are scoped to a server party. Do not expose its private RNG seed:
    // Flash cells must remain unavailable until the reveal starts.
    const id = `${game}-v1-${stage}`;
    if (game === "flash") {
      const size = stage <= 2 ? 3 : stage <= 5 ? 4 : 5, count = Math.min(9, stage + 2);
      rounds.push({ kind: game, id, stage, rows: size, cols: size, count,
        showMs: Math.max(2400, 3500 - (stage - 1) * 135),
        cells: shuffled(Array.from({length: size * size}, (_, cell) => cell), random).slice(0, count).sort((a, b) => a - b) });
    } else if (game === "rotate") {
      const shape = makeShape(Math.min(11, stage + 4), random), turnA = Math.floor(random() * 4);
      rounds.push({ kind: game, id, stage, shapeA: rotateShape(shape, turnA),
        shapeB: rotateShape(shape, (turnA + 1 + Math.floor(random() * 3)) % 4, !sameValues[index]), correctSame: sameValues[index] });
    } else if (game === "slide") {
      const pool = SLIDE_STAGE_POOLS[stage - 1];
      if (!pool?.length) throw new Error("Каталог парковок пуст.");
      const puzzle = pool[Math.floor(random() * pool.length)];
      rounds.push({ kind: game, id: puzzle.id, stage, size: 6, parMoves: puzzle.parMoves, cars: puzzle.cars.map((car) => ({...car})) });
    } else {
      const durationMs = 14000 + stage * 1100, count = stage + 3;
      const stations: (0 | 1 | 2)[] = stage === 1 ? [0, 1] : [0, 1, 2];
      const destinations = shuffled(Array.from({length: count}, (_, i) => stations[i % stations.length]), random);
      const spawnSpan = durationMs - 6000;
      const trains = destinations.map((destination, i): DispatchTrain => {
        const spawnMs = Math.round(i * spawnSpan / (count - 1));
        return { id: `${id}-train-${i}`, destination, spawnMs, switch0Ms: spawnMs + 1700,
          switch1Ms: spawnMs + 3300, arrivalMs: spawnMs + 5700 };
      });
      rounds.push({ kind: game, id, stage, durationMs, stations, initialSwitches: [0, 0],
        activeSwitches: stage === 1 ? [1] : [0, 1], trains });
    }
  }
  return { game, version: 1, day, difficulty, rounds };
}

export function publicBrainRound(round: BrainRound, revealFlash = false): PublicBrainRound {
  const copy = structuredClone(round);
  if (copy.kind === "flash" && !revealFlash) {
    const { cells: _privateCells, ...publicRound } = copy;
    return publicRound;
  }
  if (copy.kind === "rotate") {
    const { correctSame: _privateAnswer, ...publicRound } = copy;
    return publicRound;
  }
  return copy;
}

function validCars(cars: unknown): cars is SlideCar[] {
  if (!Array.isArray(cars) || cars.length < 2 || cars.length > 12) return false;
  const occupied = new Set<number>(), ids = new Set<string>();
  let hasTarget = false;
  for (const car of cars) {
    if (!car || typeof car.id !== "string" || !/^[A-Za-z0-9_-]{1,12}$/.test(car.id) || ids.has(car.id) ||
      !["x", "y"].includes(car.axis) || ![2, 3].includes(car.length) ||
      !Number.isInteger(car.x) || !Number.isInteger(car.y) || car.x < 0 || car.y < 0 ||
      car.x + (car.axis === "x" ? car.length : 1) > 6 || car.y + (car.axis === "y" ? car.length : 1) > 6) return false;
    if (car.id === "R") { if (car.axis !== "x" || car.y !== 2 || car.length !== 2) return false; hasTarget = true; }
    ids.add(car.id);
    for (let i = 0; i < car.length; i++) {
      const cell = (car.y + (car.axis === "y" ? i : 0)) * 6 + car.x + (car.axis === "x" ? i : 0);
      if (occupied.has(cell)) return false;
      occupied.add(cell);
    }
  }
  return hasTarget;
}
export const slideSolved = (cars: readonly SlideCar[]) => cars.some((car) => car.id === "R" && car.axis === "x" && car.y === 2 && car.x + car.length === 6);

export function applySlideMove(cars: readonly SlideCar[], move: SlideMove): SlideCar[] | null {
  if (!validCars(cars) || !move || typeof move.carId !== "string" || !Number.isInteger(move.delta) || !move.delta || Math.abs(move.delta) > 5) return null;
  const index = cars.findIndex((car) => car.id === move.carId);
  if (index < 0) return null;
  const next = cars.map((car) => ({...car})), car = next[index], direction = Math.sign(move.delta);
  for (let i = 0; i < Math.abs(move.delta); i++) {
    car[car.axis] += direction;
    if (!validCars(next)) return null;
  }
  return next;
}
export function replaySlideMoves(round: Pick<SlideRound, "cars">, moves: unknown): {
  valid: boolean; solved: boolean; cars: SlideCar[]; moves: number; error?: string;
} {
  const invalid = (error: string, cars: SlideCar[] = [], count = 0) => ({valid: false, solved: false, cars, moves: count, error});
  if (!validCars(round?.cars) || !Array.isArray(moves) || moves.length > 2000) return invalid("Некорректный маршрут машин.");
  let cars = round.cars.map((car) => ({...car}));
  for (let i = 0; i < moves.length; i++) {
    const next = applySlideMove(cars, moves[i]);
    if (!next) return invalid("Машина не может выполнить этот ход.", cars, i);
    cars = next;
  }
  return { valid: true, solved: slideSolved(cars), cars, moves: moves.length };
}

const slideCache = new Map<string, SlideMove[]>();
function shortestSlideMoves(cars: SlideCar[], maxStates = 180_000): SlideMove[] | null {
  if (!validCars(cars)) return null;
  if (slideSolved(cars)) return [];
  const signature = JSON.stringify(cars), cached = slideCache.get(signature);
  if (cached) return cached.map((move) => ({...move}));
  const factors = cars.map((_, index) => 6 ** index);
  const encode = (positions: number[]) => positions.reduce((sum, pos, i) => sum + pos * factors[i], 0);
  const decode = (code: number) => cars.map((_, i) => Math.floor(code / factors[i]) % 6);
  const start = encode(cars.map((car) => car[car.axis]));
  const codes = [start], parents = [-1], moveCars = [-1], moveDeltas = [0];
  const seen = new Map([[start, 0]]), target = cars.findIndex((car) => car.id === "R");
  function finish(index: number): SlideMove[] {
    const path: SlideMove[] = [];
    while (parents[index] >= 0) {
      path.push({ carId: cars[moveCars[index]].id, delta: moveDeltas[index] }); index = parents[index];
    }
    path.reverse();
    if (slideCache.size >= 256) slideCache.clear();
    slideCache.set(signature, path);
    return path.map((move) => ({...move}));
  }
  for (let head = 0; head < codes.length; head++) {
    const positions = decode(codes[head]), occupied = new Int8Array(36).fill(-1);
    for (let i = 0; i < cars.length; i++) for (let k = 0; k < cars[i].length; k++) {
      const car = cars[i], x = car.axis === "x" ? positions[i] + k : car.x, y = car.axis === "y" ? positions[i] + k : car.y;
      occupied[y * 6 + x] = i;
    }
    for (let i = 0; i < cars.length; i++) for (const direction of [-1, 1]) {
      const car = cars[i];
      for (let delta = direction; Math.abs(delta) <= 5; delta += direction) {
        const position = positions[i] + delta;
        if (position < 0 || position + car.length > 6) break;
        const leading = direction < 0 ? position : position + car.length - 1;
        const cell = car.axis === "x" ? car.y * 6 + leading : leading * 6 + car.x;
        if (occupied[cell] >= 0 && occupied[cell] !== i) break;
        const code = codes[head] + delta * factors[i];
        if (seen.has(code)) continue;
        if (codes.length >= maxStates) throw new Error("Поиск подсказки превысил допустимый объём.");
        const index = codes.length;
        seen.set(code, index); codes.push(code); parents.push(head); moveCars.push(i); moveDeltas.push(delta);
        if (i === target && position + car.length === 6) return finish(index);
      }
    }
  }
  return null;
}
export function slideHint(round: Pick<SlideRound, "cars">, moves: unknown): { move: SlideMove | null; remainingMoves: number } {
  const state = replaySlideMoves(round, moves);
  if (!state.valid) throw new Error(state.error);
  const path = shortestSlideMoves(state.cars);
  if (!path) throw new Error("Для этой парковки не найден выход.");
  return { move: path[0] ?? null, remainingMoves: path.length };
}

export function validDispatchActions(wave: DispatchRound, actions: unknown): actions is DispatchAction[] {
  if (!Array.isArray(actions) || actions.length > 2000) return false;
  let previous = -1;
  for (const action of actions) {
    if (!action || !Number.isFinite(action.atMs) || action.atMs < 0 || action.atMs > wave.durationMs || action.atMs < previous ||
      ![0, 1].includes(action.switch) || ![0, 1].includes(action.position) || !wave.activeSwitches.includes(action.switch)) return false;
    previous = action.atMs;
  }
  return true;
}
function switchesAt(wave: DispatchRound, actions: readonly DispatchAction[], at: number): [0 | 1, 0 | 1] {
  const positions: [0 | 1, 0 | 1] = [...wave.initialSwitches];
  for (const action of actions) { if (action.atMs > at) break; positions[action.switch] = action.position; }
  return positions;
}
function along(points: BrainCell[], fraction: number): { x: number; y: number } {
  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let distance = Math.max(0, Math.min(1, fraction)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? distance / lengths[i] : 0;
      return { x: points[i][0] + (points[i + 1][0] - points[i][0]) * f,
        y: points[i][1] + (points[i + 1][1] - points[i][1]) * f };
    }
    distance -= lengths[i];
  }
  return { x: points[0][0], y: points[0][1] };
}
export function dispatchSnapshot(wave: DispatchRound, actions: DispatchAction[], elapsedMs: number) {
  if (!validDispatchActions(wave, actions) || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Некорректные переключения.");
  const elapsed = Math.min(elapsedMs, wave.durationMs);
  const trains = wave.trains.filter((train) => train.spawnMs <= elapsed).map((train) => {
    const lower = elapsed >= train.switch0Ms && switchesAt(wave, actions, train.switch0Ms)[0] === 1;
    const station: 0 | 1 | 2 | null = lower ? 2 : elapsed >= train.switch1Ms ? switchesAt(wave, actions, train.switch1Ms)[1] : null;
    let point: { x: number; y: number };
    if (elapsed < train.switch0Ms) point = along([[20, 180], [180, 180]], (elapsed - train.spawnMs) / (train.switch0Ms - train.spawnMs));
    else if (lower) point = along([[180, 180], [180, 300], [600, 300]], (elapsed - train.switch0Ms) / (train.arrivalMs - train.switch0Ms));
    else if (elapsed < train.switch1Ms) point = along([[180, 180], [380, 180]], (elapsed - train.switch0Ms) / (train.switch1Ms - train.switch0Ms));
    else point = station === 0 ? along([[380, 180], [380, 60], [600, 60]], (elapsed - train.switch1Ms) / (train.arrivalMs - train.switch1Ms)) :
      along([[380, 180], [600, 180]], (elapsed - train.switch1Ms) / (train.arrivalMs - train.switch1Ms));
    const arrived = elapsed >= train.arrivalMs;
    return { id: train.id, destination: train.destination, ...point, station, arrived, correct: arrived ? station === train.destination : null };
  });
  return { switches: switchesAt(wave, actions, elapsed), trains,
    correct: trains.filter((train) => train.correct === true).length, arrived: trains.filter((train) => train.arrived).length };
}

export function validateBrainAnswer(round: BrainRound, answer: unknown): boolean {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
  const a = answer as Record<string, unknown>;
  if (round.kind === "flash") return Array.isArray(a.cells) && a.cells.length === round.count && new Set(a.cells).size === round.count &&
    a.cells.every((cell) => typeof cell === "number" && Number.isInteger(cell) && cell >= 0 && cell < round.rows * round.cols);
  if (round.kind === "rotate") return typeof a.same === "boolean";
  if (round.kind === "slide") { const result = replaySlideMoves(round, a.moves); return result.valid && result.solved; }
  return validDispatchActions(round, a.actions);
}
export function scoreBrainRound(round: BrainRound, answer: unknown, options: { hints?: number } = {}): number {
  if (!validateBrainAnswer(round, answer)) throw new Error("Некорректный ответ.");
  const a = answer as { cells: number[]; same: boolean; moves: SlideMove[]; actions: DispatchAction[] };
  if (round.kind === "flash") return Math.floor(100 * a.cells.filter((cell) => round.cells.includes(cell)).length / round.count);
  if (round.kind === "rotate") return a.same === round.correctSame ? 100 : 0;
  if (round.kind === "slide") {
    const hints = options.hints ?? 0;
    if (!Number.isSafeInteger(hints) || hints < 0) throw new Error("Некорректное число подсказок.");
    return Math.max(0, Math.min(100, 70 + Math.floor(30 * round.parMoves / Math.max(1, a.moves.length))) - 15 * hints);
  }
  return Math.floor(100 * dispatchSnapshot(round, a.actions, round.durationMs).correct / round.trains.length);
}
