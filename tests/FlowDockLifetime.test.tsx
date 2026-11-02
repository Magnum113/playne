// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowDocks } from "../src/FlowDocks";
import FlowGame from "../src/FlowGame";
import {
  FLOW_VERSION,
  flowDay,
  initialFlow,
  launchFlow,
  makeFlowPuzzle,
} from "../src/flow";
import { flowAllocateDocks, type FlowDockTeam } from "../src/flowDockLayout";
import { flowMotion } from "../src/flowPresentation";

const fixture = vi.hoisted(() => ({
  version: 4 as const,
  id: "level:1:v4",
  name: "Связанная пара",
  width: 4,
  height: 3,
  // The second half is enclosed until the separate green team opens a path.
  cells: [0, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2],
  lanes: [
    [{ id: 0, color: 0, count: 1, link: "pair-1" }],
    [{ id: 1, color: 1, count: 1, link: "pair-1" }],
    [{ id: 2, color: 2, count: 10 }],
  ],
  slots: 5,
  solution: [0, 2],
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

describe("Рой: linked boxes retain their physical docks", () => {
  it("keeps existing box DOM nodes while closing split holes for a linked pair", async () => {
    const teams: FlowDockTeam[] = [
      { id: 0, color: 0, left: 3, slot: 0 },
      { id: 2, color: 2, left: 5, slot: 2 },
      { id: 4, color: 4, left: 7, slot: 4 },
    ];
    const render = (occupants: FlowDockTeam[]) => (
      <FlowDocks
        teams={occupants}
        count={5}
        working={new Set()}
        launching={new Set()}
        full={false}
        onSlot={() => {}}
      />
    );
    await act(async () => root!.render(render(teams)));
    const originalNodes = teams.map((team) =>
      box.querySelector(`[data-dock-packet="${team.id}"]`),
    );
    expect(originalNodes.every(Boolean)).toBe(true);

    const allocation = flowAllocateDocks(
      teams,
      [
        { id: 5, color: 0, count: 2, link: "new-pair" },
        { id: 6, color: 1, count: 4, link: "new-pair" },
      ],
      5,
    );
    expect(allocation?.slots).toEqual([3, 4]);
    await act(async () => root!.render(render(allocation!.teams)));

    for (const [index, team] of teams.entries()) {
      const occupant = box.querySelector(`[data-dock-packet="${team.id}"]`);
      expect(occupant).toBe(originalNodes[index]);
      expect(occupant?.getAttribute("data-dock-slot")).toBe(String(index));
    }
    const pair = [...box.querySelectorAll('[data-dock-pair="new-pair"]')];
    expect(pair.map((node) => node.getAttribute("data-dock-slot"))).toEqual([
      "3",
      "4",
    ]);
    expect(box.querySelectorAll('[data-dock-link="new-pair"]')).toHaveLength(1);
    expect(
      box.querySelector('[aria-label="Доки: 0 свободно из 5"]'),
    ).not.toBeNull();
  });

  it("decrements on departure, frees a box before its ants return, and accepts a linked pair", async () => {
    await act(async () => root!.render(<FlowGame />));
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1);
    const first = launchFlow(puzzle, initialFlow(puzzle), 2)!;
    const plan = flowMotion(first.events, 1, puzzle, {
      cells: puzzle.cells,
      slots: new Map([[2, 0]]),
    });
    await click("Очередь 3:");
    const firstDeparture = Math.min(...plan.trips.map((t) => t.depart));
    await advance(firstDeparture + 1);
    expect(box.querySelector('[data-dock-packet="2"] text')?.textContent).toBe(
      "9",
    );
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
    const release = Math.max(...plan.trips.map((t) => t.depart)) + 300;
    expect(release).toBeLessThan(
      Math.max(...plan.trips.map((t) => t.deliveryAt)),
    );
    await advance(release - firstDeparture + 1);
    expect(box.querySelector('[data-dock-packet="2"]')).toBeNull();
    expect(box.querySelector("[data-ant-id]")).not.toBeNull();
    await click("Очередь 1:");
    expect(box.querySelector('[data-flight-link="pair-1"]')).not.toBeNull();
    expect(box.querySelectorAll('[data-dock-pair="pair-1"]')).toHaveLength(2);
  });

  it("freezes departures, pickups and delivery while a dialog is open, then resumes", async () => {
    await act(async () => root!.render(<FlowGame />));
    await click("Начать уровень 1");
    await click("Очередь 3:");
    await advance(400);
    await click("Пауза");
    const counter = box.querySelector(
      '[data-dock-packet="2"] text',
    )?.textContent;
    const progress = box
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow");
    expect(box.querySelector(".flow-play")?.getAttribute("data-paused")).toBe(
      "true",
    );
    await advance(10000);
    expect(box.querySelector('[data-dock-packet="2"] text')?.textContent).toBe(
      counter,
    );
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe(progress);
    await click("Продолжить");
    await advance(800);
    expect(
      box.querySelector('[data-dock-packet="2"] text')?.textContent,
    ).not.toBe(counter);
  });

  it("holds an empty half blank before delivery and releases the pair after both finish spawning", async () => {
    await act(async () => root!.render(<FlowGame />));
    await click("Начать уровень 1");
    expect(
      box
        .querySelector('a[aria-label="Вернуться к играм"]')
        ?.getAttribute("href"),
    ).toBe("/");

    const puzzle = makeFlowPuzzle("level", 1);
    const first = launchFlow(puzzle, initialFlow(puzzle), 0)!;
    expect(first.state.lanes).toEqual([1, 1, 0]);
    expect(first.events.map((event) => event.packet)).toEqual([0]);
    const firstTiming = flowMotion(first.events, 1, puzzle, {
      cells: puzzle.cells,
      slots: new Map([
        [0, 0],
        [1, 1],
      ]),
    });
    await click("Очередь 1:");
    expect(box.querySelectorAll(".flow-lane-live")).toHaveLength(1);
    await advance(Math.ceil(firstTiming.trips[0].depart) + 1);
    expect(box.querySelector('[data-dock-packet="0"] text')).toBeNull();
    expect(box.querySelector('[data-dock-packet="1"] text')?.textContent).toBe(
      "1",
    );
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");

    await advance(
      Math.ceil(firstTiming.trips[0].deliveryAt - firstTiming.trips[0].depart) +
        1,
    );
    const pairNodes = [
      ...box.querySelectorAll(".flow-dock-occupant.is-waiting"),
    ];
    expect(pairNodes).toHaveLength(2);
    expect(
      box.querySelector('[data-dock-packet="0"]')?.getAttribute("aria-label"),
    ).toContain("осталось 0");
    expect(
      box.querySelector('[data-dock-packet="1"]')?.getAttribute("aria-label"),
    ).toContain("осталось 1");
    expect(
      box
        .querySelector('[data-dock-packet="0"]')
        ?.classList.contains("is-complete"),
    ).toBe(true);
    expect(box.querySelector('[data-dock-link="pair-1"]')).not.toBeNull();
    expect(
      box.querySelector('[aria-label="Доки: 3 свободно из 5"]'),
    ).not.toBeNull();

    // Settling an animation must not release the delivered half, either.
    await advance(
      Math.ceil(firstTiming.finish - firstTiming.trips[0].deliveryAt) + 1,
    );
    expect(box.querySelector('[data-dock-packet="0"]')).toBe(pairNodes[0]);
    expect(box.querySelector('[data-dock-packet="1"]')).toBe(pairNodes[1]);
    expect(box.querySelector('[data-dock-link="pair-1"]')).not.toBeNull();
    const saved = JSON.parse(
      localStorage.getItem(`playne:flow:v${FLOW_VERSION}:guest`)!,
    );
    expect(saved.active.actions).toEqual([{ type: "launch", lane: 0 }]);

    const second = launchFlow(puzzle, first.state, 2)!;
    expect(second.events.some((event) => event.packet === 1)).toBe(true);
    const secondTiming = flowMotion(second.events, 1, puzzle, {
      cells: first.state.cells,
      slots: new Map([
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    });
    await click("Очередь 3:");
    await advance(Math.ceil(secondTiming.finish) + 1000);

    expect(box.querySelectorAll(".flow-dock-occupant")).toHaveLength(0);
    expect(box.querySelector("[data-dock-link]")).toBeNull();
    expect(box.querySelector(".flow-result")).not.toBeNull();
    const back = [...box.querySelectorAll("a")].find((link) =>
      link.textContent?.includes("← Все игры"),
    );
    expect(back?.getAttribute("href")).toBe("/");
  });
});
