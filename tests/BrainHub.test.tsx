// @vitest-environment happy-dom
// Navigation streak is verified separately from game mechanics.
vi.mock("../src/HeaderStreak", () => ({ default: () => null }));
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrainHub from "../src/BrainHub";
import type { BrainProgress } from "../src/brainProgress";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: { id: "player-a" } as { id: string } | null, loading: false },
}));
vi.mock("../src/account", () => ({
  api: mocks.api,
  useAuth: () => mocks.auth,
  AccountNav: () => null,
}));

const games = ["flash", "rotate", "slide", "dispatch"] as const;
const FLASH_RUN = "11111111-1111-4111-8111-111111111111";
const ROTATE_RUN = "22222222-2222-4222-8222-222222222222";
const SLIDE_RUN = "33333333-3333-4333-8333-333333333333";
let root: Root | undefined;
let container: HTMLDivElement;

function progress(): BrainProgress {
  return {
    today: {
      day: "2026-10-29",
      results: {
        flash: { id: FLASH_RUN, completed: true, score: 0, mode: "classic" },
        rotate: {
          id: ROTATE_RUN,
          completed: true,
          score: 420,
          mode: "classic",
        },
        slide: {
          id: SLIDE_RUN,
          completed: false,
          score: null,
          mode: "classic",
        },
      },
    },
    last7Days: [1, 0, 0, 1, 0, 0, 2].map((gamesCompleted, index) => ({
      day: `2026-10-${23 + index}`,
      gamesCompleted,
      score: gamesCompleted * 100,
    })),
    weeklyDays: 2,
    goal: { days: 3, completedDays: 2 },
    suggestedLevels: { flash: 1, rotate: 2, slide: 3, dispatch: 3 },
    history: [],
  };
}

async function mount() {
  root = createRoot(container);
  await act(async () => root!.render(<BrainHub />));
}

function playLinks() {
  return [
    ...container.querySelectorAll<HTMLAnchorElement>(
      ".brain-daily .secondary-button",
    ),
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(progress());
  mocks.auth.user = { id: "player-a" };
  mocks.auth.loading = false;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("brain hub", () => {
  it("server-renders all four playable routes without browser globals or a progress request", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);
    try {
      const markup = renderToString(<BrainHub />);
      expect(markup).toContain("Разминка для ума");
      for (const game of games)
        expect(markup).toContain(`href="/brain/${game}/"`);
      expect(markup).toContain("Три дня игры за неделю");
      expect(mocks.api).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows daily completion, zero scores, resume links and result deep links", async () => {
    await mount();
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/brain/progress");
    expect(container.querySelector(".brain-today-count")?.textContent).toBe(
      "2 / 4 игр",
    );
    expect(container.querySelectorAll(".brain-done")).toHaveLength(2);
    expect(container.textContent).toContain("Сегодня: 0 / 500 очков");
    expect(container.textContent).toContain("Сегодня: 420 / 500 очков");
    const links = playLinks();
    expect(links).toHaveLength(4);
    expect(links[0].getAttribute("href")).toBe(
      `/brain/flash/?result=${FLASH_RUN}`,
    );
    expect(links[1].getAttribute("href")).toBe(
      `/brain/rotate/?result=${ROTATE_RUN}`,
    );
    expect(links[2].getAttribute("href")).toBe("/brain/slide/");
    expect(links[2].textContent).toContain("Продолжить партию");
    expect(links[3].getAttribute("href")).toBe("/brain/dispatch/");
    expect(links[3].textContent).toContain("Начать задачу дня");
  });

  it("shows Monday through Sunday and excludes prior-week completions from the weekly goal", async () => {
    await mount();
    const days = [
      ...container.querySelectorAll<HTMLLIElement>(".brain-calendar li"),
    ];
    expect(days).toHaveLength(7);
    expect(days[0].querySelector("span")?.textContent).toBe("пн");
    expect(days[0].getAttribute("title")).toContain("26 октября");
    expect(days[0].getAttribute("title")).toContain("завершено игр: 1");
    expect(days[6].querySelector("span")?.textContent).toBe("вс");
    expect(days[6].getAttribute("title")).toContain("1 ноября");
    expect(
      container.querySelectorAll(".brain-calendar .is-complete"),
    ).toHaveLength(2);
    const today = container.querySelector(
      '.brain-calendar [aria-current="date"]',
    );
    expect(today?.closest("li")?.getAttribute("title")).toContain("29 октября");
    const goal = container.querySelector("progress")!;
    expect(goal.getAttribute("max")).toBe("3");
    expect(goal.getAttribute("value")).toBe("2");
    expect(
      (100 * Number(goal.getAttribute("value"))) /
        Number(goal.getAttribute("max")),
    ).toBeCloseTo(66.7, 0);
    expect(container.textContent).toContain(
      "Понедельник–воскресенье, по Москве",
    );
  });

  it("shows the Friday week across the month boundary with Saturday/Sunday still ahead", async () => {
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    const data = progress();
    data.today.day = "2026-10-30";
    data.last7Days = [1, 1, 1, 0, 1, 0, 2].map((gamesCompleted, index) => ({
      day: `2026-10-${24 + index}`,
      gamesCompleted,
      score: gamesCompleted * 100,
    }));
    data.weeklyDays = 3;
    data.goal.completedDays = 3;
    mocks.api.mockResolvedValue(data);
    await mount();
    const days = [
      ...container.querySelectorAll<HTMLLIElement>(".brain-calendar li"),
    ];
    expect(days).toHaveLength(7);
    expect(days[0].querySelector("span")?.textContent).toBe("пн");
    expect(days[0].getAttribute("title")).toContain("26 октября");
    expect(days[6].querySelector("span")?.textContent).toBe("вс");
    expect(days[6].getAttribute("title")).toContain("1 ноября");
    expect(
      days.some((day) =>
        /24 октября|25 октября/.test(day.getAttribute("title") ?? ""),
      ),
    ).toBe(false);
    expect(
      container.querySelectorAll(".brain-calendar .is-complete"),
    ).toHaveLength(3);
    expect(container.querySelector("progress")?.getAttribute("value")).toBe(
      "3",
    );
    const today = container.querySelector(
      '.brain-calendar [aria-current="date"]',
    );
    expect(today?.closest("li")).toBe(days[4]);
    expect(days[4].getAttribute("title")).toContain("30 октября");
    const future = days.filter((day) => day.classList.contains("is-future"));
    expect(future).toEqual(days.slice(5));
    expect(
      future.map((day) => day.querySelector("strong")?.textContent),
    ).toEqual(["31", "1"]);
    for (const day of future) {
      expect(day.classList.contains("is-complete")).toBe(false);
      const accessible = `${day.getAttribute("aria-label") ?? ""} ${day.getAttribute("title") ?? ""} ${day.querySelector(".sr-only")?.textContent ?? ""}`;
      expect(accessible).toMatch(/ещ[её] не наступил|будущ|предстоит/i);
      expect(accessible).not.toContain("завершено игр 0");
      expect(day.hasAttribute("aria-current")).toBe(false);
    }
  });

  it("caps a reached weekly goal without discarding completed calendar days", async () => {
    const data = progress();
    data.last7Days = [2, 0, 0, 1, 1, 1, 1].map((gamesCompleted, index) => ({
      day: `2026-10-${23 + index}`,
      gamesCompleted,
      score: gamesCompleted * 100,
    }));
    data.weeklyDays = 4;
    data.goal.completedDays = 4;
    mocks.api.mockResolvedValue(data);
    await mount();
    const goal = container.querySelector("progress")!;
    expect(goal.getAttribute("value")).toBe("3");
    expect(goal.getAttribute("value")).toBe(goal.getAttribute("max"));
    expect(container.querySelectorAll(".brain-calendar li")).toHaveLength(7);
    expect(
      container.querySelectorAll(".brain-calendar .is-complete"),
    ).toHaveLength(4);
  });

  it("links practice recommendations to levels1–3 and guards malformed recommendations", async () => {
    const data = progress();
    mocks.api.mockResolvedValue(data);
    await mount();
    let links = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        ".brain-practice-links a",
      ),
    ];
    expect(
      links.map((link) => new URL(link.href).searchParams.get("level")),
    ).toEqual(["1", "2", "3", "3"]);
    expect(
      links.every(
        (link) => new URL(link.href).searchParams.get("mode") === "practice",
      ),
    ).toBe(true);
    expect(links[2].textContent).toContain("экспертный");

    mocks.auth.user = { id: "player-b" };
    mocks.api.mockResolvedValue({
      ...data,
      suggestedLevels: { flash: 99, rotate: 0, slide: 2.5, dispatch: NaN },
    });
    await act(async () => root!.render(<BrainHub />));
    links = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        ".brain-practice-links a",
      ),
    ];
    expect(
      links.map((link) => new URL(link.href).searchParams.get("level")),
    ).toEqual(["3", "1", "1", "1"]);
  });

  it("preserves all play links on a progress failure and supports a successful retry", async () => {
    mocks.api
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(progress());
    await mount();
    expect(container.textContent).toContain(
      "Игры доступны — можно начать сейчас",
    );
    expect(playLinks().map((link) => link.getAttribute("href"))).toEqual(
      games.map((game) => `/brain/${game}/`),
    );
    const retry = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Повторить загрузку"))!;
    await act(async () => retry.click());
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".brain-progress-error")).toBeNull();
    expect(container.querySelector(".brain-today-count")?.textContent).toBe(
      "2 / 4 игр",
    );
    expect(playLinks()).toHaveLength(4);
  });

  it("does not show the previous account's results after identity changes, even if the next request fails", async () => {
    const first = progress();
    first.today.results.flash!.score = 499;
    mocks.api
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("Network unavailable"));
    await mount();
    expect(container.textContent).toContain("Сегодня: 499 / 500 очков");
    mocks.auth.user = { id: "another-player" };
    await act(async () => root!.render(<BrainHub />));
    expect(container.textContent).not.toContain("Сегодня: 499 / 500 очков");
    expect(container.querySelector(".brain-today-count")?.textContent).toBe(
      "0 / 4 игр",
    );
    expect(
      container.querySelectorAll(".brain-calendar .is-complete"),
    ).toHaveLength(0);
    expect(playLinks()).toHaveLength(4);
  });

  it.each(["focus", "visibility"] as const)(
    "refreshes progress on %s after Moscow midnight without starting a game",
    async (event) => {
      vi.setSystemTime(new Date("2026-10-29T20:59:59Z"));
      let resolveNext!: (data: BrainProgress) => void;
      const nextResponse = new Promise<BrainProgress>((resolve) => {
        resolveNext = resolve;
      });
      mocks.api
        .mockResolvedValueOnce(progress())
        .mockReturnValueOnce(nextResponse);
      await mount();
      expect(container.querySelector(".brain-today-count")?.textContent).toBe(
        "2 / 4 игр",
      );

      vi.setSystemTime(new Date("2026-10-29T21:00:01Z"));
      act(() => {
        if (event === "focus") window.dispatchEvent(new Event("focus"));
        else document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(mocks.api).toHaveBeenCalledTimes(2);
      // The previous day's result must disappear while today's request is pending.
      expect(container.querySelector(".brain-today-count")?.textContent).toBe(
        "0 / 4 игр",
      );
      expect(container.textContent).not.toContain("Сегодня: 420 / 500 очков");
      expect(playLinks().map((link) => link.getAttribute("href"))).toEqual(
        games.map((game) => `/brain/${game}/`),
      );

      const next = progress();
      next.today = {
        day: "2026-10-30",
        results: {
          dispatch: {
            id: "44444444-4444-4444-8444-444444444444",
            completed: true,
            score: 480,
            mode: "classic",
          },
        },
      };
      next.last7Days = next.last7Days.map((day, index) => ({
        ...day,
        day: `2026-10-${24 + index}`,
      }));
      await act(async () => resolveNext(next));
      expect(container.querySelector(".brain-today-count")?.textContent).toBe(
        "1 / 4 игр",
      );
      expect(container.textContent).toContain("Сегодня: 480 / 500 очков");
      expect(playLinks()[3].getAttribute("href")).toContain(
        "?result=44444444-4444-4444-8444-444444444444",
      );
      expect(
        mocks.api.mock.calls.every(
          ([path, method]) =>
            path === "/brain/progress" &&
            (method === undefined || method === "GET"),
        ),
      ).toBe(true);
    },
  );

  it("does not label a stale yesterday response as today's results", async () => {
    vi.setSystemTime(new Date("2026-10-29T21:00:01Z"));
    mocks.api.mockResolvedValue(progress()); // A stale response still describes October29.
    await mount();
    expect(container.querySelector(".brain-today-count")?.textContent).toBe(
      "0 / 4 игр",
    );
    expect(container.querySelectorAll(".brain-done")).toHaveLength(0);
    expect(container.textContent).not.toContain("Сегодня: 420 / 500 очков");
    expect(playLinks().map((link) => link.getAttribute("href"))).toEqual(
      games.map((game) => `/brain/${game}/`),
    );
    expect(
      mocks.api.mock.calls.every(
        ([path, method]) =>
          path === "/brain/progress" &&
          (method === undefined || method === "GET"),
      ),
    ).toBe(true);
  });

  it("checks the date in an open tab without repeatedly fetching on the same day", async () => {
    vi.setSystemTime(new Date("2026-10-29T20:58:00Z"));
    const next = progress();
    next.today = { day: "2026-10-30", results: {} };
    mocks.api.mockResolvedValueOnce(progress()).mockResolvedValueOnce(next);
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-10-29T21:00:01Z"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".brain-today-count")?.textContent).toBe(
      "0 / 4 игр",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.mock.calls.every(
        ([path, method]) =>
          path === "/brain/progress" &&
          (method === undefined || method === "GET"),
      ),
    ).toBe(true);
  });
});
