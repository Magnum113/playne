// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { FlowAntCanvas } from "../src/FlowAntCanvas";
import { flowMotion } from "../src/flowPresentation";
import { drawFlowWorker } from "../src/flowWorkerSprites";
vi.mock("../src/flowWorkerSprites", () => ({
  flowWorkerAtlas: vi.fn(() => ({})),
  drawFlowWorker: vi.fn(),
}));
let root: Root,
  box: HTMLDivElement,
  now = 0;
const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  beginPath: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  globalAlpha: 1,
  fillStyle: "",
};
const puzzle = {
  version: 4 as const,
  id: "crowd:v4",
  width: 24,
  height: 24,
  cells: Array.from({ length: 576 }, (_, i) => (i < 160 ? 7 : -1)),
};
const motion = flowMotion(
  Array.from({ length: 160 }, (_, cell) => ({
    cell,
    packet: cell % 5,
    color: 7,
    slot: cell % 5,
  })),
  1,
  puzzle,
  { cells: puzzle.cells },
);
const render = (pausedAt?: number) =>
  act(async () =>
    root.render(
      <svg>
        <FlowAntCanvas
          trips={motion.trips}
          epoch={0}
          speed={1}
          scale={0.85}
          viewBox={{ x: 10, y: -10, width: 520, height: 610 }}
          pausedAt={pausedAt}
          fallback={<text>SVG fallback</text>}
        />
      </svg>,
    ),
  );
beforeEach(() => {
  vi.clearAllMocks();
  now = 10000;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Path2D", class {});
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(async () => {
  await act(async () => root.unmount());
  box.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("one canvas for the entire colony", () => {
  it("draws every active worker with one frame loop and cancels it on unmount", async () => {
    await render();
    const count = motion.trips.filter(
      (t) => t.depart <= now && t.deliveryAt > now,
    ).length;
    expect(count).toBeGreaterThan(20);
    expect(drawFlowWorker).toHaveBeenCalledTimes(count);
    expect(box.querySelectorAll("canvas")).toHaveLength(1);
    expect(box.textContent).not.toContain("SVG fallback");
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    root = createRoot(box);
  });
  it("draws the exact paused clock once, without scheduling more frames", async () => {
    const pause = 2000;
    await render(pause);
    expect(drawFlowWorker).toHaveBeenCalledTimes(
      motion.trips.filter((t) => t.depart <= pause && t.deliveryAt > pause)
        .length,
    );
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
  it("retains SVG support when a 2D context is unavailable", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await render();
    expect(box.querySelector("canvas")).toBeNull();
    expect(box.textContent).toContain("SVG fallback");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
