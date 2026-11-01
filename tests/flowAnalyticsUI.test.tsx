// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowGame from "../src/FlowGame";
import { FLOW_GOALS, SHARE_GOALS } from "../src/analytics";
import {
  FLOW_VERSION,
  flowDay,
  flowLaunchPackets,
  initialFlow,
  launchFlow,
  makeFlowPuzzle,
  replayFlow,
  type FlowAction,
  type FlowPuzzle,
} from "../src/flow";
import { flowMotion } from "../src/flowPresentation";
import type { PublicChallenge } from "../src/challenges";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  goal: vi.fn(),
  once: new Set<string>(),
  challengeStart: vi.fn(),
  challengeComplete: vi.fn(),
  user: null as { id: string; nickname: string } | null,
}));
vi.mock("../src/account", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
  api: (...args: unknown[]) => mocks.api(...args),
  loginToPlay: vi.fn(),
  AccountNav: () => null,
}));
vi.mock("../src/HeaderStreak", () => ({ default: () => null }));
vi.mock("../src/FooterLinks", () => ({ default: () => null }));
vi.mock("../src/analytics", async (original) => ({
  ...(await original<typeof import("../src/analytics")>()),
  reachGoal: (...args: unknown[]) => mocks.goal(...args),
  reachGoalOnce: (goal: string, key: string, params?: unknown) => {
    const id = `${goal}:${key}`;
    if (mocks.once.has(id)) return;
    mocks.once.add(id);
    mocks.goal(goal, params);
  },
  trackChallengeStart: (...args: unknown[]) => mocks.challengeStart(...args),
  trackChallengeComplete: (...args: unknown[]) =>
    mocks.challengeComplete(...args),
}));
let root: Root, box: HTMLDivElement;
const events = (goal: string) =>
  mocks.goal.mock.calls.filter(([id]) => id === goal);
const button = (label: string) =>
  [...box.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) =>
      b.getAttribute("aria-label")?.startsWith(label) ||
      b.textContent?.includes(label),
  )!;
const click = async (label: string) => act(async () => button(label).click());
const key = async (key: string) =>
  act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key })));
const mount = async () => {
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  await act(async () => root.render(<FlowGame />));
};
const actions = (p: FlowPuzzle) =>
  p.solution.map((lane) => ({ type: "launch" as const, lane }));
function seed(
  p: FlowPuzzle,
  moves: FlowAction[],
  {
    animated = false,
    challenge,
    id = crypto.randomUUID(),
  }: { animated?: boolean; challenge?: PublicChallenge; id?: string } = {},
) {
  localStorage.setItem(
    `playne:flow:v${FLOW_VERSION}:${challenge ? `challenge:${challenge.token}:` : ""}guest`,
    JSON.stringify({
      version: FLOW_VERSION,
      records: {},
      pending: [],
      motion: animated,
      active: {
        id,
        version: p.version,
        kind: "level",
        key: p.id.split(":")[1],
        actions: moves,
        ...(challenge ? { challengeToken: challenge.token } : {}),
      },
    }),
  );
  return id;
}
function timing(p: FlowPuzzle, prefix: FlowAction[], lane: number) {
  const before = replayFlow(p, prefix),
    next = launchFlow(p, before.state, lane)!;
  const group = flowLaunchPackets(p, before.state, lane)!;
  const slots = new Map(
    before.state.active.map((team, slot) => [team.id, slot]),
  );
  const free = Array.from({ length: p.slots }, (_, i) => i).filter(
    (i) => ![...slots.values()].includes(i),
  );
  group.forEach(({ packet }, i) => slots.set(packet.id, free[i]));
  return flowMotion(next.events, 1, p, {
    slots,
    slotCount: p.slots,
    cells: before.state.cells,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.once.clear();
  mocks.user = null;
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/swarm/");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
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

describe("Swarm analytics follows actual player actions", () => {
  it("separates entry, accepted launch, rejected keys and accepted undo without repeated engagement", async () => {
    await mount();
    expect(events(FLOW_GOALS.view)).toHaveLength(1);
    await click("Начать уровень 1");
    expect(events(FLOW_GOALS.gameStart)).toHaveLength(1);
    await key("4");
    await key("z");
    expect(events(FLOW_GOALS.engaged)).toHaveLength(0);
    expect(events(FLOW_GOALS.undo)).toHaveLength(0);
    const p = makeFlowPuzzle("level", 1);
    await click(`Очередь ${p.solution[0] + 1}:`);
    expect(events(FLOW_GOALS.engaged)).toHaveLength(1);
    await key("z");
    await key("z");
    expect(events(FLOW_GOALS.undo)).toHaveLength(1);
    await click(`Очередь ${p.solution[0] + 1}:`);
    expect(events(FLOW_GOALS.engaged)).toHaveLength(1);
    expect(JSON.stringify(mocks.goal.mock.calls)).not.toMatch(
      /challengeToken|token=|actions|nickname|2026-/,
    );
    expect(events(FLOW_GOALS.gameStart)[0][1]).toMatchObject({
      game: "flow",
      level: 1,
      field_version: 4,
      source: "campaign",
      mode: "level",
    });
  });
  it("resumes an unfinished attempt without a new start, and ignores authentication remount for page entry", async () => {
    const p = makeFlowPuzzle("level", 1);
    seed(p, actions(p).slice(0, 1));
    await mount();
    await click("Продолжить уровень 1");
    expect(events(FLOW_GOALS.resume)).toHaveLength(1);
    expect(events(FLOW_GOALS.gameStart)).toHaveLength(0);
    await click("Пауза");
    await click("К меню");
    await click("На сегодня");
    await click("Как играть");
    expect(events(FLOW_GOALS.rulesOpen).at(-1)?.[1]).toMatchObject({
      mode: "daily",
      source: "daily",
    });
    expect(events(FLOW_GOALS.rulesOpen).at(-1)?.[1]).not.toHaveProperty(
      "level",
    );
    await act(async () =>
      box.querySelector<HTMLDialogElement>("dialog[open]")?.close(),
    );
    await click("Уровни");
    await click("Продолжить уровень 1");
    expect(events(FLOW_GOALS.resume)).toHaveLength(1);
    mocks.user = { id: "new-account", nickname: "Private nickname" };
    await act(async () => root.render(<FlowGame />));
    expect(events(FLOW_GOALS.view)).toHaveLength(1);
  });
  it("does not retroactively count halfway when resuming old progress or making another move", async () => {
    const p = makeFlowPuzzle("level", 1),
      all = actions(p);
    const total = p.cells.filter((color) => color >= 0).length;
    const crossing = all.findIndex(
      (_, i) => replayFlow(p, all.slice(0, i + 1)).state.collected * 2 >= total,
    );
    const prefix = all.slice(0, crossing + 1);
    expect(replayFlow(p, prefix).won).toBe(false);
    seed(p, prefix);
    await mount();
    await click("Продолжить уровень 1");
    expect(events(FLOW_GOALS.resume)).toHaveLength(1);
    expect(events(FLOW_GOALS.halfway)).toHaveLength(0);
    await click(`Очередь ${p.solution[crossing + 1] + 1}:`);
    expect(events(FLOW_GOALS.engaged)).toHaveLength(1);
    expect(events(FLOW_GOALS.halfway)).toHaveLength(0);
  });
  it("does not count an old stuck save until undo and a new launch create another episode", async () => {
    const p = makeFlowPuzzle("level", 2);
    const prefix: FlowAction[] = Array.from({ length: 5 }, () => ({
      type: "launch",
      lane: 1,
    }));
    expect(replayFlow(p, prefix).stuck).toBe(true);
    seed(p, prefix);
    await mount();
    await click("Продолжить уровень 2");
    expect(events(FLOW_GOALS.resume)).toHaveLength(1);
    expect(events(FLOW_GOALS.stuck)).toHaveLength(0);
    await key("z");
    expect(events(FLOW_GOALS.stuck)).toHaveLength(0);
    await click("Очередь 2:");
    expect(events(FLOW_GOALS.stuck)).toHaveLength(1);
  });
  it("emits halfway only after the delivery that really crosses 50 percent", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const p = makeFlowPuzzle("level", 1),
      all = actions(p),
      total = p.cells.filter((c) => c >= 0).length;
    const at = all.findIndex(
      (_, i) => replayFlow(p, all.slice(0, i + 1)).state.collected * 2 >= total,
    );
    const prefix = all.slice(0, at),
      before = replayFlow(p, prefix),
      lane = p.solution[at];
    seed(p, prefix, { animated: true });
    await mount();
    await click("Продолжить уровень 1");
    expect(events(FLOW_GOALS.halfway)).toHaveLength(0);
    const plan = timing(p, prefix, lane),
      needed = Math.ceil(total / 2) - before.state.collected;
    const crossing = [...plan.trips].sort(
      (a, b) => a.deliveryAt - b.deliveryAt,
    )[needed - 1].deliveryAt;
    await click(`Очередь ${lane + 1}:`);
    expect(events(FLOW_GOALS.halfway)).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(Math.floor(crossing) - 1));
    expect(events(FLOW_GOALS.halfway)).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(2));
    expect(events(FLOW_GOALS.halfway)).toHaveLength(1);
  });
  it("finishes a friend attempt after visible delivery, never on optimistic logical win", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const p = makeFlowPuzzle("level", 1),
      all = actions(p),
      prefix = all.slice(0, -1),
      lane = p.solution.at(-1)!;
    const challenge: PublicChallenge = {
      token: "a".repeat(43),
      url: "https://playne.ru/c/private-link",
      imageUrl: "https://playne.ru/image.png",
      game: "flow",
      gameName: "Рой",
      score: 1000,
      maxScore: 1000,
      nickname: "Private friend",
      day: flowDay(),
      mode: "practice",
      isTodayDaily: false,
      flow: { kind: "level", key: "1", version: 4, stars: 3 },
    };
    window.history.replaceState(
      null,
      "",
      `/swarm/?challenge=${challenge.token}`,
    );
    const id = seed(p, prefix, { animated: true, challenge });
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/challenges/") ? challenge : { saved: true },
    );
    await mount();
    await click("Продолжить вызов");
    expect(mocks.challengeStart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id, game: "flow" }),
      false,
    );
    const plan = timing(p, prefix, lane);
    await click(`Очередь ${lane + 1}:`);
    expect(events(FLOW_GOALS.gameComplete)).toHaveLength(0);
    expect(mocks.challengeComplete).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(Math.floor(plan.finish) - 1));
    expect(events(FLOW_GOALS.gameComplete)).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(2));
    expect(events(FLOW_GOALS.gameComplete)).toHaveLength(1);
    expect(mocks.challengeComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      1000,
    );
    expect(events(FLOW_GOALS.dailyComplete)).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(events(FLOW_GOALS.gameComplete)).toHaveLength(1);
  });
  it("tracks separate stuck episodes without counting renders or rejected launches", async () => {
    const p = makeFlowPuzzle("level", 2);
    seed(p, []);
    await mount();
    await click("Продолжить уровень 2");
    for (let i = 0; i < 5; i++) await click("Очередь 2:");
    expect(events(FLOW_GOALS.stuck)).toHaveLength(1);
    await key("2");
    await click("Все команды");
    expect(events(FLOW_GOALS.stuck)).toHaveLength(1);
    await act(async () =>
      box.querySelector<HTMLDialogElement>("dialog[open]")?.close(),
    );
    await key("z");
    await click("Очередь 2:");
    expect(events(FLOW_GOALS.stuck)).toHaveLength(2);
  });
  it("counts a normal daily start and finish without sending its private date", async () => {
    window.history.replaceState(null, "", "/swarm/?mode=daily");
    await mount();
    await click("Начать испытание");
    expect(events(FLOW_GOALS.dailyStart)).toHaveLength(1);
    const p = makeFlowPuzzle("daily", flowDay());
    for (const lane of p.solution) await click(`Очередь ${lane + 1}:`);
    expect(events(FLOW_GOALS.dailyComplete)).toHaveLength(1);
    expect(events(FLOW_GOALS.dailyComplete)[0][1]).toMatchObject({
      mode: "daily",
      source: "daily",
      score: 1000,
    });
    expect(events(FLOW_GOALS.dailyComplete)[0][1]).not.toHaveProperty("level");
    expect(JSON.stringify(mocks.goal.mock.calls)).not.toContain(flowDay());
  });
  it("keeps a daily friend comparison out of the normal daily goals", async () => {
    const today = flowDay(),
      p = makeFlowPuzzle("daily", today);
    const challenge: PublicChallenge = {
      token: "b".repeat(43),
      url: "https://playne.ru/c/private-link",
      imageUrl: "https://playne.ru/image.png",
      game: "flow",
      gameName: "Рой",
      score: 1000,
      maxScore: 1000,
      nickname: "Friend",
      day: today,
      mode: "practice",
      isTodayDaily: false,
      flow: { kind: "daily", key: today, version: 4, stars: 3 },
    };
    window.history.replaceState(
      null,
      "",
      `/swarm/?challenge=${challenge.token}`,
    );
    mocks.api.mockImplementation(async (path: string) =>
      path.startsWith("/challenges/") ? challenge : { saved: true },
    );
    await mount();
    await click("Принять вызов");
    for (const lane of p.solution) await click(`Очередь ${lane + 1}:`);
    expect(events(FLOW_GOALS.gameStart)[0][1]).toMatchObject({
      mode: "daily",
      source: "challenge",
    });
    expect(events(FLOW_GOALS.gameComplete)).toHaveLength(1);
    expect(events(FLOW_GOALS.dailyStart)).toHaveLength(0);
    expect(events(FLOW_GOALS.dailyComplete)).toHaveLength(0);
    expect(mocks.challengeComplete).toHaveBeenCalled();
  });
  it("counts real rules opens and confirmed restart/replay separately from next level", async () => {
    await mount();
    await click("Как играть");
    expect(events(FLOW_GOALS.rulesOpen)).toHaveLength(1);
    const open = box.querySelector<HTMLDialogElement>("dialog[open]");
    await act(async () => open?.close());
    await click("Начать уровень 1");
    await click("Заново");
    expect(events(FLOW_GOALS.restart)).toHaveLength(0);
    await click("Начать заново");
    expect(events(FLOW_GOALS.restart)[0][1]).toMatchObject({
      reason: "restart",
    });
    const p = makeFlowPuzzle("level", 1);
    // Reduced motion commits each real command without visual wait.
    for (const lane of p.solution) await click(`Очередь ${lane + 1}:`);
    expect(events(FLOW_GOALS.gameComplete)).toHaveLength(1);
    await click("Следующий уровень");
    expect(events(FLOW_GOALS.nextLevel)).toHaveLength(1);
    expect(events(FLOW_GOALS.gameStart).at(-1)?.[1]).toMatchObject({
      entry: "next_level",
      level: 2,
    });
  });
});
