import { describe, expect, it } from "vitest";
import {
  makePressDeck,
  makePressLevel,
  PRESSURE_FAMILIES,
  judgePress,
  replayPressRun,
  PRESSURE_LEVELS,
  type PressLevel,
  type PressTrace,
  type PressEvent,
} from "../src/pressure";
import {
  makeChallenge,
  validateAnswer,
  scoreUnits,
  isGame,
} from "../server/scoring";
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
export function solvePress(l: PressLevel): PressTrace {
  const events: PressEvent[] = [];
  if (l.kind === "wait") return { events, elapsed: l.duration };
  if (l.kind === "hold" || l.kind === "release") {
    events.push(
      { type: "down", at: 300 },
      { type: "up", at: 300 + (l.from + l.to) / 2 },
    );
  } else
    for (let i = 0; i < l.count; i++) {
      const at = Math.max(300, l.from + 100) + i * 170;
      events.push({ type: "down", at }, { type: "up", at: at + 50 });
    }
  return { events, elapsed: events.at(-1)!.at + 420 };
}
describe("Pressure generated challenge and replay", () => {
  it("generates 30 levels, every family, no adjacent family repeats, and many different runs", () => {
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const d = makePressDeck(random(seed));
      expect(d).toHaveLength(PRESSURE_LEVELS);
      expect(new Set(d.map((x) => x.family)).size).toBe(
        PRESSURE_FAMILIES.length,
      );
      expect(d.every((l, i) => !i || l.family !== d[i - 1].family)).toBe(true);
      signatures.add(d.map((l) => l.id).join("/"));
    }
    expect(signatures.size).toBe(150);
  });
  it("all families and their generated variations are solvable, both locally and on API replay", () => {
    for (const f of PRESSURE_FAMILIES)
      for (let seed = 1; seed <= 30; seed++) {
        const l = makePressLevel(f, 20, random(seed));
        const t = solvePress(l);
        expect(judgePress(l, t.events, t.elapsed), `${f}: ${l.prompt}`).toEqual(
          { status: "success" },
        );
      }
    const d = makePressDeck(random(42));
    expect(replayPressRun(d, d.map(solvePress)).score).toBe(30);
  });
  it("rejects early signals, late holds, extra taps, and actions on do-not-press levels", () => {
    const tap = makePressLevel("tap", 0, () => 0);
    expect(
      judgePress(
        tap,
        [
          { type: "down", at: 100 },
          { type: "up", at: 150 },
          { type: "down", at: 250 },
        ],
        250,
      ).status,
    ).toBe("failure");
    const signal = makePressLevel("signal", 20, () => 0);
    expect(
      judgePress(
        signal,
        [{ type: "down", at: signal.from - 1 }],
        signal.from - 1,
      ).reason,
    ).toBe("Слишком рано.");
    expect(
      judgePress(signal, [{ type: "down", at: signal.to }], signal.to).status,
    ).toBe("failure");
    const hold = makePressLevel("hold", 0, () => 0);
    expect(
      judgePress(hold, [{ type: "down", at: 200 }], 200 + hold.to + 1).status,
    ).toBe("failure");
    const wait = makePressLevel("restraint", 0, () => 0);
    expect(judgePress(wait, [], wait.duration - 1).status).toBe("playing");
    expect(judgePress(wait, [], wait.duration).status).toBe("success");
    expect(judgePress(wait, [{ type: "down", at: 1 }], 1).status).toBe(
      "failure",
    );
  });
  it("accepts a completed tap just before the deadline instead of failing during its confirmation delay", () => {
    const l = makePressLevel("tap", 0, () => 0);
    const events: PressEvent[] = [
      { type: "down", at: l.duration - 100 },
      { type: "up", at: l.duration - 30 },
    ];
    expect(judgePress(l, events, l.duration).status).toBe("success");
  });
  it("validates double click gap, memory reveal, exact deadlines and malformed traces", () => {
    const l = makePressLevel("double", 0, () => 0);
    const t: PressEvent[] = [
      { type: "down", at: 100 },
      { type: "up", at: 150 },
      { type: "down", at: 751 },
    ];
    expect(judgePress(l, t, 751).status).toBe("failure");
    const m = makePressLevel("memory", 0, () => 0);
    expect(judgePress(m, [{ type: "down", at: 100 }], 100).status).toBe(
      "failure",
    );
    const tap = makePressLevel("tap", 0, () => 0);
    expect(
      judgePress(tap, [{ type: "down", at: tap.duration }], tap.duration)
        .status,
    ).toBe("failure");
    expect(judgePress(tap, [{ type: "up", at: 100 }], 100).status).toBe(
      "failure",
    );
    expect(
      judgePress(
        tap,
        [
          { type: "down", at: 200 },
          { type: "up", at: 100 },
        ],
        300,
      ).status,
    ).toBe("failure");
  });
  it("stops scoring at first failure, rejects unfinished and fabricated continuation, ignores submitted score", () => {
    expect(isGame("pressure")).toBe(true);
    const challenge = makeChallenge("pressure");
    const first = challenge.levels![0];
    const solved = solvePress(first);
    const second = challenge.levels![1];
    const bad =
      second.kind === "wait"
        ? { events: [{ type: "down" as const, at: 10 }], elapsed: 10 }
        : { events: [], elapsed: second.duration };
    expect(
      validateAnswer("pressure", challenge, 0, {
        rounds: [solved, bad],
        score: 999,
      }),
    ).toMatchObject({ score: 1, cleared: 1 });
    expect(
      scoreUnits([
        validateAnswer("pressure", challenge, 0, { rounds: [solved, bad] }),
      ]),
    ).toBe(10);
    expect(() => replayPressRun(challenge.levels!, [solved])).toThrow(
      "ещё не закончена",
    );
    expect(() =>
      replayPressRun(challenge.levels!, [solved, bad, solved]),
    ).toThrow("после ошибки");
    expect(() =>
      validateAnswer("pressure", challenge, 1, { rounds: [] }),
    ).toThrow();
  });
  it("avoids most previous parameter combinations across consecutive games", () => {
    const d = makePressDeck(random(2)),
      next = makePressDeck(
        random(3),
        d.map((x) => x.id),
      );
    const overlap = next.filter((l) => d.some((x) => x.id === l.id));
    // Fixed no-press / double wording can recur, numerical and timing tasks should vary.
    expect(
      overlap.filter(
        (x) => !["restraint", "double", "negation", "word"].includes(x.family),
      ).length,
    ).toBeLessThan(4);
  });
});
