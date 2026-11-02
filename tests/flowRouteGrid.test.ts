import { describe, it, expect } from "vitest";
import { flowSegmentClear } from "../src/flowRouteGrid";
function reference(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cells: number[],
  g: {
    width: number;
    height: number;
    startX: number;
    startY: number;
    step: number;
  },
) {
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      if (cells[y * g.width + x] < 0) continue;
      let enter = 0,
        exit = 1;
      for (const [o, d, min, max] of [
        [
          a.x,
          b.x - a.x,
          g.startX + x * g.step + 0.00001,
          g.startX + (x + 1) * g.step - 0.00001,
        ],
        [
          a.y,
          b.y - a.y,
          g.startY + y * g.step + 0.00001,
          g.startY + (y + 1) * g.step - 0.00001,
        ],
      ]) {
        if (Math.abs(d) < 0.000001) {
          if (o <= min || o >= max) {
            enter = 2;
            break;
          }
        } else {
          const p = (min - o) / d,
            q = (max - o) / d;
          enter = Math.max(enter, Math.min(p, q));
          exit = Math.min(exit, Math.max(p, q));
        }
      }
      if (enter <= exit) return false;
    }
  return true;
}
describe("grid route intersection", () => {
  it("matches exhaustive exact intersections, including outside paths and grid corners", () => {
    const g = { width: 36, height: 36, startX: 54, startY: 22, step: 12 };
    const cells = Array.from({ length: 1296 }, (_, i) => (i % 7 < 3 ? 7 : -1));
    let seed = 42;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < 4000; i++) {
      const a = { x: rand() * 700 - 80, y: rand() * 750 - 100 },
        b = { x: rand() * 700 - 80, y: rand() * 750 - 100 };
      if (i % 4 === 0) {
        a.x = 54 + Math.floor(rand() * 36) * 12;
        b.y = 22 + Math.floor(rand() * 36) * 12;
      }
      if (i % 7 === 0) b.x = a.x;
      if (i % 11 === 0) b.y = a.y;
      expect(flowSegmentClear(a, b, cells, g), JSON.stringify({ a, b })).toBe(
        reference(a, b, cells, g),
      );
    }
  });
});
