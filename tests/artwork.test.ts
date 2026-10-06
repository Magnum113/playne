import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { objects } from "../src/data";

describe("generated illustrations", () => {
  it("ships seven PNG files with correct pixel metadata and no aspect distortion", () => {
    const illustrated = Object.values(objects).filter((o) => o.illustration);
    expect(illustrated).toHaveLength(7);
    for (const object of illustrated) {
      const art = object.illustration!;
      const bytes = readFileSync(
        new URL(`../public/${art.src}`, import.meta.url),
      );
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.length).toBeLessThan(160_000);
      expect(bytes.readUInt32BE(16)).toBe(art.imageWidth);
      expect(bytes.readUInt32BE(20)).toBe(art.imageHeight);
      const [x, y, width, height] = art.crop;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(art.imageWidth);
      expect(y + height).toBeLessThanOrEqual(art.imageHeight);
      expect(object.width / width).toBeCloseTo(object.height / height, 10);
      expect(
        object.axis === "x" ? object.width : object.height,
      ).toBeGreaterThanOrEqual(object.size - 1e-8);
    }
  });
  it("calibrates the hoop to its rim, leaving the backboard above the measurement", () => {
    const hoop = objects.hoop;
    expect(hoop.size).toBe(3.05);
    expect(hoop.height).toBeGreaterThan(hoop.size);
    const art = hoop.illustration!;
    const unit = hoop.height / art.crop[3];
    const rimY = (183 - art.crop[1]) * unit;
    expect(hoop.height - rimY).toBeCloseTo(3.05, 6);
  });
});
