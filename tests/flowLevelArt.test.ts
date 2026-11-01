import { describe, expect, it } from "vitest";
import {
  FLOW_ART_COLORS,
  flowLevelArt,
  type FlowLevelArt,
} from "../src/flowLevelArt";

/** The accessible surface includes holes connected to the outside of the art. */
function exposedColors(art: FlowLevelArt) {
  const { width, height, cells } = art;
  const outside = new Set<number>();
  const queue: number[] = [];
  const colors = new Set<number>();
  const visit = (x: number, y: number) => {
    const i = y * width + x;
    if (cells[i] >= 0) colors.add(cells[i]);
    else if (!outside.has(i)) {
      outside.add(i);
      queue.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head],
      x = i % width,
      y = Math.floor(i / width);
    if (x > 0) visit(x - 1, y);
    if (x < width - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < height - 1) visit(x, y + 1);
  }
  return colors;
}

describe("authored colony level art", () => {
  it("provides 36 reproducible, bounded maps with twelve compositions", () => {
    const families = new Set<string>();
    const drawings = new Set<string>();
    for (let i = 0; i < 36; i++) {
      const art = flowLevelArt(i);
      expect(flowLevelArt(i)).toEqual(art);
      expect(art.cells).toHaveLength(art.width * art.height);
      expect(art.width).toBeGreaterThanOrEqual(24);
      expect(art.height).toBeGreaterThanOrEqual(18);
      expect(
        art.cells.every(
          (c) => Number.isInteger(c) && c >= -1 && c < FLOW_ART_COLORS.length,
        ),
      ).toBe(true);
      expect(art.cells.filter((c) => c >= 0).length).toBeGreaterThan(250);
      families.add(art.family);
      drawings.add(JSON.stringify(art.cells));
    }
    expect(families.size).toBe(12);
    expect(drawings.size).toBe(36);
  });

  it("opens on a substantial sparse picture with several immediately accessible colors", () => {
    const opening = flowLevelArt(0);
    expect(opening.family).toBe("magic-cup");
    expect(opening.cells.filter((c) => c >= 0).length).toBeGreaterThan(250);
    expect(opening.cells.filter((c) => c === -1).length).toBeGreaterThan(
      opening.cells.length / 3,
    );
    expect(exposedColors(opening).size).toBeGreaterThanOrEqual(4);
  });

  it("alternates silhouette compositions, filled color fields and a three-color relief", () => {
    const football = flowLevelArt(1);
    expect(new Set(football.cells).size).toBe(3);
    expect(football.cells).not.toContain(-1);
    expect(flowLevelArt(7).cells).toContain(-1);
    for (const index of [3, 4, 5, 6, 9, 10, 11]) {
      const art = flowLevelArt(index);
      expect(art.cells).not.toContain(-1);
      expect(exposedColors(art).size, art.family).toBeGreaterThanOrEqual(2);
    }
  });

  it("paints the later chapters at native resolution rather than repeating square pixels", () => {
    for (let motif = 0; motif < 12; motif++) {
      expect(flowLevelArt(motif + 12).width).toBe(30);
      const art = flowLevelArt(motif + 24);
      expect(art.width).toBe(36);
      expect(art.family).toBe(flowLevelArt(motif).family);
      let mixed = 0;
      for (let y = 0; y < art.height - 1; y += 2)
        for (let x = 0; x < art.width - 1; x += 2) {
          const i = y * art.width + x;
          if (
            new Set([
              art.cells[i],
              art.cells[i + 1],
              art.cells[i + art.width],
              art.cells[i + art.width + 1],
            ]).size > 1
          )
            mixed++;
        }
      expect(mixed, art.family).toBeGreaterThan(24);
    }
  });

  it("retains the existing color identities and supplies legible ink for pale new cubes", () => {
    expect(FLOW_ART_COLORS.slice(0, 7).map((c) => c.hex)).toEqual([
      "#46d6b1",
      "#ff846d",
      "#ad99ff",
      "#ffd16b",
      "#70c8ff",
      "#ef9ac3",
      "#ffb879",
    ]);
    for (const i of [8, 10, 12])
      expect(FLOW_ART_COLORS[i].ink).toMatch(/^#[0-9a-f]{6}$/i);
    expect(flowLevelArt(36)).toEqual(flowLevelArt(0));
    expect(flowLevelArt(-1)).toEqual(flowLevelArt(35));
    expect(flowLevelArt(Number.NaN)).toEqual(flowLevelArt(0));
  });
});
