// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowGame from "../src/FlowGame";
import {
  FLOW_VERSION,
  flowDay,
  initialFlow,
  launchFlow,
  makeFlowPuzzle,
} from "../src/flow";
import { flowMotion } from "../src/flowPresentation";

const fixture = vi.hoisted(() => ({
  version: 4 as const,
  id: "level:1:v4",
  name: "Чашка: последние три кубика",
  width: 24,
  height: 24,
  cells: Array.from({ length: 576 }, (_, i) =>
    [278, 279, 280].includes(i) ? 7 : -1,
  ),
  lanes: [[{ id: 0, color: 7, count: 3 }]],
  slots: 5,
  solution: [0],
}));
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/flow", async (original) => ({
  ...(await original<typeof import("../src/flow")>()),
  makeFlowPuzzle: () => fixture,
}));
vi.mock("../src/account", () => ({
  useAuth: () => ({ user: null, loading: false }),
  api: (...args: unknown[]) => mocks.api(...args),
  loginToPlay: vi.fn(),
  AccountNav: () => null,
}));
vi.mock("../src/HeaderStreak", () => ({ default: () => null }));
vi.mock("../src/FooterLinks", () => ({ default: () => null }));

let root: Root | undefined;
let box: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.history.replaceState(null, "", "/swarm/");
  mocks.api.mockImplementation(async (path: string) =>
    path === "/flow/progress"
      ? { day: flowDay(), records: {} }
      : path === "/flow/leaderboard"
        ? { day: flowDay(), total: 0, entries: [] }
        : { saved: true },
  );
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  box.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function click(label: string) {
  const target = [...box.querySelectorAll("button")].find(
    (button) =>
      button.getAttribute("aria-label")?.startsWith(label) ||
      button.textContent?.includes(label),
  );
  expect(target, `Button ${label} should exist`).toBeDefined();
  expect(target!.disabled).toBe(false);
  await act(async () => target!.click());
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Рой: последние три кубика", () => {
  it("sends the last three adjacent black cubes as one wave before the first ant returns", async () => {
    await act(async () => root!.render(<FlowGame />));
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1),
      first = launchFlow(puzzle, initialFlow(puzzle), 0)!;
    const plan = flowMotion(first.events, 1, puzzle, {
      cells: puzzle.cells,
      slots: new Map([[0, 0]]),
    });
    await click("Очередь 1:");
    const lastDeparture = Math.max(...plan.trips.map((trip) => trip.depart));
    expect(lastDeparture).toBeLessThan(
      Math.min(...plan.trips.map((trip) => trip.at)),
    );
    await advance(lastDeparture + 1);
    expect(box.querySelectorAll("[data-ant-id]")).toHaveLength(3);
    expect(box.querySelector('[data-dock-packet="0"] text')).toBeNull();
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
    await advance(Math.ceil(plan.finish - lastDeparture) + 1);
    expect(box.querySelector(".flow-result")).not.toBeNull();
    expect(box.querySelectorAll("[data-ant-id]")).toHaveLength(0);
  });
});
