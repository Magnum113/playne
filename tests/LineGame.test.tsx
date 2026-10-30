// @vitest-environment happy-dom
// Navigation streak is verified separately from game mechanics.
vi.mock("../src/HeaderStreak", () => ({ default: () => null }));
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LineGame from "../src/LineGame";
import { getDailyLinePuzzles, hintLinePath, linePathState } from "../src/line";
import type { ServerRun } from "../src/rankedQueue";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: vi.fn(),
    access: {
      user: { id: "test-player" } as { id: string } | null,
      loading: false,
      ready: true,
      blocked: false,
      resume: false,
      trial: undefined as
        | { id: string; mode: "classic" | "practice"; completed: boolean }
        | undefined,
      refresh: vi.fn(),
    },
    ranked: {
      state: { status: "ready", message: undefined as string | undefined },
      begin: vi.fn(),
      resume: vi.fn(),
      lineStart: vi.fn(),
      lineHint: vi.fn(),
      lineAnswer: vi.fn(),
    },
  };
});

vi.mock("../src/account", () => ({
  ApiError: mocks.ApiError,
  api: (...args: unknown[]) => mocks.api(...args),
  useGuestTrial: () => mocks.access,
  useAuth: () => mocks.access,
  useRankedRun: () => mocks.ranked,
  AccountNav: () => null,
  GuestSavedNotice: () => null,
  SaveResult: () => <div data-testid="save-result" />,
  loginToPlay: vi.fn(),
}));

const DAY = "2026-10-29";
const NOW = Date.parse(`${DAY}T09:00:00Z`);
const STORAGE = "playne:line-active:v1";
const OLD_ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "22222222-2222-4222-8222-222222222222";
let root: Root | undefined;
let container: HTMLDivElement;

function run(options: Partial<ServerRun<"line">> = {}): ServerRun<"line"> {
  return {
    id: NEW_ID,
    game: "line",
    mode: "classic",
    version: 1,
    challenge: { mode: "classic", day: DAY, puzzles: getDailyLinePuzzles(DAY) },
    answers: [],
    completed: false,
    score: null,
    ...options,
  };
}

function save(mode: "classic" | "practice" = "classic", day = DAY) {
  localStorage.setItem(
    STORAGE,
    JSON.stringify({
      id: OLD_ID,
      mode,
      day,
      index: 0,
      path: [],
      completed: false,
    }),
  );
}

async function mount() {
  root = createRoot(container);
  await act(async () => root!.render(<LineGame />));
}

async function begin() {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((entry) => entry.textContent?.includes("Начать игру"));
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  localStorage.clear();
  window.history.replaceState(null, "", "/one-line/");
  mocks.access.user = { id: "test-player" };
  mocks.access.loading = false;
  mocks.access.ready = true;
  mocks.access.blocked = false;
  mocks.access.resume = false;
  mocks.access.trial = undefined;
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (path: string) => {
    if (path.startsWith("/challenges/"))
      return {
        game: "line",
        token: path.split("/").at(-1),
        nickname: "Друг",
        score: 400,
        maxScore: 500,
        mode: "practice",
        day: DAY,
        isTodayDaily: false,
      };
    if (path === "/email/settings")
      return {
        available: true,
        email: "player@example.test",
        enabled: true,
        pending: false,
        verified: true,
        purpose: "general",
      };
    throw new Error("Unexpected API read: " + path);
  });
  mocks.ranked.state = { status: "ready", message: undefined };
  for (const mock of [
    mocks.ranked.begin,
    mocks.ranked.resume,
    mocks.ranked.lineStart,
    mocks.ranked.lineHint,
    mocks.ranked.lineAnswer,
  ])
    mock.mockReset();
  mocks.ranked.begin.mockResolvedValue(run());
  mocks.ranked.lineStart.mockResolvedValue({
    startedAt: NOW - 12_000,
    serverNow: NOW,
    hints: 0,
  });
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

describe("one-line page SSR", () => {
  it("renders the introduction without browser globals or starting a party", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("localStorage", undefined);
    try {
      const markup = renderToString(<LineGame />);
      expect(markup).toContain("Одной линией");
      expect(markup).toContain("Начать игру");
      expect(mocks.ranked.begin).not.toHaveBeenCalled();
      expect(mocks.ranked.resume).not.toHaveBeenCalled();
      expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("one-line saved-party recovery", () => {
  it.each([403, 404, 410])(
    "starts the selected mode when a saved party is definitively unavailable (%s)",
    async (status) => {
      window.history.replaceState(null, "", "/one-line/?mode=practice");
      save("practice");
      mocks.ranked.resume.mockRejectedValue(
        new mocks.ApiError("Эта партия недоступна", status),
      );
      mocks.ranked.begin.mockResolvedValue(run({ mode: "practice" }));
      await mount();
      await begin();
      expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
      expect(mocks.ranked.begin).toHaveBeenCalledExactlyOnceWith(
        "practice",
        1,
        undefined,
      );
      expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
      expect(container.querySelector(".line-board")).not.toBeNull();
      expect(JSON.parse(localStorage.getItem(STORAGE)!).id).toBe(NEW_ID);
    },
  );

  it("keeps the saved party and does not fall back to a new one after a network failure", async () => {
    save();
    mocks.ranked.state = {
      status: "error",
      message: "Не удалось восстановить соединение",
    };
    mocks.ranked.resume.mockResolvedValue(null);
    await mount();
    await begin();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
    expect(container.querySelector(".line-board")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).id).toBe(OLD_ID);
    expect(container.textContent).toContain(
      "Не удалось восстановить соединение",
    );
  });

  it("starts today's classic for a signed-in player instead of resuming yesterday's saved party", async () => {
    save("classic", "2026-10-28");
    await mount();
    await begin();
    expect(mocks.ranked.resume).not.toHaveBeenCalled();
    expect(mocks.ranked.begin).toHaveBeenCalledExactlyOnceWith(
      "classic",
      1,
      undefined,
    );
    expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
    expect(container.textContent).toContain(`Поля дня · ${DAY}`);
    expect(JSON.parse(localStorage.getItem(STORAGE)!).day).toBe(DAY);
  });

  it("can still resume yesterday's practice because practice has no daily attempt boundary", async () => {
    window.history.replaceState(null, "", "/one-line/?mode=practice");
    save("practice", "2026-10-28");
    mocks.ranked.resume.mockResolvedValue(
      run({ id: OLD_ID, mode: "practice" }),
    );
    await mount();
    await begin();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
  });
});

describe("one-line completed-party recovery", () => {
  it("records the exact completed challenge in the URL and restores it after a guest reload", async () => {
    const token = "shared-line",
      puzzles = getDailyLinePuzzles(DAY);
    const prior = Array.from({ length: 4 }, () => ({
      score: 90,
      elapsedMs: 15000,
      hints: 0,
    }));
    const challenge = {
      mode: "practice",
      day: DAY,
      puzzles,
      comparison: true,
      comparisonToken: token,
    };
    const complete = run({
      mode: "practice",
      private: true,
      completed: true,
      score: 450,
      challenge,
      answers: [...prior, { score: 90, elapsedMs: 15000, hints: 0 }],
    });
    window.history.replaceState(null, "", `/one-line/?challenge=${token}`);
    mocks.ranked.begin.mockResolvedValue(
      run({ mode: "practice", private: true, challenge, answers: prior }),
    );
    mocks.ranked.lineAnswer.mockResolvedValue(complete);
    await mount();
    await begin();
    let path: number[] = [];
    while (!linePathState(puzzles[4], path).complete)
      path = hintLinePath(puzzles[4], path).path;
    for (const cell of path)
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`)!
          .click(),
      );
    expect(mocks.ranked.lineAnswer).toHaveBeenCalledWith(4, path);
    expect(container.querySelector(".line-total strong")?.textContent).toBe(
      "450",
    );
    expect(new URLSearchParams(window.location.search).get("result")).toBe(
      NEW_ID,
    );
    expect(new URLSearchParams(window.location.search).get("challenge")).toBe(
      token,
    );
    act(() => root!.unmount());
    root = undefined;
    mocks.ranked.begin.mockClear();
    mocks.ranked.lineStart.mockClear();
    mocks.ranked.lineAnswer.mockClear();
    mocks.access.user = null;
    mocks.access.blocked = true;
    mocks.ranked.resume.mockResolvedValue(complete);
    const interval = vi.spyOn(window, "setInterval");
    await mount();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(NEW_ID);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
    expect(mocks.ranked.lineAnswer).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(container.querySelector(".line-total strong")?.textContent).toBe(
      "450",
    );
    expect(container.textContent).toContain("Ты впереди!");
    expect(container.querySelector('[data-testid="save-result"]')).toBeNull();
  });
  it("keeps an unfinished result at welcome until the user explicitly resumes that exact run", async () => {
    window.history.replaceState(
      null,
      "",
      `/one-line/?result=${OLD_ID}&challenge=unfinished`,
    );
    mocks.ranked.resume.mockResolvedValue(
      run({ id: OLD_ID, mode: "practice" }),
    );
    const interval = vi.spyOn(window, "setInterval");
    await mount();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Эта партия ещё не завершена");
    expect(container.querySelector(".line-board")).toBeNull();
    await begin();
    expect(mocks.ranked.resume).toHaveBeenCalledTimes(2);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
  });
  it.each([403, 404, 410])(
    "keeps denied result reads (%s) at welcome without creating a new guest attempt",
    async (status) => {
      window.history.replaceState(
        null,
        "",
        `/one-line/?result=${OLD_ID}&challenge=unavailable`,
      );
      mocks.access.user = null;
      mocks.access.blocked = true;
      mocks.ranked.resume.mockRejectedValue(
        new mocks.ApiError("Эта партия недоступна", status),
      );
      await mount();
      expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
      expect(mocks.ranked.begin).not.toHaveBeenCalled();
      expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
      expect(container.querySelector(".line-total")).toBeNull();
      expect(container.querySelector(".line-board")).toBeNull();
    },
  );
  it.each(["begin", "resume"] as const)(
    "shows the existing completed result from %s without opening a new field or timer",
    async (source) => {
      const completed = run({
        id: source === "resume" ? OLD_ID : NEW_ID,
        completed: true,
        published: true,
        score: 430,
        answers: Array.from({ length: 5 }, () => ({
          score: 86,
          elapsedMs: 15_000,
          hints: 0,
        })),
      });
      if (source === "resume") {
        save();
        mocks.ranked.resume.mockResolvedValue(completed);
      } else mocks.ranked.begin.mockResolvedValue(completed);
      const interval = vi.spyOn(window, "setInterval");
      await mount();
      await begin();
      expect(container.textContent).toContain("Пять маршрутов найдены.");
      expect(container.querySelector(".line-total strong")?.textContent).toBe(
        "430",
      );
      expect(container.querySelectorAll(".line-results li")).toHaveLength(5);
      expect(container.querySelector(".line-board")).toBeNull();
      expect(container.querySelector(".line-stats")).toBeNull();
      expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
      expect(mocks.ranked.lineAnswer).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(STORAGE)!).completed).toBe(true);
    },
  );
});
