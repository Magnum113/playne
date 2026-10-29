import { describe, expect, it } from "vitest";
import {
  LINE_INTRO_PATH,
  LINE_INTRO_PUZZLE,
  LINE_ROUNDS,
  countLineSolutions,
  getDailyLinePuzzles,
  getLinePuzzles,
  hintLinePath,
  lineMoscowDate,
  linePathState,
  linePuzzleById,
  scoreLinePuzzle,
  updateLinePath,
  validateLineAnswer,
  type LinePuzzle,
} from "../src/line";
import { LINE_STAGE_POOLS } from "../src/linePuzzles";

const clone = (puzzle: LinePuzzle): LinePuzzle => JSON.parse(JSON.stringify(puzzle));
const adjacent = (a: number, b: number, cols: number) =>
  Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) +
    Math.abs((a % cols) - (b % cols)) ===
  1;

function solveByHints(puzzle: LinePuzzle): number[] {
  let path: number[] = [];
  for (let i = 0; i < puzzle.rows * puzzle.cols; i++) {
    const hint = hintLinePath(puzzle, path);
    expect(hint.path).toHaveLength(i + 1);
    expect(hint.nextCell).toBe(hint.path.at(-1));
    expect(hint.retracted).toBe(0);
    expect(linePathState(puzzle, hint.path).valid).toBe(true);
    path = hint.path;
  }
  return path;
}

describe("one-line path rules", () => {
  it("accepts the complete worked example and every unfinished prefix", () => {
    expect(validateLineAnswer(LINE_INTRO_PUZZLE, LINE_INTRO_PATH)).toBe(true);
    expect(linePathState(LINE_INTRO_PUZZLE, LINE_INTRO_PATH)).toEqual({
      valid: true,
      complete: true,
      nextCheckpoint: 5,
    });
    for (let length = 0; length < LINE_INTRO_PATH.length; length++) {
      const prefix = LINE_INTRO_PATH.slice(0, length);
      expect(linePathState(LINE_INTRO_PUZZLE, prefix).valid).toBe(true);
      expect(validateLineAnswer(LINE_INTRO_PUZZLE, prefix)).toBe(false);
    }
  });

  it("rejects invalid values, repeated cells, jumps, diagonals and wrapping across rows", () => {
    for (const path of [
      null,
      {},
      "012543678",
      new Uint8Array(LINE_INTRO_PATH),
      [NaN],
      [Infinity],
      [-1],
      [9],
      [0.5],
      ["0"],
      [0, undefined],
      [0, 1, 0],
      [0, 4],
      [0, 2],
      [0, 1, 2, 3],
      [...LINE_INTRO_PATH, 8],
    ]) {
      expect(linePathState(LINE_INTRO_PUZZLE, path).valid).toBe(false);
      expect(validateLineAnswer(LINE_INTRO_PUZZLE, path)).toBe(false);
    }
  });

  it("requires start1, checkpoint order, all cells and the final checkpoint at the end", () => {
    expect(linePathState(LINE_INTRO_PUZZLE, [1]).valid).toBe(false);
    expect(linePathState(LINE_INTRO_PUZZLE, [0, 3]).valid).toBe(false);
    const endpointsOnly = { ...clone(LINE_INTRO_PUZZLE), numbers: { 0: 1, 8: 2 } };
    expect(linePathState(endpointsOnly, [0, 1, 2, 5, 8]).valid).toBe(false);
    expect(validateLineAnswer(endpointsOnly, LINE_INTRO_PATH)).toBe(true);
  });

  it("treats walls as undirected blocked edges", () => {
    for (const wall of [[1, 2], [2, 1]] as [number, number][]) {
      const puzzle = { ...clone(LINE_INTRO_PUZZLE), walls: [wall] };
      expect(linePathState(puzzle, [0, 1]).valid).toBe(true);
      expect(linePathState(puzzle, [0, 1, 2]).valid).toBe(false);
      expect(validateLineAnswer(puzzle, LINE_INTRO_PATH)).toBe(false);
    }
  });

  it("rejects malformed puzzle geometry and checkpoint maps without throwing", () => {
    const invalid: LinePuzzle[] = [
      { ...clone(LINE_INTRO_PUZZLE), rows: 0 },
      { ...clone(LINE_INTRO_PUZZLE), cols: 2.5 },
      { ...clone(LINE_INTRO_PUZZLE), rows: 1000 },
      { ...clone(LINE_INTRO_PUZZLE), parSeconds: NaN },
      { ...clone(LINE_INTRO_PUZZLE), numbers: { 0: 1, 8: 3 } },
      { ...clone(LINE_INTRO_PUZZLE), numbers: { 0: 1, 2: 1, 8: 3 } },
      { ...clone(LINE_INTRO_PUZZLE), numbers: { 0: 1, 9: 2 } },
      { ...clone(LINE_INTRO_PUZZLE), numbers: { 0: 1, NaN: 2 } },
      { ...clone(LINE_INTRO_PUZZLE), numbers: { 0: 1, 8: 2.5 } },
    ];
    for (const wall of [[0, 2], [0, 0], [-1, 0], [0, NaN], [0, 1, 2]])
      invalid.push({ ...clone(LINE_INTRO_PUZZLE), walls: [wall] as [number, number][] });
    for (const puzzle of invalid) {
      expect(linePathState(puzzle, []).valid).toBe(false);
      expect(countLineSolutions(puzzle)).toBe(0);
    }
  });

  it("appends adjacent cells and retracts to any visited cell without mutation", () => {
    expect(updateLinePath(LINE_INTRO_PUZZLE, [], 1)).toEqual([]);
    expect(updateLinePath(LINE_INTRO_PUZZLE, [], 0)).toEqual([0]);
    const path = [0, 1, 2, 5];
    expect(updateLinePath(LINE_INTRO_PUZZLE, path, 4)).toEqual([0, 1, 2, 5, 4]);
    expect(updateLinePath(LINE_INTRO_PUZZLE, path, 1)).toEqual([0, 1]);
    expect(updateLinePath(LINE_INTRO_PUZZLE, path, 5)).toEqual(path);
    expect(updateLinePath(LINE_INTRO_PUZZLE, path, 3)).toEqual(path);
    expect(updateLinePath(LINE_INTRO_PUZZLE, path, NaN)).toEqual(path);
    expect(path).toEqual([0, 1, 2, 5]);
  });
});

describe("one-line hints", () => {
  it("repairs a wrong branch before revealing the next cell", () => {
    const wrong = [0, 1, 4];
    expect(linePathState(LINE_INTRO_PUZZLE, wrong).valid).toBe(true);
    expect(hintLinePath(LINE_INTRO_PUZZLE, wrong)).toEqual({
      path: [0, 1, 2], nextCell: 2, retracted: 1,
    });
    expect(wrong).toEqual([0, 1, 4]);
    expect(hintLinePath(LINE_INTRO_PUZZLE, [NaN, -1])).toEqual({
      path: [0], nextCell: 0, retracted: 2,
    });
    expect(hintLinePath(LINE_INTRO_PUZZLE, null)).toEqual({
      path: [0], nextCell: 0, retracted: 0,
    });
  });

  it("leaves a completed path alone and returns independent arrays", () => {
    const hint = hintLinePath(LINE_INTRO_PUZZLE, LINE_INTRO_PATH);
    expect(hint).toEqual({ path: [...LINE_INTRO_PATH], nextCell: null, retracted: 0 });
    hint.path[0] = 99;
    expect(hintLinePath(LINE_INTRO_PUZZLE, []).path).toEqual([0]);
  });

  it("does not reuse a cached solution for changed clues or walls with the same id", () => {
    hintLinePath(LINE_INTRO_PUZZLE, []);
    const impossible = { ...clone(LINE_INTRO_PUZZLE), walls: [[0, 1], [0, 3]] as [number, number][] };
    expect(countLineSolutions(impossible)).toBe(0);
    expect(() => hintLinePath(impossible, [])).toThrow();
  });
});

describe("one-line scoring", () => {
  it("keeps the full speed bonus through par, then reduces it to zero at four pars", () => {
    expect(scoreLinePuzzle(0, 0, 60)).toBe(100);
    expect(scoreLinePuzzle(60_000, 0, 60)).toBe(100);
    expect(scoreLinePuzzle(150_000, 0, { parSeconds: 60 })).toBe(90);
    expect(scoreLinePuzzle(240_000, 0, 60)).toBe(80);
    expect(scoreLinePuzzle(9_000_000, 0, 60)).toBe(80);
    expect(scoreLinePuzzle(0, 1, 60)).toBe(85);
    expect(scoreLinePuzzle(240_000, 1, 60)).toBe(65);
    expect(scoreLinePuzzle(0, 7, 60)).toBe(0);
  });

  it("rejects invalid timing/hints and never increases with extra time or hints", () => {
    for (const elapsed of [-1, NaN, Infinity]) expect(scoreLinePuzzle(elapsed, 0)).toBe(0);
    for (const hints of [-1, .5, NaN, Infinity, Number.MAX_VALUE])
      expect(scoreLinePuzzle(100, hints)).toBe(0);
    for (const par of [0, -1, NaN, Infinity]) expect(scoreLinePuzzle(100, 0, par)).toBe(0);
    let last = 100;
    for (let elapsed = 0; elapsed <= 300_000; elapsed += 500) {
      const score = scoreLinePuzzle(elapsed, 0, 60);
      expect(score).toBeLessThanOrEqual(last);
      expect(Number.isInteger(score)).toBe(true);
      last = score;
    }
    for (let hints = 1; hints < 10; hints++)
      expect(scoreLinePuzzle(90_000, hints)).toBeLessThanOrEqual(scoreLinePuzzle(90_000, hints - 1));
  });
});

describe("one-line daily and practice packs", () => {
  it("uses the Moscow day boundary and validates calendar dates", () => {
    expect(lineMoscowDate(new Date("2026-10-28T20:59:59.999Z"))).toBe("2026-10-28");
    expect(lineMoscowDate(Date.parse("2026-10-28T21:00:00.000Z"))).toBe("2026-10-29");
    expect(lineMoscowDate(Date.parse("2026-12-31T21:00:00.000Z"))).toBe("2027-01-01");
    expect(() => lineMoscowDate(NaN)).toThrow();
    for (const day of ["", "2026-2-03", "2026-02-30", "2026-13-01", "not-a-date"])
      expect(() => getDailyLinePuzzles(day)).toThrow();
    expect(getDailyLinePuzzles("2028-02-29")).toHaveLength(5);
  });

  it("reproduces seeds, changes practice packs, and keeps the same five-stage structure", () => {
    const daily = getDailyLinePuzzles("2026-10-29");
    expect(daily).toEqual(getDailyLinePuzzles("2026-10-29"));
    expect(daily).toEqual(getLinePuzzles("line:v1:daily:2026-10-29"));
    expect(daily).not.toEqual(getDailyLinePuzzles("2026-10-30"));
    expect(getLinePuzzles(123)).toEqual(getLinePuzzles(123));
    const seen = new Set<string>();
    const perStage = Array.from({length: 5}, () => new Set<string>());
    for (let seed = 0; seed < 100; seed++) {
      const pack = getLinePuzzles(`practice:${seed}`);
      expect(pack).toHaveLength(LINE_ROUNDS);
      expect(pack.map((puzzle) => puzzle.rows)).toEqual([4, 5, 5, 6, 6]);
      expect(pack.map((puzzle) => puzzle.parSeconds)).toEqual([40, 60, 75, 95, 115]);
      expect(new Set(pack.map((puzzle) => puzzle.id)).size).toBe(5);
      seen.add(pack.map((puzzle) => puzzle.id).join(","));
      pack.forEach((puzzle, index) => perStage[index].add(puzzle.id));
      expect(Object.keys(pack[0]).sort()).toEqual(
        (pack[0].walls ? ["id", "rows", "cols", "numbers", "walls", "parSeconds"] : ["id", "rows", "cols", "numbers", "parSeconds"]).sort(),
      );
    }
    expect(seen.size).toBeGreaterThan(90);
    perStage.forEach((pool) => expect(pool.size).toBeGreaterThanOrEqual(12));
  });

  it("returns copies that cannot change the bank or later selections", () => {
    const pack = getLinePuzzles("copy-test");
    const original = clone(pack[0]);
    pack[0].numbers[0] = 999;
    pack[0].walls?.push([0, 1]);
    pack.pop();
    expect(getLinePuzzles("copy-test")[0]).toEqual(original);
    expect(linePuzzleById(original.id)).toEqual(original);
    expect(linePuzzleById("unknown")).toBeUndefined();
  });
});

describe("verified one-line puzzle bank", () => {
  it("contains eighty varied, unique-solution puzzles with genuine choice points", () => {
    const puzzles = LINE_STAGE_POOLS.flat();
    expect(LINE_STAGE_POOLS.map((pool) => pool.length)).toEqual([16, 16, 16, 16, 16]);
    expect(puzzles).toHaveLength(80);
    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(80);
    const paths = new Set<string>();
    for (const puzzle of puzzles) {
      expect(countLineSolutions(puzzle, 2)).toBe(1);
      const path = solveByHints(puzzle);
      expect(validateLineAnswer(puzzle, path)).toBe(true);
      expect(Object.values(puzzle.numbers).sort((a, b) => a - b)).toEqual(
        Array.from({length: Object.keys(puzzle.numbers).length}, (_, index) => index + 1),
      );
      let choices = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const prefix = path.slice(0, i + 1);
        const options = Array.from({length: path.length}, (_, cell) => cell).filter((cell) =>
          !prefix.includes(cell) && adjacent(path[i], cell, puzzle.cols) && linePathState(puzzle, [...prefix, cell]).valid,
        );
        if (options.length > 1) choices++;
      }
      expect(choices).toBeGreaterThanOrEqual(3);
      const symmetries: string[] = [];
      for (const reflect of [false, true]) for (let rotation = 0; rotation < 4; rotation++) {
        const transformed = path.map((cell) => {
          let row = Math.floor(cell / puzzle.cols), col = cell % puzzle.cols;
          if (reflect) col = puzzle.cols - 1 - col;
          for (let turn = 0; turn < rotation; turn++) [row, col] = [col, puzzle.rows - row - 1];
          return row * puzzle.cols + col;
        });
        symmetries.push(transformed.join(","), transformed.reverse().join(","));
      }
      const canonical = `${puzzle.rows}:${symmetries.sort()[0]}`;
      expect(paths.has(canonical)).toBe(false);
      paths.add(canonical);
    }
    expect(puzzles.some((puzzle) => !puzzle.walls?.length)).toBe(true);
    expect(puzzles.some((puzzle) => (puzzle.walls?.length ?? 0) >= 3)).toBe(true);
  });

  it("matches an independent exhaustive 3x3 solver, including impossible and ambiguous boards", () => {
    function bruteForce(puzzle: LinePuzzle): number {
      const path: number[] = [];
      const size = puzzle.rows * puzzle.cols;
      const checkpoints = Object.values(puzzle.numbers).length;
      const start = Number(Object.keys(puzzle.numbers).find((cell) => puzzle.numbers[Number(cell)] === 1));
      let count = 0;
      function walk(cell: number, nextNumber: number) {
        if (count >= 2 || path.includes(cell)) return;
        const value = puzzle.numbers[cell];
        if (value && value !== nextNumber) return;
        if (value === checkpoints && path.length !== size - 1) return;
        path.push(cell);
        if (path.length === size) count++;
        else for (let next = 0; next < size; next++)
          if (adjacent(cell, next, puzzle.cols)) walk(next, nextNumber + (value ? 1 : 0));
        path.pop();
      }
      walk(start, 1);
      return count;
    }
    let ambiguous = 0, impossible = 0;
    for (let start = 0; start < 9; start++) for (let end = 0; end < 9; end++) {
      if (start === end) continue;
      for (const middle of [null, ...Array.from({length: 9}, (_, cell) => cell).filter((cell) => cell !== start && cell !== end).slice(0, 2)]) {
        const puzzle: LinePuzzle = {
          id: "brute-check", rows: 3, cols: 3, parSeconds: 30,
          numbers: middle === null ? {[start]: 1, [end]: 2} : {[start]: 1, [middle]: 2, [end]: 3},
        };
        const expected = bruteForce(puzzle);
        expect(countLineSolutions(puzzle)).toBe(expected);
        if (expected === 0) impossible++;
        if (expected === 2) ambiguous++;
      }
    }
    expect(ambiguous).toBeGreaterThan(0);
    expect(impossible).toBeGreaterThan(0);
  });
});
