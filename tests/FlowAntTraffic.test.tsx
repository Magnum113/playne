// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowScene } from "../src/FlowArt";
import * as rules from "../src/flow";
import type { FlowPuzzle } from "../src/flow";
import {
  flowRetimeMotion,
  type FlowMotion,
  type FlowTrip,
} from "../src/flowPresentation";

const puzzle: FlowPuzzle = {
  version: 4,
  id: "traffic:v4",
  name: "Traffic timing",
  width: 3,
  height: 1,
  cells: [0, 0, 0],
  slots: 5,
  lanes: [],
  solution: [],
};
const trip = (id: string, cell: number, depart: number): FlowTrip => ({
  id,
  cell,
  packet: cell,
  color: 0,
  slot: cell,
  worker: cell,
  renderAt: 0,
  depart,
  arrive: depart + 1000,
  at: depart + 1110,
  returnAt: depart + 1200,
  outbound: 1000,
  carry: 1000,
  deliveryAt: depart + 2200,
  pickupPause: 200,
  outboundPath: "M0 0L100 100",
  returnPath: "M100 100L0 0",
  outboundLength: 140,
  returnLength: 140,
  outboundPoints: [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ],
  returnPoints: [
    { x: 100, y: 100 },
    { x: 0, y: 0 },
  ],
  x: 100,
  y: 100,
});
const plan = (trips: FlowTrip[]): FlowMotion => ({
  launch: 220,
  pickupPause: 200,
  stagger: 110,
  trips,
  added: trips,
  pickups: trips,
  deliveries: trips.map((item) => ({ ...item, at: item.deliveryAt })),
  finish: Math.max(...trips.map((item) => item.deliveryAt)) + 240,
});
let root: Root;
let box: HTMLDivElement;
let now: number;
let timerNow: number;
const renderMotion = async (motion: FlowMotion, speed: 1 | 2 = 1) =>
  act(async () => {
    root.render(
      <FlowScene
        puzzle={puzzle}
        cells={puzzle.cells}
        moving
        motion={motion}
        speed={speed}
        epoch={0}
      />,
    );
  });
const render = (trips: FlowTrip[]) => renderMotion(plan(trips));
const advanceTo = async (next: number) => {
  now = next;
  await act(async () => vi.advanceTimersByTime(next - timerNow));
  timerNow = next;
};
const ant = (cell: number, phase = "outbound") =>
  box.querySelector<SVGGElement>(`[data-trip="${phase}"][data-cell="${cell}"]`);
const animationPhase = (element: SVGGElement, mountedAt: number) => {
  const delay = Number.parseFloat(
    element.style.getPropertyValue("--walk-delay"),
  );
  const duration = Number.parseFloat(
    element.style.getPropertyValue("--walk-duration"),
  );
  return (now - mountedAt - delay) / duration;
};

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  timerNow = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(async () => {
  await act(async () => root.unmount());
  box.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Swarm ant traffic renders the active timetable", () => {
  it("mounts future journeys shortly before departure, removes delivered journeys and leaves the cube layer idle", async () => {
    const frontier = vi.spyOn(rules, "flowFrontier");
    const first = trip("first", 0, 100);
    const future = trip("future", 1, 5000);
    await render([first, future]);
    expect(ant(0)).not.toBeNull();
    expect(ant(1)).toBeNull();
    expect(frontier).toHaveBeenCalledTimes(1);
    await advanceTo(2400);
    expect(box.querySelectorAll("[data-trip]")).toHaveLength(0);
    await advanceTo(4800);
    expect(ant(1)?.style.getPropertyValue("--walk-delay")).toBe("200ms");
    expect(ant(1, "return")?.style.getPropertyValue("--walk-delay")).toBe(
      "1400ms",
    );
    expect(frontier).toHaveBeenCalledTimes(1);
    expect(box.querySelectorAll(".flow-cube")).toHaveLength(3);
    await advanceTo(7300);
    expect(box.querySelectorAll("[data-trip]")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps an existing journey's DOM and animation clock when another command appends work", async () => {
    const first = trip("first", 0, 100);
    await render([first]);
    const before = ant(0)!;
    const delay = before.style.getPropertyValue("--walk-delay");
    await advanceTo(100);
    await render([first, trip("appended", 2, 200)]);
    expect(ant(0)).toBe(before);
    expect(before.style.getPropertyValue("--walk-delay")).toBe(delay);
    expect(ant(2)?.style.getPropertyValue("--walk-delay")).toBe("100ms");
  });
  it("resumes the correct animation phase if a journey first mounts after departure", async () => {
    now = 800;
    await render([trip("late-frame", 0, 100)]);
    expect(ant(0)?.style.getPropertyValue("--walk-delay")).toBe("-700ms");
    expect(ant(0, "return")?.style.getPropertyValue("--walk-delay")).toBe(
      "500ms",
    );
  });
  it("keeps the outbound node and its exact phase when changing speed in both directions after a late mount", async () => {
    now = 300;
    timerNow = 300;
    const mountedAt = now;
    let motion = plan([trip("walking", 0, 100)]);
    await renderMotion(motion);
    const walking = ant(0)!;

    await advanceTo(500);
    expect(animationPhase(walking, mountedAt)).toBeCloseTo(0.4);
    motion = flowRetimeMotion(motion, now, 1, 2);
    await renderMotion(motion, 2);
    expect(ant(0)).toBe(walking);
    expect(walking.style.getPropertyValue("--walk-duration")).toBe("500ms");
    expect(animationPhase(walking, mountedAt)).toBeCloseTo(0.4);

    await advanceTo(600);
    expect(animationPhase(walking, mountedAt)).toBeCloseTo(0.6);
    motion = flowRetimeMotion(motion, now, 2, 1);
    await renderMotion(motion);
    expect(ant(0)).toBe(walking);
    expect(walking.style.getPropertyValue("--walk-duration")).toBe("1000ms");
    expect(animationPhase(walking, mountedAt)).toBeCloseTo(0.6);
  });
  it("keeps a loaded ant's return phase through 1×→2×→1× while a future journey mounts", async () => {
    let motion = plan([trip("carrying", 0, 100), trip("future", 1, 2300)]);
    await renderMotion(motion);
    const carrying = ant(0, "return")!;
    expect(ant(1)).toBeNull();

    await advanceTo(1600);
    expect(animationPhase(carrying, 0)).toBeCloseTo(0.3);
    motion = flowRetimeMotion(motion, now, 1, 2);
    await renderMotion(motion, 2);
    expect(ant(0, "return")).toBe(carrying);
    expect(animationPhase(carrying, 0)).toBeCloseTo(0.3);

    await advanceTo(1800);
    expect(ant(1)).not.toBeNull();
    expect(ant(0, "return")).toBe(carrying);
    expect(animationPhase(carrying, 0)).toBeCloseTo(0.7);
    motion = flowRetimeMotion(motion, now, 2, 1);
    await renderMotion(motion);
    expect(ant(0, "return")).toBe(carrying);
    expect(carrying.style.getPropertyValue("--walk-duration")).toBe("1000ms");
    expect(animationPhase(carrying, 0)).toBeCloseTo(0.7);

    await advanceTo(1900);
    expect(ant(1)).not.toBeNull();
    expect(ant(0, "return")).toBe(carrying);
    expect(animationPhase(carrying, 0)).toBeCloseTo(0.8);
  });
  it("keeps an existing cube's CSS pickup clock aligned with its retimed ant", async () => {
    const future = trip("future-pickup", 0, 2000);
    let motion = plan([future]);
    await renderMotion(motion);
    const cube = box.querySelector<SVGGElement>('.flow-cube[data-cell="0"]')!;
    expect(cube.style.getPropertyValue("--pickup-delay")).toBe("3110ms");

    await advanceTo(1000);
    motion = flowRetimeMotion(motion, now, 1, 2);
    await renderMotion(motion, 2);
    expect(box.querySelector('.flow-cube[data-cell="0"]')).toBe(cube);
    // Changing speed must retain the CSS animation's original assignment time.
    // Moving that origin would make the block disappear before its ant arrives.
    expect(cube.style.getPropertyValue("--pickup-delay")).toBe(
      `${motion.trips[0].at - future.renderAt}ms`,
    );
  });
});
