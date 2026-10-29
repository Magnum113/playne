// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrainHub from "../src/BrainHub";
import type { BrainProgress } from "../src/brainProgress";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: {id: "player-a"} as {id: string} | null, loading: false },
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
    today: {day: "2026-10-29", results: {
      flash: {id: FLASH_RUN, completed: true, score: 0, mode: "classic"},
      rotate: {id: ROTATE_RUN, completed: true, score: 420, mode: "classic"},
      slide: {id: SLIDE_RUN, completed: false, score: null, mode: "classic"},
    }},
    last7Days: [1, 0, 0, 1, 0, 0, 2].map((gamesCompleted, index) => ({
      day: `2026-10-${23 + index}`, gamesCompleted, score: gamesCompleted * 100,
    })),
    weeklyDays: 2,
    goal: {days: 3, completedDays: 2},
    suggestedLevels: {flash: 1, rotate: 2, slide: 3, dispatch: 3},
    history: [],
  };
}

async function mount() {
  root = createRoot(container);
  await act(async () => root!.render(<BrainHub />));
}

function playLinks() {
  return [...container.querySelectorAll<HTMLAnchorElement>(".brain-daily .secondary-button")];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(progress());
  mocks.auth.user = {id: "player-a"};
  mocks.auth.loading = false;
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
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
      for (const game of games) expect(markup).toContain(`href="/brain/${game}/"`);
      expect(markup).toContain("Три дня разминки за неделю");
      expect(mocks.api).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows daily completion, zero scores, resume links and result deep links", async () => {
    await mount();
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/brain/progress");
    expect(container.querySelector(".brain-today-count")?.textContent).toBe("2 / 4 игр");
    expect(container.querySelectorAll(".brain-done")).toHaveLength(2);
    expect(container.textContent).toContain("Сегодня: 0 / 500 очков");
    expect(container.textContent).toContain("Сегодня: 420 / 500 очков");
    const links = playLinks();
    expect(links).toHaveLength(4);
    expect(links[0].getAttribute("href")).toBe(`/brain/flash/?result=${FLASH_RUN}`);
    expect(links[1].getAttribute("href")).toBe(`/brain/rotate/?result=${ROTATE_RUN}`);
    expect(links[2].getAttribute("href")).toBe("/brain/slide/");
    expect(links[2].textContent).toContain("Продолжить партию");
    expect(links[3].getAttribute("href")).toBe("/brain/dispatch/");
    expect(links[3].textContent).toContain("Начать задачу дня");
  });

  it("keeps the seven-day calendar distinct from the three-day current-week goal", async () => {
    await mount();
    expect(container.querySelectorAll(".brain-calendar li")).toHaveLength(7);
    expect(container.querySelectorAll(".brain-calendar .is-complete")).toHaveLength(3);
    expect(container.querySelector(".brain-calendar li")?.getAttribute("title")).toContain("1 из 4 игр");
    const goal = container.querySelector("[role=progressbar]")!;
    expect(goal.getAttribute("aria-valuemax")).toBe("3");
    expect(goal.getAttribute("aria-valuenow")).toBe("2");
    expect(Number.parseFloat((goal.firstElementChild as HTMLElement).style.width)).toBeCloseTo(66.7, 0);
    expect(container.textContent).toContain("Неделя — с понедельника по Москве");
  });

  it("caps a reached weekly goal without discarding completed calendar days", async () => {
    const data = progress();
    data.weeklyDays = 5;
    data.goal.completedDays = 5;
    mocks.api.mockResolvedValue(data);
    await mount();
    const goal = container.querySelector("[role=progressbar]")!;
    expect(goal.getAttribute("aria-valuenow")).toBe("3");
    expect((goal.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(container.querySelectorAll(".brain-calendar li")).toHaveLength(7);
  });

  it("links practice recommendations to levels1–3 and guards malformed recommendations", async () => {
    const data = progress();
    mocks.api.mockResolvedValue(data);
    await mount();
    let links = [...container.querySelectorAll<HTMLAnchorElement>(".brain-practice-links a")];
    expect(links.map((link) => new URL(link.href).searchParams.get("level"))).toEqual(["1", "2", "3", "3"]);
    expect(links.every((link) => new URL(link.href).searchParams.get("mode") === "practice")).toBe(true);
    expect(links[2].textContent).toContain("экспертный");

    mocks.auth.user = {id: "player-b"};
    mocks.api.mockResolvedValue({...data, suggestedLevels: {flash: 99, rotate: 0, slide: 2.5, dispatch: NaN}});
    await act(async () => root!.render(<BrainHub />));
    links = [...container.querySelectorAll<HTMLAnchorElement>(".brain-practice-links a")];
    expect(links.map((link) => new URL(link.href).searchParams.get("level"))).toEqual(["3", "1", "1", "1"]);
  });

  it("preserves all play links on a progress failure and supports a successful retry", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(progress());
    await mount();
    expect(container.textContent).toContain("Игры доступны — можно начать сейчас");
    expect(playLinks().map((link) => link.getAttribute("href"))).toEqual(games.map((game) => `/brain/${game}/`));
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Повторить загрузку"))!;
    await act(async () => retry.click());
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".brain-progress-error")).toBeNull();
    expect(container.querySelector(".brain-today-count")?.textContent).toBe("2 / 4 игр");
    expect(playLinks()).toHaveLength(4);
  });

  it("does not show the previous account's results after identity changes, even if the next request fails", async () => {
    const first = progress();
    first.today.results.flash!.score = 499;
    mocks.api.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error("Network unavailable"));
    await mount();
    expect(container.textContent).toContain("Сегодня: 499 / 500 очков");
    mocks.auth.user = {id: "another-player"};
    await act(async () => root!.render(<BrainHub />));
    expect(container.textContent).not.toContain("Сегодня: 499 / 500 очков");
    expect(container.querySelector(".brain-today-count")?.textContent).toBe("0 / 4 игр");
    expect(container.querySelectorAll(".brain-calendar li")).toHaveLength(0);
    expect(playLinks()).toHaveLength(4);
  });
});
