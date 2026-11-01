import { describe, expect, it } from "vitest";
import { flowGeometry } from "../src/flowGeometry";
import { flowLevelArt } from "../src/flowLevelArt";

describe("colony board geometry", () => {
  it("keeps every native-resolution grid centered inside the reference stage", () => {
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
      expect(g.reference).toBe(true);
      expect(g.workerScale).toBe(0.85);
      expect(g.homeY).toBe(543);
      expect(g.viewBox).toEqual({ x: 10, y: -10, width: 520, height: 610 });
    }
    expect(frame).toEqual([10, -10, 520, 510, 454]);
  });

  it("projects the frame, picture and home onto the measured portrait reference", () => {
    const g = flowGeometry({ width: 36, height: 36, version: 4 });
    const xScale = 532 / g.viewBox.width;
    const yScale = 550 / g.viewBox.height;
    expect(g.frameWidth * xScale).toBeCloseTo(532);
    expect(g.frameHeight * yScale).toBeCloseTo(460, 0);
    expect(36 * g.step * xScale).toBeCloseTo(442, 0);
    expect(36 * g.step * yScale).toBeCloseTo(390, 0);
    // The 576×1280 reference starts the frame at y=174 and the home at y=673.
    expect(174 + (g.homeY - g.viewBox.y) * yScale).toBeCloseTo(673, 0);
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
        reference: false,
        viewBox: { x: 0, y: 0, width: 540, height: 634 },
        step: 24,
        size: 23,
        startX: 54,
        startY: 22,
        bottom: 502,
        homeY: 568,
        frameX: 39,
        frameY: 6,
        frameWidth: 462,
        frameHeight: 508,
        workerScale: 0.72,
      });
      expect(flowGeometry({ width: 20, height: 16, version })).toEqual({
        reference: false,
        viewBox: { x: 0, y: 0, width: 540, height: 538 },
        step: 24,
        size: 23,
        startX: 30,
        startY: 22,
        bottom: 406,
        homeY: 472,
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
    expect(detailed.workerScale).toBe(medium.workerScale);
  });
});
