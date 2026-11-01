// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowGame from "../src/FlowGame";
import { FLOW_VERSION, flowDay, makeFlowPuzzle } from "../src/flow";
import { flowMotion } from "../src/flowPresentation";
import { initialFlow, launchFlow } from "../src/flow";
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

  it("animates delivery counts, blocks duplicate launches, then releases the dock", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    await mount();
    await click("Начать уровень 1");
    const p = makeFlowPuzzle("level", 1),
      lane = p.solution[0],
      events = launchFlow(p, initialFlow(p), lane)!.events,
      timing = flowMotion(events, 1, p);
    await click(`Очередь ${lane + 1}:`);
    expect(button(`Очередь ${lane + 1}:`).disabled).toBe(true);
    expect(box.querySelectorAll('[data-trip="outbound"]')).toHaveLength(
      events.length,
    );
    expect(box.querySelectorAll('[data-trip="return"]')).toHaveLength(
      events.length,
    );
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).toBe("0");
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
      vi.advanceTimersByTime(timing.finish);
    });
    expect(button(`Очередь ${lane + 1}:`).disabled).toBe(false);
    expect(box.querySelector(".flow-dock.is-working")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("playne:flow:v2:guest")!).active.actions,
    ).toHaveLength(1);
    expect(
      [...box.querySelectorAll("button")].some((b) =>
        /звук/i.test(b.textContent ?? ""),
      ),
    ).toBe(false);
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
    const saved = JSON.parse(localStorage.getItem("playne:flow:v2:guest")!);
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
    localStorage.setItem("playne:flow:v2:guest", normal);
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
            flow: { kind: "level", key: "12", stars: 3 },
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
    expect(localStorage.getItem("playne:flow:v2:guest")).toBe(normal);
    const isolated = JSON.parse(
      localStorage.getItem(`playne:flow:v2:challenge:${token}:guest`)!,
    );
    expect(isolated.records).toEqual({});
    expect(isolated.pending).toEqual([]);
    await act(async () => root.unmount());
    box.remove();
    await mount();
    await click("Посмотреть результат");
    expect(box.textContent).toContain("Ничья!");
    expect(localStorage.getItem("playne:flow:v2:guest")).toBe(normal);
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
    localStorage.setItem("playne:flow:v2:guest", campaign);
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
          flow: { kind: "level", key: "1", stars: 3 },
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
    const guestKey = `playne:flow:v2:challenge:${token}:guest`;
    const guest = JSON.parse(localStorage.getItem(guestKey)!);
    expect(guest.pending).toHaveLength(1);
    mocks.user = { id: "account-one", nickname: "Игрок" };
    await act(async () => root.render(<FlowGame />));
    await click("Посмотреть результат");
    expect(box.textContent).toContain("Ничья!");
    expect(box.textContent).toContain("Сохранено в аккаунте");
    const account = JSON.parse(
      localStorage.getItem(`playne:flow:v2:challenge:${token}:account-one`)!,
    );
    expect(account.active).toEqual(guest.active);
    expect(account.pending).toEqual([]);
    expect(account.records).toEqual({});
    expect(JSON.parse(localStorage.getItem(guestKey)!).active).toBeNull();
    expect(JSON.parse(localStorage.getItem(guestKey)!).pending).toEqual([]);
    expect(localStorage.getItem("playne:flow:v2:guest")).toBe(campaign);
    mocks.user = { id: "account-two", nickname: "Другой игрок" };
    await act(async () => root.render(<FlowGame />));
    expect(button("Принять вызов")).toBeDefined();
    expect(box.textContent).not.toContain("Посмотреть результат");
    expect(localStorage.getItem("playne:flow:v2:guest")).toBe(campaign);
  }, 15000);
  it("restores an unfinished game and undoes an actual launch", async () => {
    const id = crypto.randomUUID(),
      lane = makeFlowPuzzle("level", 1).solution[0];
    localStorage.setItem(
      "playne:flow:v2:guest",
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
      JSON.parse(localStorage.getItem("playne:flow:v2:guest")!).pending,
    ).toHaveLength(1);
    await click("Следующий уровень");
    expect(box.textContent).toContain("Уровень 2 — Рой");
  }, 15000);
  it("daily challenge is available immediately and is distinct from the campaign", async () => {
    window.history.replaceState(null, "", "/swarm/?mode=daily");
    await mount();
    await click("Начать испытание");
    const saved = JSON.parse(localStorage.getItem("playne:flow:v2:guest")!);
    expect(saved.active).toMatchObject({ kind: "daily", key: flowDay() });
    expect(box.querySelectorAll(".flow-launch")).toHaveLength(4);
    expect(box.querySelector(".flow-leaderboard")).toBeNull();
  });
  it("resumes today's attempt from the daily landing without losing moves", async () => {
    window.history.replaceState(null, "", "/swarm/?mode=daily");
    const lane = makeFlowPuzzle("daily", flowDay()).solution[0];
    localStorage.setItem(
      "playne:flow:v2:guest",
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
      JSON.parse(localStorage.getItem("playne:flow:v2:guest")!).active.actions,
    ).toHaveLength(1);
    expect(
      box.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
    ).not.toBe("0");
  });
  it("launches queue four from the keyboard and can undo it", async () => {
    await mount();
    await click("Начать уровень 1");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "4" }));
    });
    let saved = JSON.parse(localStorage.getItem("playne:flow:v2:guest")!);
    expect(saved.active.actions).toEqual([{ type: "launch", lane: 3 }]);
    await click("Отмена");
    saved = JSON.parse(localStorage.getItem("playne:flow:v2:guest")!);
    expect(saved.active.actions.at(-1)).toEqual({ type: "undo" });
    expect(box.textContent).toContain("980 / 1000");
  });
});
