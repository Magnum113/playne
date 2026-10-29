import { describe, expect, it } from "vitest";
import {
  BRAIN_GAMES, applySlideMove, brainMoscowDate, dispatchSnapshot, makeBrainChallenge,
  normalizeShape, publicBrainRound, replaySlideMoves, rotateShape, rotationAlignment,
  scoreBrainRound, slideHint, slideSolved, validDispatchActions, validateBrainAnswer,
  type BrainCell, type DispatchAction, type DispatchRound, type FlashRound,
  type RotateRound, type SlideMove, type SlideRound,
} from "../src/brain";
import { SLIDE_STAGE_POOLS } from "../src/brainPuzzles";

const DAY = "2026-10-29";
const key = (shape: readonly BrainCell[]) => JSON.stringify(normalizeShape(shape));
const simpleSlide: SlideRound = {
  kind: "slide", id: "test-parking", stage: 1, size: 6, parMoves: 2,
  cars: [
    {id: "R", x: 0, y: 2, axis: "x", length: 2},
    {id: "A", x: 2, y: 1, axis: "y", length: 2},
  ],
};
const singleTrain: DispatchRound = {
  kind: "dispatch", id: "test-wave", stage: 2, durationMs: 10000, stations: [0, 1, 2],
  activeSwitches: [0, 1], initialSwitches: [0, 0],
  trains: [{id: "t0", destination: 2, spawnMs: 0, switch0Ms: 2000, switch1Ms: 4000, arrivalMs: 8000}],
};

function correctDispatchActions(round: DispatchRound): DispatchAction[] {
  return round.trains.flatMap((train): DispatchAction[] => [
    ...(round.activeSwitches.includes(0) ? [{atMs: train.switch0Ms - 1, switch: 0 as const, position: (train.destination === 2 ? 1 : 0) as 0 | 1}] : []),
    ...(train.destination !== 2 ? [{atMs: train.switch1Ms - 1, switch: 1 as const, position: train.destination as 0 | 1}] : []),
  ]).sort((a, b) => a.atMs - b.atMs);
}

describe("brain challenge structure and privacy", () => {
  it("reproduces seeds and shares the five-stage difficulty ladder for all games", () => {
    for (const game of BRAIN_GAMES) for (const difficulty of [1, 2, 3] as const) {
      const challenge = makeBrainChallenge(game, "same-seed", difficulty, DAY);
      expect(challenge).toEqual(makeBrainChallenge(game, "same-seed", difficulty, DAY));
      expect(challenge.rounds).toHaveLength(5);
      expect(challenge.rounds.map((round) => round.stage)).toEqual(
        Array.from({length: 5}, (_, index) => index + 1 + (difficulty - 1) * 2),
      );
      expect(new Set(challenge.rounds.map((round) => round.id)).size).toBe(5);
      expect(challenge.version).toBe(1);
      expect(challenge.day).toBe(DAY);
      expect(challenge.difficulty).toBe(difficulty);
    }
  });

  it("uses the Moscow day boundary and rejects invalid challenge parameters", () => {
    expect(brainMoscowDate(Date.parse("2026-10-28T20:59:59.999Z"))).toBe("2026-10-28");
    expect(brainMoscowDate(new Date("2026-10-28T21:00:00Z"))).toBe(DAY);
    expect(() => brainMoscowDate(NaN)).toThrow();
    expect(() => makeBrainChallenge("flash", NaN)).toThrow();
    expect(() => makeBrainChallenge("flash", "seed", 4 as 1)).toThrow();
    for (const day of ["bad", "2026-02-30", "2026-2-01", "2026-13-01"])
      expect(() => makeBrainChallenge("flash", "seed", 1, day)).toThrow();
  });

  it("strips private Flash/Rotate answers and returns independent public data", () => {
    const flash = makeBrainChallenge("flash", "privacy", 1, DAY).rounds[0] as FlashRound;
    expect(publicBrainRound(flash)).not.toHaveProperty("cells");
    const shown = publicBrainRound(flash, true);
    expect(shown).toHaveProperty("cells", flash.cells);
    (shown as FlashRound).cells[0] = -1;
    expect(flash.cells).not.toContain(-1);
    const rotate = makeBrainChallenge("rotate", "privacy", 1, DAY).rounds[0] as RotateRound;
    const publicRotate = publicBrainRound(rotate, true);
    expect(publicRotate).not.toHaveProperty("correctSame");
    (publicRotate as RotateRound).shapeA[0][0] = 999;
    expect(rotate.shapeA[0][0]).not.toBe(999);
    for (const game of BRAIN_GAMES) {
      const challenge = makeBrainChallenge(game, "private-server-random-seed", 1, DAY);
      expect(JSON.stringify(challenge.rounds.map((round) => publicBrainRound(round)))).not.toContain("private-server-random-seed");
    }
  });
});

describe("Flash spatial memory", () => {
  it("generates distinct in-bounds cells with bounded exposure and growing load", () => {
    const patterns = new Set<string>();
    for (let seed = 0; seed < 25; seed++) for (const difficulty of [1, 2, 3] as const) {
      for (const raw of makeBrainChallenge("flash", seed, difficulty, DAY).rounds) {
        const round = raw as FlashRound;
        expect(round.rows).toBeGreaterThanOrEqual(3);
        expect(round.rows).toBeLessThanOrEqual(5);
        expect(round.cols).toBe(round.rows);
        expect(round.cells).toHaveLength(round.count);
        expect(new Set(round.cells).size).toBe(round.count);
        expect(round.count).toBeGreaterThanOrEqual(3);
        expect(round.count).toBeLessThanOrEqual(9);
        expect(round.cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < round.rows * round.cols)).toBe(true);
        expect(round.showMs).toBeGreaterThanOrEqual(2400);
        expect(round.showMs).toBeLessThanOrEqual(3500);
        patterns.add(`${round.rows}:${round.cells.join(",")}`);
      }
    }
    expect(patterns.size).toBeGreaterThan(150);
  });

  it("scores intersection only and requires exactly N distinct selections", () => {
    const round = makeBrainChallenge("flash", "score", 1, DAY).rounds[0] as FlashRound;
    const other = Array.from({length: 9}, (_, cell) => cell).filter((cell) => !round.cells.includes(cell));
    expect(scoreBrainRound(round, {cells: round.cells})).toBe(100);
    expect(scoreBrainRound(round, {cells: [...round.cells.slice(0, 2), other[0]], elapsedMs: 0, score: 100})).toBe(66);
    expect(scoreBrainRound(round, {cells: other.slice(0, 3)})).toBe(0);
    for (const cells of [[], [0], [0, 0, 1], [0, 1, NaN], [0, 1, Infinity], [0, 1, -1], [0, 1, 9], [0, 1, .5], ["0", 1, 2]]) {
      expect(validateBrainAnswer(round, {cells})).toBe(false);
      expect(() => scoreBrainRound(round, {cells})).toThrow();
    }
  });
});

describe("Rotate polyominoes", () => {
  it("generates connected asymmetric chiral shapes and balanced same/mirror answers", () => {
    for (let seed = 0; seed < 20; seed++) for (const difficulty of [1, 2, 3] as const) {
      const rounds = makeBrainChallenge("rotate", seed, difficulty, DAY).rounds as RotateRound[];
      expect(rounds.filter((round) => round.correctSame).length).toBeGreaterThanOrEqual(2);
      expect(rounds.filter((round) => round.correctSame).length).toBeLessThanOrEqual(3);
      for (const round of rounds) {
        expect(round.shapeA).toHaveLength(round.shapeB.length);
        expect(new Set(round.shapeA.map(([x, y]) => `${x}:${y}`)).size).toBe(round.shapeA.length);
        const occupied = new Set(round.shapeA.map(([x, y]) => `${x}:${y}`));
        const reachable = new Set<string>(), queue = [round.shapeA[0]];
        while (queue.length) {
          const [x, y] = queue.pop()!, cell = `${x}:${y}`;
          if (reachable.has(cell)) continue;
          reachable.add(cell);
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
            if (occupied.has(`${x+dx}:${y+dy}`) && !reachable.has(`${x+dx}:${y+dy}`)) queue.push([x+dx,y+dy]);
        }
        expect(reachable.size).toBe(round.shapeA.length);
        for (const turn of [1, 2, 3]) expect(key(rotateShape(round.shapeA, turn))).not.toBe(key(round.shapeA));
        for (const turn of [0, 1, 2, 3]) expect(key(rotateShape(round.shapeA, turn, true))).not.toBe(key(round.shapeA));
        const alignment = rotationAlignment(round.shapeA, round.shapeB);
        expect(alignment).not.toBeNull();
        expect(alignment!.mirrored).toBe(!round.correctSame);
        expect(key(rotateShape(round.shapeA, alignment!.turns, alignment!.mirrored))).toBe(key(round.shapeB));
        expect(scoreBrainRound(round, {same: round.correctSame})).toBe(100);
        expect(scoreBrainRound(round, {same: !round.correctSame})).toBe(0);
      }
    }
  });

  it("rejects coerced truthy answers instead of treating them as booleans", () => {
    const round = makeBrainChallenge("rotate", "strict", 1, DAY).rounds[0];
    for (const answer of [{same: "true"}, {same: 1}, {same: null}, null, [], {}]) {
      expect(validateBrainAnswer(round, answer)).toBe(false);
      expect(() => scoreBrainRound(round, answer)).toThrow();
    }
  });
});

describe("Slide Rush Hour rules and hints", () => {
  it("slides along the fixed axis, counts any displacement as one move and blocks swept collisions", () => {
    expect(applySlideMove(simpleSlide.cars, {carId: "R", delta: 4})).toBeNull();
    const result = replaySlideMoves(simpleSlide, [{carId: "A", delta: 2}, {carId: "R", delta: 4}]);
    expect(result).toMatchObject({valid: true, solved: true, moves: 2});
    expect(result.cars.find((car) => car.id === "A")).toMatchObject({x: 2, y: 3});
    expect(simpleSlide.cars.find((car) => car.id === "A")!.y).toBe(1);
    expect(scoreBrainRound(simpleSlide, {moves: [{carId: "A", delta: 2}, {carId: "R", delta: 4}]})).toBe(100);
    const split = {moves: [{carId: "A", delta: 1}, {carId: "A", delta: 1}, {carId: "R", delta: 4}]};
    expect(scoreBrainRound(simpleSlide, split)).toBe(90);
    expect(scoreBrainRound(simpleSlide, split, {hints: 1})).toBe(75);
    expect(scoreBrainRound(simpleSlide, split, {hints: 10})).toBe(0);
  });

  it("rejects malformed moves, off-board moves, collisions and unfinished answers", () => {
    for (const move of [{carId: "missing", delta: 1}, {carId: "A", delta: 0}, {carId: "A", delta: .5},
      {carId: "A", delta: NaN}, {carId: "A", delta: Infinity}, {carId: "A", delta: 6}, {carId: "R", delta: -1}])
      expect(replaySlideMoves(simpleSlide, [move]).valid).toBe(false);
    expect(replaySlideMoves(simpleSlide, null).valid).toBe(false);
    expect(replaySlideMoves(simpleSlide, Array.from({length: 2001}, () => ({carId: "A", delta: 1}))).valid).toBe(false);
    expect(replaySlideMoves(simpleSlide, []).valid).toBe(true);
    expect(validateBrainAnswer(simpleSlide, {moves: []})).toBe(false);
    expect(() => scoreBrainRound(simpleSlide, {moves: []})).toThrow();
  });

  it("finds a shortest next move from the actual current state", () => {
    const first = slideHint(simpleSlide, []);
    expect(first.remainingMoves).toBe(2);
    expect(first.move?.carId).toBe("A");
    const second = slideHint(simpleSlide, [first.move!]);
    expect(second.remainingMoves).toBe(1);
    expect(second.move).toEqual({carId: "R", delta: 4});
    expect(slideHint(simpleSlide, [first.move!, second.move!])).toEqual({move: null, remainingMoves: 0});
    expect(() => slideHint(simpleSlide, [{carId: "R", delta: 4}])).toThrow();
  });

  it("ships at least forty own distinct solvable boards with exact BFS par and increasing stage pools", () => {
    const puzzles = SLIDE_STAGE_POOLS.flat();
    expect(SLIDE_STAGE_POOLS).toHaveLength(9);
    expect(puzzles.length).toBeGreaterThanOrEqual(40);
    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(puzzles.length);
    expect(new Set(puzzles.map((puzzle) => JSON.stringify(puzzle.cars))).size).toBe(puzzles.length);
    for (let stage = 0; stage < SLIDE_STAGE_POOLS.length; stage++) {
      const pool = SLIDE_STAGE_POOLS[stage];
      expect(pool.length).toBeGreaterThanOrEqual(4);
      if (stage > 0) expect(Math.min(...pool.map((p) => p.parMoves))).toBeGreaterThanOrEqual(Math.max(...SLIDE_STAGE_POOLS[stage-1].map((p) => p.parMoves)));
      for (const puzzle of pool) {
        const round: SlideRound = {...puzzle, kind: "slide", size: 6, stage: stage+1};
        expect(slideSolved(round.cars)).toBe(false);
        expect(replaySlideMoves(round, []).valid).toBe(true);
        expect(slideHint(round, []).remainingMoves).toBe(round.parMoves);
        const moves: SlideMove[] = [];
        for (let step = 0; step < puzzle.parMoves; step++) {
          const hint = slideHint(round, moves);
          expect(hint.remainingMoves).toBe(puzzle.parMoves - step);
          expect(hint.move).not.toBeNull();
          moves.push(hint.move!);
        }
        expect(validateBrainAnswer(round, {moves})).toBe(true);
        expect(scoreBrainRound(round, {moves})).toBe(100);
        expect(Object.keys(puzzle).sort()).toEqual(["cars", "id", "parMoves"]);
      }
    }
  }, 30_000);
});

describe("Dispatch timed routing", () => {
  it("fixes each route at the moment its switch is reached, with inclusive action boundaries", () => {
    const action = (atMs: number): DispatchAction[] => [{atMs, switch: 0, position: 1}];
    expect(dispatchSnapshot(singleTrain, action(1999), 8000).correct).toBe(1);
    expect(dispatchSnapshot(singleTrain, action(2000), 8000).correct).toBe(1);
    expect(dispatchSnapshot(singleTrain, action(2000.1), 8000).correct).toBe(0);
    expect(dispatchSnapshot(singleTrain, action(2000.1), 8000).trains[0].station).toBe(0);
    const middle = {...singleTrain, trains: [{...singleTrain.trains[0], destination: 1 as const}]};
    expect(dispatchSnapshot(middle, [{atMs: 4000, switch: 1, position: 1}], 8000).correct).toBe(1);
    expect(dispatchSnapshot(middle, [{atMs: 4001, switch: 1, position: 1}], 8000).correct).toBe(0);
  });

  it("places moving trains on the fixed tracks and keeps arrival feedback separate", () => {
    const lower: DispatchAction[] = [{atMs: 0, switch: 0, position: 1}];
    const approach = dispatchSnapshot(singleTrain, lower, 1000).trains[0];
    expect(approach).toMatchObject({x: 100, y: 180, station: null, arrived: false, correct: null});
    const branch = dispatchSnapshot(singleTrain, lower, 4000).trains[0];
    expect(branch.y).toBe(300);
    expect(branch.arrived).toBe(false);
    expect(dispatchSnapshot(singleTrain, lower, 8000).trains[0]).toMatchObject({x: 600, y: 300, station: 2, arrived: true, correct: true});
    expect(dispatchSnapshot(singleTrain, lower, 999999)).toEqual(dispatchSnapshot(singleTrain, lower, 10000));
  });

  it("generates progressive overlapping waves, scores correct trains only and supports perfect play", () => {
    for (const difficulty of [1, 2, 3] as const) for (const raw of makeBrainChallenge("dispatch", "routing", difficulty, DAY).rounds) {
      const wave = raw as DispatchRound;
      expect(wave.durationMs).toBeGreaterThanOrEqual(15000);
      expect(wave.durationMs).toBeLessThanOrEqual(24000);
      expect(new Set(wave.trains.map((train) => train.id)).size).toBe(wave.trains.length);
      expect(wave.stations).toHaveLength(wave.stage === 1 ? 2 : 3);
      for (const train of wave.trains) {
        expect(train.spawnMs).toBeLessThan(train.switch0Ms);
        expect(train.switch0Ms).toBeLessThan(train.switch1Ms);
        expect(train.switch1Ms).toBeLessThan(train.arrivalMs);
        expect(train.arrivalMs).toBeLessThanOrEqual(wave.durationMs);
      }
      const actions = correctDispatchActions(wave);
      expect(validDispatchActions(wave, actions)).toBe(true);
      expect(dispatchSnapshot(wave, actions, wave.durationMs).correct).toBe(wave.trains.length);
      expect(scoreBrainRound(wave, {actions})).toBe(100);
      const idleCorrect = wave.trains.filter((train) => train.destination === 0).length;
      expect(scoreBrainRound(wave, {actions: []})).toBe(Math.floor(100 * idleCorrect / wave.trains.length));
      expect(wave.trains[1].spawnMs).toBeLessThan(wave.trains[0].arrivalMs);
    }
  });

  it("rejects unordered, out-of-time, malformed and inactive-switch actions", () => {
    const first = makeBrainChallenge("dispatch", "strict", 1, DAY).rounds[0] as DispatchRound;
    for (const actions of [null, {}, [{atMs: -1, switch: 1, position: 0}], [{atMs: NaN, switch: 1, position: 0}],
      [{atMs: Infinity, switch: 1, position: 0}], [{atMs: first.durationMs+1, switch: 1, position: 0}],
      [{atMs: 1, switch: 2, position: 0}], [{atMs: 1, switch: 1, position: 2}], [{atMs: 1, switch: 0, position: 0}],
      [{atMs: 2, switch: 1, position: 0}, {atMs: 1, switch: 1, position: 1}]]) {
      expect(validDispatchActions(first, actions)).toBe(false);
      expect(validateBrainAnswer(first, {actions})).toBe(false);
      expect(() => scoreBrainRound(first, {actions})).toThrow();
    }
    expect(() => dispatchSnapshot(first, [], NaN)).toThrow();
  });
});
