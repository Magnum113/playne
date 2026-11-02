// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowGame from "../src/FlowGame";
import {
  FLOW_COLORS,
  FLOW_VERSION,
  flowDay,
  flowFrontier,
  flowLaunchPackets,
  makeFlowPuzzle,
} from "../src/flow";
import { flowMotion, flowRetimeMotion } from "../src/flowPresentation";
import {
  initialFlow,
  launchFlow,
  replayFlow,
  type FlowAction,
  type FlowPuzzle,
  type FlowState,
} from "../src/flow";
import { FlowAudio } from "../src/flowAudio";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  login: vi.fn(),
  user: null as { id: string; nickname: string } | null,
}));
vi.mock("../src/account", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
  api: (...args: unknown[]) => mocks.api(...args),
  loginToPlay: (...args: unknown[]) => mocks.login(...args),
  AccountNav: () => null,
}));
vi.mock("../src/HeaderStreak", () => ({ default: () => null }));
vi.mock("../src/FooterLinks", () => ({ default: () => null }));
let root: Root, box: HTMLDivElement;
const storageKey = (scope = "guest") => `playne:flow:v${FLOW_VERSION}:${scope}`;
const button = (text: string) =>
  [...box.querySelectorAll("button")].find(
    (b) =>
      b.getAttribute("aria-label")?.startsWith(text) ||
      b.textContent?.includes(text),
  )!;
async function mount() {
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  await act(async () => {
    root.render(<FlowGame />);
  });
}
async function click(text: string) {
  await act(async () => {
    button(text).click();
  });
}
function animate() {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}
function expectSettledBoard(puzzle: FlowPuzzle, actions: FlowAction[]) {
  const expected = replayFlow(puzzle, actions).state;
  const visible = [...box.querySelectorAll(".flow-cube[data-cell]")]
    .map((cube) => Number(cube.getAttribute("data-cell")))
    .sort((a, b) => a - b);
  expect(visible).toEqual(
    expected.cells.flatMap((color, cell) => (color >= 0 ? [cell] : [])),
  );
  expect(
    Number(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ),
  ).toBe(
    Math.round(
      (expected.collected / puzzle.cells.filter((color) => color >= 0).length) *
        100,
    ),
  );
  expect(
    box.querySelector(
      `[aria-label="Доки: ${puzzle.slots - expected.active.length} свободно из ${puzzle.slots}"]`,
    ),
  ).not.toBeNull();
  expect(box.querySelectorAll("[data-trip]")).toHaveLength(0);
}
function waitingScenario() {
  for (let level = 1; level <= 36; level++) {
    const puzzle = makeFlowPuzzle("level", level);
    for (let firstLane = 0; firstLane < puzzle.lanes.length; firstLane++) {
      const first = launchFlow(puzzle, initialFlow(puzzle), firstLane);
      if (!first) continue;
      for (const waiting of first.state.active) {
        for (let nextLane = 0; nextLane < puzzle.lanes.length; nextLane++) {
          const next = launchFlow(puzzle, first.state, nextLane);
          if (next?.events.some((event) => event.packet === waiting.id))
            return { level, puzzle, firstLane, nextLane, first, next, waiting };
        }
      }
    }
  }
  throw Error("No waiting-team recovery scenario in campaign");
}
function saveAttempt(level: number, actions: FlowAction[] = []) {
  localStorage.setItem(
    storageKey(),
    JSON.stringify({
      version: FLOW_VERSION,
      records: {},
      pending: [],
      motion: true,
      active: {
        id: crypto.randomUUID(),
        version: FLOW_VERSION,
        kind: "level",
        key: String(level),
        actions,
      },
    }),
  );
}
function linkedScenario() {
  for (let level = 13; level <= 36; level++) {
    const puzzle = makeFlowPuzzle("level", level);
    for (let index = 4; index < puzzle.solution.length; index++) {
      const prefix: FlowAction[] = puzzle.solution
        .slice(0, index)
        .map((lane) => ({ type: "launch", lane }));
      const state = replayFlow(puzzle, prefix).state;
      const lane = puzzle.solution[index];
      const group = flowLaunchPackets(puzzle, state, lane);
      if (group?.length !== 2 || state.active.length) continue;
      // Four independent, logically completed launches can still occupy four
      // visible docks while their ants carry cubes home.
      const earlier = prefix.slice(0, -4);
      let trial = replayFlow(puzzle, earlier).state;
      if (trial.active.length) continue;
      let singles = true;
      for (const nextLane of puzzle.solution.slice(index - 4, index)) {
        if (flowLaunchPackets(puzzle, trial, nextLane)?.length !== 1) {
          singles = false;
          break;
        }
        trial = launchFlow(puzzle, trial, nextLane)!.state;
        if (trial.active.length) singles = false;
      }
      if (singles)
        return { level, puzzle, prefix, earlier, state, lane, group };
    }
  }
  throw Error("No linked pair with four preceding single launches");
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.user = null;
  window.history.replaceState(null, "", "/swarm/");
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.api.mockImplementation(async (path: string) =>
    path === "/flow/progress"
      ? { day: flowDay(), records: {} }
      : path === "/flow/leaderboard"
        ? { day: flowDay(), total: 0, entries: [] }
        : { saved: true },
  );
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  box?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Рой: complete player journeys", () => {
  it("synchronizes scene audio with walking, pickup and delivery, and keeps open dialogs quiet", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const play = vi
      .spyOn(FlowAudio.prototype, "play")
      .mockImplementation(() => {});
    await mount();
    await click("Начать уровень 1");
    const p = makeFlowPuzzle("level", 1),
      lane = p.solution[0];
    const timing = flowMotion(
      launchFlow(p, initialFlow(p), lane)!.events,
      1,
      p,
    );
    await click(`Очередь ${lane + 1}:`);
    play.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(timing.trips[0].at + 1);
    });
    expect(play.mock.calls.some(([kind]) => kind === "step")).toBe(true);
    expect(play.mock.calls.some(([kind]) => kind === "pickup")).toBe(true);
    expect(play.mock.calls.some(([kind]) => kind === "collect")).toBe(false);
    await click("Пауза");
    play.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(play).not.toHaveBeenCalled();
    await click("Продолжить игру");
    play.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(timing.finish);
    });
    expect(play.mock.calls.some(([kind]) => kind === "carry")).toBe(true);
    expect(play.mock.calls.some(([kind]) => kind === "collect")).toBe(true);
  });

  it.each(["Анимации", "К меню"])(
    "cancels future footsteps after %s during a wave",
    async (choice) => {
      vi.useFakeTimers();
      vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      const play = vi
        .spyOn(FlowAudio.prototype, "play")
        .mockImplementation(() => {});
      const cancel = vi.spyOn(FlowAudio.prototype, "cancel");
      await mount();
      await click("Начать уровень 1");
      await click(`Очередь ${makeFlowPuzzle("level", 1).solution[0] + 1}:`);
      await click("Пауза");
      await click(choice);
      expect(cancel).toHaveBeenCalled();
      if (choice === "Анимации") await click("Продолжить игру");
      play.mockClear();
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });
      expect(play).not.toHaveBeenCalled();
    },
  );

  it("disabling animations after a finished wave keeps the next instant move's board, progress and docks current", async () => {
    animate();
    await mount();
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1);
    const firstWave = flowMotion(
      launchFlow(puzzle, initialFlow(puzzle), puzzle.solution[0])!.events,
      1,
      puzzle,
      {
        cells: puzzle.cells,
        slots: new Map([[puzzle.lanes[puzzle.solution[0]][0].id, 0]]),
      },
    );
    await click(`Очередь ${puzzle.solution[0] + 1}:`);
    await act(async () => {
      vi.advanceTimersByTime(firstWave.finish + 1);
    });
    expectSettledBoard(puzzle, [{ type: "launch", lane: puzzle.solution[0] }]);
    await click("Пауза");
    await click("Анимации");
    await click("Продолжить игру");
    await click(`Очередь ${puzzle.solution[1] + 1}:`);
    const actions = JSON.parse(localStorage.getItem(storageKey())!).active
      .actions;
    expect(actions).toEqual(
      puzzle.solution.slice(0, 2).map((lane) => ({ type: "launch", lane })),
    );
    expectSettledBoard(puzzle, actions);
  });

  it("switching reduced motion on during a wave clears its presentation before subsequent instant moves", async () => {
    animate();
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    };
    vi.stubGlobal("matchMedia", (query: string) =>
      query === "(prefers-reduced-motion: reduce)"
        ? media
        : {
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
    );
    await mount();
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1);
    await click(`Очередь ${puzzle.solution[0] + 1}:`);
    await act(async () => vi.advanceTimersByTime(300));
    expect(box.querySelector("[data-trip]")).not.toBeNull();
    await act(async () => {
      media.matches = true;
      for (const listener of listeners) listener();
    });
    expectSettledBoard(puzzle, [{ type: "launch", lane: puzzle.solution[0] }]);
    await click(`Очередь ${puzzle.solution[1] + 1}:`);
    expectSettledBoard(
      puzzle,
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    );
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expectSettledBoard(
      puzzle,
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    );
  });

  it("appends a second command while workers walk without restarting existing ants", async () => {
    animate();
    await mount();
    await click("Начать уровень 1");
    const p = makeFlowPuzzle("level", 1),
      lane = p.solution[0],
      events = launchFlow(p, initialFlow(p), lane)!.events,
      timing = flowMotion(events, 1, p, {
        cells: p.cells,
        slots: new Map([[p.lanes[lane][0].id, 0]]),
      });
    await click(`Очередь ${lane + 1}:`);
    await act(async () => vi.advanceTimersByTime(300));
    const oldAnt = box.querySelector<SVGGElement>('[data-trip="outbound"]')!;
    const oldDelay = oldAnt.style.getPropertyValue("--walk-delay");
    const visible = box.querySelectorAll('[data-trip="outbound"]').length;
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(events.length);
    expect(box.querySelectorAll('[data-trip="return"]')).toHaveLength(visible);
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
    const nextLane = p.solution.find((candidate) => candidate !== lane)!;
    expect(button(`Очередь ${nextLane + 1}:`).disabled).toBe(false);
    await click(`Очередь ${nextLane + 1}:`);
    const nextResult = replayFlow(p, [
      { type: "launch", lane },
      { type: "launch", lane: nextLane },
    ]);
    const appended = flowMotion(nextResult.events, 1, p, {
      now: 300,
      trips: timing.trips,
      cells: p.cells,
      slots: new Map([
        [p.lanes[lane][0].id, 0],
        [p.lanes[nextLane][0].id, 1],
      ]),
    });
    expect(oldAnt.isConnected).toBe(true);
    expect(oldAnt.style.getPropertyValue("--walk-delay")).toBe(oldDelay);
    await act(async () => vi.advanceTimersByTime(300));
    expect(
      box.querySelectorAll('[data-trip="outbound"]').length,
    ).toBeGreaterThan(visible);
    expect(
      box.querySelector(
        `[data-trip="outbound"][data-packet="${p.lanes[nextLane][0].id}"]`,
      ),
    ).not.toBeNull();
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual([
      { type: "launch", lane },
      { type: "launch", lane: nextLane },
    ]);
    await act(async () => {
      vi.advanceTimersByTime(timing.deliveries[3].at + 1);
    });
    expect(
      Number(
        box
          .querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow"),
      ),
    ).toBeGreaterThan(0);
    expect(box.querySelector(".flow-dock.is-working")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(appended.finish + 1);
    });
    expect(
      [...box.querySelectorAll<HTMLButtonElement>(".flow-launch")].some(
        (command) => !command.disabled,
      ),
    ).toBe(true);
    expect(box.querySelector(".flow-dock.is-working")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toHaveLength(2);
    expect(
      [...box.querySelectorAll("button")].some((b) =>
        /звук/i.test(b.textContent ?? ""),
      ),
    ).toBe(false);
  });
  it("enables x2 during a walking wave and delivers every cube on the accelerated clock", async () => {
    animate();
    await mount();
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1),
      lane = puzzle.solution[0];
    const actions: FlowAction[] = [{ type: "launch", lane }];
    const events = replayFlow(puzzle, actions).events;
    const normal = flowMotion(events, 1, puzzle, {
      cells: puzzle.cells,
      slots: new Map([[puzzle.lanes[lane][0].id, 0]]),
    });
    expect(button("Ускорить анимации").textContent).toContain("×2");
    await click(`Очередь ${lane + 1}:`);
    await act(async () => vi.advanceTimersByTime(1000));
    const ant = box.querySelector<SVGGElement>('[data-trip="outbound"]')!;
    const duration = parseFloat(ant.style.getPropertyValue("--walk-duration"));
    expect(button("Ускорить анимации").disabled).toBe(false);
    await click("Ускорить анимации");
    expect(button("Обычная скорость").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(button("Обычная скорость").textContent).toContain("×2");
    expect(ant.isConnected).toBe(true);
    expect(parseFloat(ant.style.getPropertyValue("--walk-duration"))).toBe(
      duration / 2,
    );
    const fast = flowRetimeMotion(normal, 1000, 1, 2);
    expect(fast.finish).toBeLessThan(normal.finish);
    await act(async () =>
      vi.advanceTimersByTime(Math.ceil(fast.finish - 1000) + 2),
    );
    expectSettledBoard(puzzle, actions);
    // The old slow callbacks must be gone, with no duplicate deliveries later.
    await act(async () => vi.advanceTimersByTime(normal.finish));
    expectSettledBoard(puzzle, actions);
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual(actions);
  });
  it("can switch back after pickups and deliveries without repeating them or changing the journal", async () => {
    animate();
    await mount();
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1),
      lane = puzzle.solution[0];
    const actions: FlowAction[] = [{ type: "launch", lane }];
    const normal = flowMotion(replayFlow(puzzle, actions).events, 1, puzzle, {
      cells: puzzle.cells,
      slots: new Map([[puzzle.lanes[lane][0].id, 0]]),
    });
    await click(`Очередь ${lane + 1}:`);
    const now =
      Math.ceil(
        [...normal.trips].sort((a, b) => a.deliveryAt - b.deliveryAt)[1]
          .deliveryAt,
      ) + 1;
    await act(async () => vi.advanceTimersByTime(now));
    const before = box
      .querySelector('[role="progressbar"]')!
      .getAttribute("aria-valuenow");
    expect(Number(before)).toBeGreaterThan(0);
    await click("Ускорить анимации");
    const fast = flowRetimeMotion(normal, now, 1, 2);
    await act(async () => vi.advanceTimersByTime(100));
    await click("Обычная скорость");
    expect(button("Ускорить анимации").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(button("Ускорить анимации").textContent).toContain("×2");
    const slowAgain = flowRetimeMotion(fast, now + 100, 2, 1);
    await act(async () =>
      vi.advanceTimersByTime(Math.ceil(slowAgain.finish - now - 100) + 2),
    );
    expectSettledBoard(puzzle, actions);
    await act(async () => vi.advanceTimersByTime(normal.finish));
    expectSettledBoard(puzzle, actions);
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual(actions);
  });
  it("reserves five physical docks and frees a completed source while its ants still walk", async () => {
    animate();
    await mount();
    await click("Начать уровень 1");
    const puzzle = makeFlowPuzzle("level", 1);
    let state: FlowState = initialFlow(puzzle);
    let timing = flowMotion([], 1, puzzle);
    const slots = new Map<number, number>();
    for (const [slot, lane] of puzzle.solution.slice(0, 5).entries()) {
      const packet = puzzle.lanes[lane][state.lanes[lane]];
      slots.set(packet.id, slot);
      const next = launchFlow(puzzle, state, lane)!;
      timing = flowMotion(next.events, 1, puzzle, {
        now: 0,
        trips: timing.trips,
        slots,
        cells: puzzle.cells,
      });
      state = next.state;
      await click(`Очередь ${lane + 1}:`);
    }
    expect(
      box.querySelector('[aria-label="Доки: 0 свободно из 5"]'),
    ).not.toBeNull();
    expect(
      [...box.querySelectorAll<HTMLButtonElement>(".flow-launch")].every(
        (command) => command.disabled,
      ),
    ).toBe(true);
    const before = JSON.parse(localStorage.getItem(storageKey())!).active
      .actions;
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    });
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual(before);
    const completions = [...slots.keys()]
      .map((packet) =>
        Math.max(
          ...timing.trips
            .filter((trip) => trip.packet === packet)
            .map((trip) => trip.depart + 300),
        ),
      )
      .sort((a, b) => a - b);
    expect(completions[0]).toBeLessThan(completions.at(-1)!);
    await act(async () => {
      vi.advanceTimersByTime(completions[0] + 1);
    });
    expect(box.querySelectorAll(".flow-dock-occupant").length).toBeLessThan(5);
    expect(box.querySelectorAll(".flow-dock-occupant").length).toBeGreaterThan(
      0,
    );
    expect(box.querySelector('[data-trip="outbound"]')).not.toBeNull();
    expect(button("Ускорить анимации").disabled).toBe(false);
    const nextLane = puzzle.solution[5];
    expect(button(`Очередь ${nextLane + 1}:`).disabled).toBe(false);
    await click(`Очередь ${nextLane + 1}:`);
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toHaveLength(6);
  });
  it("automatically sends a waiting team when a new colour opens its cubes", async () => {
    animate();
    const scenario = waitingScenario();
    localStorage.setItem(
      storageKey(),
      JSON.stringify({
        version: FLOW_VERSION,
        records: {},
        pending: [],
        motion: true,
        active: {
          id: crypto.randomUUID(),
          version: FLOW_VERSION,
          kind: "level",
          key: String(scenario.level),
          actions: [{ type: "launch", lane: scenario.firstLane }],
        },
      }),
    );
    await mount();
    await click(`Продолжить уровень ${scenario.level}`);
    expect(box.querySelectorAll('[data-trip="outbound"]')).toHaveLength(0);
    expect(box.querySelector(".flow-wait-dots")).toBeNull();
    await click(`Очередь ${scenario.nextLane + 1}:`);
    const expected = scenario.next.events.filter(
      (event) => event.packet === scenario.waiting.id,
    ).length;
    expect(expected).toBeGreaterThan(0);
    const timing = flowMotion(scenario.next.events, 1, scenario.puzzle, {
      cells: scenario.first.state.cells,
      slots: new Map([
        [scenario.waiting.id, 0],
        [
          scenario.puzzle.lanes[scenario.nextLane][
            scenario.first.state.lanes[scenario.nextLane]
          ].id,
          1,
        ],
      ]),
    });
    const firstDeparture = Math.min(
      ...timing.trips
        .filter((trip) => trip.packet === scenario.waiting.id)
        .map((trip) => trip.depart),
    );
    await act(async () => vi.advanceTimersByTime(firstDeparture + 80));
    expect(
      box.querySelectorAll(
        `[data-trip="outbound"][data-packet="${scenario.waiting.id}"]`,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toHaveLength(2);
  });
  it("draws an already linked pair immediately on resume and removes its bridges when starting an unlinked level", async () => {
    const puzzle = makeFlowPuzzle("level", 13);
    const prefix: FlowAction[] = puzzle.solution
      .slice(0, 5)
      .map((lane) => ({ type: "launch", lane }));
    const state = replayFlow(puzzle, prefix).state;
    const pair = flowLaunchPackets(puzzle, state, puzzle.solution[5]);
    expect(pair?.map((item) => item.lane).sort()).toEqual([0, 3]);
    saveAttempt(13, prefix);
    await mount();
    await click("Продолжить уровень 13");
    const bridges = box.querySelectorAll(".flow-queue-links path");
    expect(bridges).toHaveLength(2);
    expect(bridges[0].getAttribute("d")).toMatch(/^M.+[LV]/);
    expect(bridges[1].getAttribute("d")).toBe(bridges[0].getAttribute("d"));
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual(prefix);
    await click("Пауза");
    await click("К меню");
    await click("Уровень 1.");
    expect(box.querySelector(".flow-supply")).not.toBeNull();
    expect(box.querySelectorAll(".flow-queue-links path")).toHaveLength(0);
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active,
    ).toMatchObject({ key: "1", actions: [] });
  });
  it("launches both linked fronts with one recorded action and reserves two visible docks", async () => {
    animate();
    const { level, puzzle, prefix, state, lane, group } = linkedScenario();
    saveAttempt(level, prefix);
    await mount();
    await click(`Продолжить уровень ${level}`);
    expect(
      box.querySelector('[aria-label="Доки: 5 свободно из 5"]'),
    ).not.toBeNull();
    for (const item of group)
      expect(
        button(`Очередь ${item.lane + 1}:`).getAttribute("data-flow-packet"),
      ).toBe(String(item.packet.id));
    await click(`Очередь ${lane + 1}:`);
    const saved = JSON.parse(localStorage.getItem(storageKey())!).active
      .actions;
    expect(saved).toEqual([...prefix, { type: "launch", lane }]);
    expect(
      box.querySelector('[aria-label="Доки: 3 свободно из 5"]'),
    ).not.toBeNull();
    expect(box.querySelectorAll(".flow-dock.is-waiting")).toHaveLength(2);
    await act(async () => vi.advanceTimersByTime(300));
    for (const item of group) {
      const promoted = puzzle.lanes[item.lane][state.lanes[item.lane] + 1];
      expect(
        button(`Очередь ${item.lane + 1}`)?.getAttribute("data-flow-packet") ??
          null,
      ).toBe(promoted ? String(promoted.id) : null);
      expect(
        box.querySelector(
          `[data-trip="outbound"][data-packet="${item.packet.id}"]`,
        ),
      ).not.toBeNull();
    }
  });
  it("blocks a linked pair when only one visual dock is free even though logical teams have finished", async () => {
    animate();
    const { level, puzzle, prefix, earlier, lane, group } = linkedScenario();
    saveAttempt(level, earlier);
    await mount();
    await click(`Продолжить уровень ${level}`);
    for (const action of prefix.slice(earlier.length)) {
      if (action.type === "launch") await click(`Очередь ${action.lane + 1}:`);
    }
    const before = JSON.parse(localStorage.getItem(storageKey())!).active
      .actions;
    expect(replayFlow(puzzle, before).state.active).toHaveLength(0);
    expect(
      flowLaunchPackets(puzzle, replayFlow(puzzle, before).state, lane),
    ).toHaveLength(2);
    expect(
      box.querySelector('[aria-label="Доки: 1 свободно из 5"]'),
    ).not.toBeNull();
    for (const item of group)
      expect(button(`Очередь ${item.lane + 1}:`).disabled).toBe(true);
    await click(`Очередь ${lane + 1}:`);
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: String(lane + 1) }),
      );
    });
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual(before);
  });
  it("conceals a future mystery command in both queue views and reveals its colour and count at the front", async () => {
    let scenario:
      { level: number; puzzle: FlowPuzzle; lane: number } | undefined;
    for (let level = 7; level <= 12 && !scenario; level++) {
      const puzzle = makeFlowPuzzle("level", level);
      const lane = puzzle.lanes.findIndex((queue) => queue[1]?.mystery);
      if (lane >= 0) scenario = { level, puzzle, lane };
    }
    expect(scenario).toBeDefined();
    const { level, puzzle, lane } = scenario!;
    const mystery = puzzle.lanes[lane][1],
      paint = FLOW_COLORS[mystery.color];
    saveAttempt(level);
    await mount();
    await click(`Продолжить уровень ${level}`);
    const future = box.querySelector(
      `.flow-queue-packet[data-flow-packet="${mystery.id}"]`,
    )!;
    expect(future.getAttribute("aria-label")).toBe("Скрытая команда");
    expect(future.querySelector("text")?.textContent).toBe("?");
    expect(future.innerHTML).not.toContain(paint.hex);
    await click("Все команды");
    const hidden = box
      .querySelectorAll(".flow-queue-list section")
      [lane].querySelectorAll("li")[1];
    expect(hidden.textContent).toContain("?");
    expect(hidden.textContent).toContain("Скрытая команда");
    expect(hidden.textContent).not.toContain(paint.name);
    expect(hidden.textContent).not.toContain(String(mystery.count));
    expect(hidden.getAttribute("style")).not.toContain(paint.hex);
    await click("Вернуться к игре");
    await click(`Очередь ${lane + 1}:`);
    const front = box.querySelector<HTMLButtonElement>(
      `.flow-launch[data-flow-packet="${mystery.id}"]`,
    )!;
    expect(front).not.toBeNull();
    expect(front.getAttribute("aria-label")).toContain(paint.name);
    expect(front.getAttribute("aria-label")).toContain(
      `${mystery.count} кубиков`,
    );
    expect(front.querySelector("text")?.textContent).toBe(
      String(mystery.count),
    );
    await click("Все команды");
    const revealed = box
      .querySelectorAll(".flow-queue-list section")
      [lane].querySelector("li")!;
    expect(revealed.textContent).toContain(paint.name);
    expect(revealed.textContent).toContain(String(mystery.count));
    expect(revealed.textContent).not.toContain("Скрытая команда");
  });
  it("reveals hidden board cells when their edge opens and displays the entire unmasked picture after winning", async () => {
    let scenario:
      | { level: number; puzzle: FlowPuzzle; index: number; cell: number }
      | undefined;
    for (let level = 21; level <= 36 && !scenario; level++) {
      const puzzle = makeFlowPuzzle("level", level);
      let state = initialFlow(puzzle);
      for (const [index, lane] of puzzle.solution.entries()) {
        const frontier = new Set(flowFrontier(puzzle, state.cells));
        const next = launchFlow(puzzle, state, lane)!;
        const opened = new Set(flowFrontier(puzzle, next.state.cells));
        const cell = puzzle.hiddenCells?.find(
          (at) =>
            state.cells[at] >= 0 &&
            !frontier.has(at) &&
            next.state.cells[at] >= 0 &&
            opened.has(at),
        );
        if (cell !== undefined) {
          scenario = { level, puzzle, index, cell };
          break;
        }
        state = next.state;
      }
    }
    expect(scenario).toBeDefined();
    const { level, puzzle, index, cell } = scenario!;
    saveAttempt(
      level,
      puzzle.solution.slice(0, index).map((lane) => ({ type: "launch", lane })),
    );
    await mount();
    await click(`Продолжить уровень ${level}`);
    expect(
      box
        .querySelector(`.flow-cube[data-cell="${cell}"]`)
        ?.getAttribute("data-concealed"),
    ).toBe("true");
    await click(`Очередь ${puzzle.solution[index] + 1}:`);
    const opened = box.querySelector(`.flow-cube[data-cell="${cell}"]`)!;
    expect(opened).not.toBeNull();
    expect(opened.hasAttribute("data-concealed")).toBe(false);
    expect(opened.querySelector("text")).toBeNull();
    for (const lane of puzzle.solution.slice(index + 1))
      await click(`Очередь ${lane + 1}:`);
    expect(box.textContent).toContain("Готово!");
    expect(box.querySelectorAll(".flow-cube[data-cell]")).toHaveLength(
      puzzle.cells.filter((color) => color >= 0).length,
    );
    expect(box.querySelectorAll(".flow-cube[data-concealed]")).toHaveLength(0);
    for (const at of puzzle.hiddenCells ?? [])
      expect(
        box
          .querySelector(`.flow-cube[data-cell="${at}"] rect:nth-child(2)`)
          ?.getAttribute("fill"),
      ).toBe(FLOW_COLORS[puzzle.cells[at]].hex);
  }, 15000);
  it("removes the hint control, loading dots and the H shortcut", async () => {
    await mount();
    await click("Начать уровень 1");
    expect(button("Подсказка")).toBeUndefined();
    expect(box.querySelector(".flow-wait-dots")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "р" }));
    });
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toEqual([]);
    expect(box.textContent).toContain("1000 / 1000");
    expect(box.querySelectorAll(".flow-toolbar > button")).toHaveLength(3);
  });
  it("finishes the first full puzzle, persists stars, posts a replay and unlocks the next level", async () => {
    await mount();
    expect(button("Уровень 2.").disabled).toBe(true);
    await click("Уровень 1.");
    for (const lane of makeFlowPuzzle("level", 1).solution)
      await click(`Очередь ${lane + 1}:`);
    expect(box.textContent).toContain("Готово!");
    expect(box.textContent).toContain("1000");
    expect(mocks.api).toHaveBeenCalledWith(
      "/flow/finish",
      "POST",
      expect.objectContaining({
        kind: "level",
        key: "1",
        actions: expect.any(Array),
      }),
    );
    const saved = JSON.parse(localStorage.getItem(storageKey())!);
    expect(saved.records["level:1"]).toEqual({ score: 1000, stars: 3 });
    expect(saved.pending).toEqual([]);
    await click("Следующий уровень");
    expect(box.textContent).toContain("Уровень 2 — Рой");
  }, 15000);
  it("opens a friend's locked level directly, compares the same board and preserves campaign progress", async () => {
    const token = "f".repeat(43);
    window.history.replaceState(null, "", `/swarm/?challenge=${token}`);
    const normal = JSON.stringify({
      version: FLOW_VERSION,
      records: { "level:1": { score: 900, stars: 2 } },
      pending: [],
      active: { id: crypto.randomUUID(), kind: "level", key: "2", actions: [] },
    });
    localStorage.setItem(storageKey(), normal);
    mocks.api.mockImplementation(async (path: string) =>
      path === `/challenges/${token}`
        ? {
            token,
            game: "flow",
            gameName: "Рой",
            nickname: "Друг",
            score: 1000,
            maxScore: 1000,
            day: flowDay(),
            mode: "practice",
            isTodayDaily: false,
            flow: { version: FLOW_VERSION, kind: "level", key: "12", stars: 3 },
          }
        : { saved: true },
    );
    await mount();
    expect(box.textContent).toContain("Вызов от Друг");
    expect(box.textContent).toContain("Уровень 12");
    expect(mocks.api).not.toHaveBeenCalledWith("/flow/progress");
    await click("Принять вызов");
    for (const lane of makeFlowPuzzle("level", 12).solution)
      await click(`Очередь ${lane + 1}:`);
    expect(box.textContent).toContain("Ничья!");
    expect(box.querySelector(".challenge-scores-flow")).not.toBeNull();
    expect(box.querySelector(".flow-challenge-share canvas")).not.toBeNull();
    expect(box.textContent).toContain("Бросить вызов");
    expect(box.textContent).not.toContain("Следующий уровень");
    expect(mocks.api).toHaveBeenCalledWith(
      "/flow/finish",
      "POST",
      expect.objectContaining({
        challengeToken: token,
        kind: "level",
        key: "12",
        version: FLOW_VERSION,
      }),
    );
    expect(localStorage.getItem(storageKey())).toBe(normal);
    const isolated = JSON.parse(
      localStorage.getItem(storageKey(`challenge:${token}:guest`))!,
    );
    expect(isolated.records).toEqual({});
    expect(isolated.pending).toEqual([]);
    await act(async () => root.unmount());
    box.remove();
    await mount();
    await click("Посмотреть результат");
    expect(box.textContent).toContain("Ничья!");
    expect(localStorage.getItem(storageKey())).toBe(normal);
  }, 15000);
  it("moves an offline guest challenge result to the signed-in account without losing it or copying it to another account", async () => {
    const token = "g".repeat(43);
    window.history.replaceState(null, "", `/swarm/?challenge=${token}`);
    const campaign = JSON.stringify({
      version: FLOW_VERSION,
      records: { "level:1": { score: 900, stars: 2 } },
      pending: [],
      active: null,
    });
    localStorage.setItem(storageKey(), campaign);
    mocks.api.mockImplementation(async (path: string) => {
      if (path === `/challenges/${token}`)
        return {
          token,
          game: "flow",
          gameName: "Рой",
          nickname: "Друг",
          score: 1000,
          maxScore: 1000,
          day: flowDay(),
          mode: "practice",
          isTodayDaily: false,
          flow: { version: FLOW_VERSION, kind: "level", key: "1", stars: 3 },
        };
      if (path === "/flow/finish" && !mocks.user) throw Error("offline");
      return { saved: true };
    });
    await mount();
    await click("Принять вызов");
    for (const lane of makeFlowPuzzle("level", 1).solution)
      await click(`Очередь ${lane + 1}:`);
    expect(box.textContent).toContain("Ничья!");
    expect(box.textContent).toContain("Отправим, когда появится связь");
    const guestKey = storageKey(`challenge:${token}:guest`);
    const guest = JSON.parse(localStorage.getItem(guestKey)!);
    expect(guest.pending).toHaveLength(1);
    mocks.user = { id: "account-one", nickname: "Игрок" };
    await act(async () => root.render(<FlowGame />));
    await click("Посмотреть результат");
    expect(box.textContent).toContain("Ничья!");
    expect(box.textContent).toContain("Сохранено в аккаунте");
    const account = JSON.parse(
      localStorage.getItem(storageKey(`challenge:${token}:account-one`))!,
    );
    expect(account.active).toEqual(guest.active);
    expect(account.pending).toEqual([]);
    expect(account.records).toEqual({});
    expect(JSON.parse(localStorage.getItem(guestKey)!).active).toBeNull();
    expect(JSON.parse(localStorage.getItem(guestKey)!).pending).toEqual([]);
    expect(localStorage.getItem(storageKey())).toBe(campaign);
    mocks.user = { id: "account-two", nickname: "Другой игрок" };
    await act(async () => root.render(<FlowGame />));
    expect(button("Принять вызов")).toBeDefined();
    expect(box.textContent).not.toContain("Посмотреть результат");
    expect(localStorage.getItem(storageKey())).toBe(campaign);
  }, 15000);
  it.each([2, 3] as const)(
    "replays an old version %s challenge with its original board and sends its original version",
    async (version) => {
      const token = "v".repeat(43);
      const legacy = makeFlowPuzzle("level", 1, version);
      window.history.replaceState(null, "", `/swarm/?challenge=${token}`);
      mocks.api.mockImplementation(async (path: string) =>
        path === `/challenges/${token}`
          ? {
              token,
              game: "flow",
              gameName: "Рой",
              nickname: "Друг",
              score: 1000,
              maxScore: 1000,
              day: flowDay(),
              mode: "practice",
              isTodayDaily: false,
              flow: { version, kind: "level", key: "1", stars: 3 },
            }
          : { saved: true },
      );
      await mount();
      await click("Принять вызов");
      expect(box.querySelectorAll(".flow-cube")).toHaveLength(
        legacy.cells.filter((cell) => cell >= 0).length,
      );
      for (const lane of legacy.solution) await click(`Очередь ${lane + 1}:`);
      expect(box.textContent).toContain("Ничья!");
      expect(mocks.api).toHaveBeenCalledWith(
        "/flow/finish",
        "POST",
        expect.objectContaining({ version, challengeToken: token }),
      );
      expect(
        JSON.parse(
          localStorage.getItem(storageKey(`challenge:${token}:guest`))!,
        ).active.version,
      ).toBe(version);
    },
    15000,
  );
  it("restores an unfinished game and undoes an actual launch", async () => {
    const id = crypto.randomUUID(),
      lane = makeFlowPuzzle("level", 1).solution[0];
    localStorage.setItem(
      storageKey(),
      JSON.stringify({
        version: FLOW_VERSION,
        records: {},
        pending: [],
        active: {
          id,
          kind: "level",
          key: "1",
          actions: [{ type: "launch", lane }],
        },
      }),
    );
    await mount();
    await click("Продолжить уровень 1");
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).not.toBe("0");
    await click("Отмена");
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
    expect(box.textContent).toContain("980 / 1000");
  });
  it("keeps a completed attempt queued while offline and allows more levels", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === "/flow/finish") throw Error("offline");
      return { day: flowDay(), records: {} };
    });
    await mount();
    await click("Уровень 1.");
    for (const lane of makeFlowPuzzle("level", 1).solution)
      await click(`Очередь ${lane + 1}:`);
    expect(box.textContent).toContain("Отправим, когда появится связь");
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).pending,
    ).toHaveLength(1);
    await click("Следующий уровень");
    expect(box.textContent).toContain("Уровень 2 — Рой");
  }, 15000);
  it("daily challenge is available immediately and is distinct from the campaign", async () => {
    window.history.replaceState(null, "", "/swarm/?mode=daily");
    await mount();
    await click("Начать испытание");
    const saved = JSON.parse(localStorage.getItem(storageKey())!);
    expect(saved.active).toMatchObject({ kind: "daily", key: flowDay() });
    expect(box.querySelectorAll(".flow-launch")).toHaveLength(
      makeFlowPuzzle("daily", flowDay()).lanes.length,
    );
    expect(box.querySelector(".flow-leaderboard")).toBeNull();
  });
  it("resumes today's attempt from the daily landing without losing moves", async () => {
    window.history.replaceState(null, "", "/swarm/?mode=daily");
    const lane = makeFlowPuzzle("daily", flowDay()).solution[0];
    localStorage.setItem(
      storageKey(),
      JSON.stringify({
        version: FLOW_VERSION,
        records: {},
        pending: [],
        active: {
          id: crypto.randomUUID(),
          kind: "daily",
          key: flowDay(),
          actions: [{ type: "launch", lane }],
        },
      }),
    );
    await mount();
    await click("Продолжить испытание");
    expect(
      JSON.parse(localStorage.getItem(storageKey())!).active.actions,
    ).toHaveLength(1);
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).not.toBe("0");
  });
  it("launches the last available queue from the keyboard and can undo it", async () => {
    await mount();
    await click("Начать уровень 1");
    const lane = makeFlowPuzzle("level", 1).lanes.length - 1;
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: String(lane + 1) }),
      );
    });
    let saved = JSON.parse(localStorage.getItem(storageKey())!);
    expect(saved.active.actions).toEqual([{ type: "launch", lane }]);
    await click("Отмена");
    saved = JSON.parse(localStorage.getItem(storageKey())!);
    expect(saved.active.actions.at(-1)).toEqual({ type: "undo" });
    expect(box.textContent).toContain("980 / 1000");
  });
});
