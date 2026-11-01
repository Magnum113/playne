import { describe, expect, it } from "vitest";
import { flowGeometry } from "../src/flowGeometry";
import { flowLevelArt } from "../src/flowLevelArt";

describe("colony board geometry", () => {
  it("fits all native-resolution pictures into the same square stage without stretching cells", () => {
    let frame: number[] | undefined;
    for (let index = 0; index < 36; index++) {
      const art = flowLevelArt(index);
      const g = flowGeometry({ ...art, version: 4 });
      const bounds = [
        g.frameX,
        g.frameY,
        g.frameWidth,
        g.frameHeight,
        g.bottom,
      ];
      frame ??= bounds;
      expect(bounds, art.name).toEqual(frame);
      expect(g.startX + (art.width * g.step) / 2).toBeCloseTo(270);
      expect(g.startY + (art.height * g.step) / 2).toBeCloseTo(238);
      expect(g.startX).toBeGreaterThan(g.frameX);
      expect(g.startY).toBeGreaterThan(g.frameY);
      expect(g.startX + art.width * g.step).toBeLessThan(
        g.frameX + g.frameWidth,
      );
      expect(g.startY + art.height * g.step).toBeLessThan(
        g.frameY + g.frameHeight,
      );
      expect(g.size).toBeGreaterThan(10);
      expect(g.size).toBeLessThan(g.step);
      expect(g.workerScale).toBeGreaterThanOrEqual(0.42);
      expect(g.workerScale).toBeLessThanOrEqual(0.72);
    }
    expect(frame).toEqual([39, 6, 462, 460, 454]);
  });

  it("keeps wide sushi centered vertically and its cells square at every density", () => {
    for (const index of [2, 14, 26]) {
      const art = flowLevelArt(index),
        g = flowGeometry({ ...art, version: 4 });
      expect(art.width).toBeGreaterThan(art.height);
      const left = g.startX - 54,
        right = 486 - (g.startX + art.width * g.step);
      const top = g.startY - 22,
        bottom = 454 - (g.startY + art.height * g.step);
      expect(left).toBeCloseTo(right);
      expect(top).toBeCloseTo(bottom);
      expect(top).toBeGreaterThan(40);
      expect(art.width * g.step).toBeCloseTo(432);
      // One step is shared by x and y; letterboxing must not squash the artwork.
      expect((art.width * g.step) / (art.height * g.step)).toBeCloseTo(
        art.width / art.height,
      );
    }
  });

  it("retains the saved v2/v3 frame and 24-unit cells", () => {
    for (const version of [undefined, 2, 3]) {
      expect(flowGeometry({ width: 18, height: 20, version })).toEqual({
        step: 24,
        size: 23,
        startX: 54,
        startY: 22,
        bottom: 502,
        frameX: 39,
        frameY: 6,
        frameWidth: 462,
        frameHeight: 508,
        workerScale: 0.72,
      });
      expect(flowGeometry({ width: 20, height: 16, version })).toEqual({
        step: 24,
        size: 23,
        startX: 30,
        startY: 22,
        bottom: 406,
        frameX: 15,
        frameY: 6,
        frameWidth: 510,
        frameHeight: 412,
        workerScale: 0.72,
      });
    }
  });

  it("recognizes v4 serialized ids while older ids keep the legacy dimensions", () => {
    const dimensions = { width: 36, height: 36 };
    expect(flowGeometry({ ...dimensions, id: "level:25:v4" })).toEqual(
      flowGeometry({ ...dimensions, version: 4 }),
    );
    expect(
      flowGeometry({ width: 18, height: 20, id: "level:1:v3" }).bottom,
    ).toBe(502);
    const medium = flowGeometry({ width: 24, height: 24, version: 4 });
    const detailed = flowGeometry({ width: 36, height: 36, version: 4 });
    expect(detailed.step).toBeLessThan(medium.step);
    expect(detailed.workerScale).toBeLessThan(medium.workerScale);
  });
});
