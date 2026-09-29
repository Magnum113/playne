import { describe, it, expect, afterEach, vi } from "vitest";
import {
  evaluateCircle,
  readCircleBest,
  saveCircleBest,
  CIRCLE_BEST_KEY,
  type CirclePoint,
} from "../src/circle";

function circle(
  rx = 150,
  ry = rx,
  turns = 1,
  count = 360,
  dx = 0,
): CirclePoint[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = (i / count) * 2 * Math.PI * turns;
    return { x: 300 + dx + rx * Math.cos(t), y: 300 + ry * Math.sin(t) };
  });
}
function score(points: CirclePoint[]) {
  const result = evaluateCircle(points);
  if (!result.valid) throw new Error(result.message);
  return result.score;
}
describe("circle evaluation", () => {
  it("gives a perfect circle 100 regardless of direction or radius", () => {
    for (const r of [60, 120, 240]) {
      expect(score(circle(r))).toBe(100);
      expect(score(circle(r).reverse())).toBe(100);
    }
  });
  it("reduces the score for ovals, off-center circles and squares", () => {
    expect(score(circle(150, 145))).toBeGreaterThan(score(circle(150, 100)));
    expect(score(circle(150, 100))).toBeGreaterThan(score(circle(150, 60)));
    expect(score(circle(150, 150, 1, 360, 40))).toBeLessThan(75);
    expect(
      score([
        { x: 150, y: 150 },
        { x: 450, y: 150 },
        { x: 450, y: 450 },
        { x: 150, y: 450 },
        { x: 150, y: 150 },
      ]),
    ).toBeLessThan(80);
  });
  it("is insensitive to sampling density and pauses", () => {
    expect(
      Math.abs(
        score(circle(150, 110, 1, 90)) - score(circle(150, 110, 1, 720)),
      ),
    ).toBeLessThanOrEqual(0.1);
    const points = circle(150, 110);
    const paused = points.flatMap((p, i) =>
      Array.from({ length: i < 80 ? 10 : 1 }, () => p),
    );
    expect(score(paused)).toBe(score(points));
  });
  it("rejects unfinished arcs, straight lines, tiny circles and multiple turns", () => {
    for (const points of [
      [],
      [{ x: 10, y: 10 }],
      [
        { x: 50, y: 50 },
        { x: 200, y: 50 },
        { x: 450, y: 50 },
      ],
      circle(10),
      circle(150, 150, 0.75),
      circle(150, 150, 2),
      circle(150, 150, -2),
    ]) {
      expect(evaluateCircle(points).valid).toBe(false);
    }
  });
  it("rejects spirals, center crossings and backtracking", () => {
    const spiral = circle().map((p, i) => ({
      x: 300 + (p.x - 300) * (1 + i / 360),
      y: 300 + (p.y - 300) * (1 + i / 360),
    }));
    expect(evaluateCircle(spiral).valid).toBe(false);
    expect(evaluateCircle(circle(150, 150, 1, 360, 150)).valid).toBe(false);
    const arc = circle(150, 150, 0.25, 90);
    const backtrack = [...arc, ...arc.slice().reverse(), ...circle()];
    expect(evaluateCircle(backtrack).valid).toBe(false);
  });
  it("rejects non-finite input", () => {
    expect(evaluateCircle([{ x: NaN, y: 100 }, ...circle()]).valid).toBe(false);
  });
});
describe("circle best storage", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("persists a personal best without reducing it", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    expect(readCircleBest()).toBe(0);
    expect(saveCircleBest(89.6)).toBe(89.6);
    expect(saveCircleBest(70)).toBe(89.6);
    expect(readCircleBest()).toBe(89.6);
    expect(values.get(CIRCLE_BEST_KEY)).toBe("89.6");
  });
  it("ignores corrupted and out-of-range records", () => {
    for (const value of ['"99"', "{}", "101", "-1", "null", "bad"]) {
      vi.stubGlobal("localStorage", { getItem: () => value });
      expect(readCircleBest()).toBe(0);
    }
  });
  it("works when storage access is denied", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readCircleBest()).toBe(0);
    expect(saveCircleBest(91.2)).toBe(91.2);
  });
});
