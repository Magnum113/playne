// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LineGame from "../src/LineGame";
import { getDailyLinePuzzles } from "../src/line";
import type { ServerRun } from "../src/rankedQueue";

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(message: string, public status: number) { super(message); }
  }
  return {
    ApiError,
    access: {
      user: { id: "test-player" } as { id: string } | null,
      loading: false,
      ready: true,
      blocked: false,
      resume: false,
      trial: undefined as { id: string; mode: "classic" | "practice"; completed: boolean } | undefined,
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
  useGuestTrial: () => mocks.access,
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
  localStorage.setItem(STORAGE, JSON.stringify({ id: OLD_ID, mode, day, index: 0, path: [], completed: false }));
}

async function mount() {
  root = createRoot(container);
  await act(async () => root!.render(<LineGame />));
}

async function begin() {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((entry) => entry.textContent?.includes("Начать игру"));
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
  mocks.ranked.state = { status: "ready", message: undefined };
  for (const mock of [mocks.ranked.begin, mocks.ranked.resume, mocks.ranked.lineStart, mocks.ranked.lineHint, mocks.ranked.lineAnswer])
    mock.mockReset();
  mocks.ranked.begin.mockResolvedValue(run());
  mocks.ranked.lineStart.mockResolvedValue({ startedAt: NOW - 12_000, serverNow: NOW, hints: 0 });
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
  it.each([403, 404, 410])("starts the selected mode when a saved party is definitively unavailable (%s)", async (status) => {
    window.history.replaceState(null, "", "/one-line/?mode=practice");
    save("practice");
    mocks.ranked.resume.mockRejectedValue(new mocks.ApiError("Эта партия недоступна", status));
    mocks.ranked.begin.mockResolvedValue(run({ mode: "practice" }));
    await mount();
    await begin();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
    expect(mocks.ranked.begin).toHaveBeenCalledExactlyOnceWith("practice");
    expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
    expect(container.querySelector(".line-board")).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).id).toBe(NEW_ID);
  });

  it("keeps the saved party and does not fall back to a new one after a network failure", async () => {
    save();
    mocks.ranked.state = { status: "error", message: "Не удалось восстановить соединение" };
    mocks.ranked.resume.mockResolvedValue(null);
    await mount();
    await begin();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
    expect(container.querySelector(".line-board")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).id).toBe(OLD_ID);
    expect(container.textContent).toContain("Не удалось восстановить соединение");
  });

  it("starts today's classic for a signed-in player instead of resuming yesterday's saved party", async () => {
    save("classic", "2026-10-28");
    await mount();
    await begin();
    expect(mocks.ranked.resume).not.toHaveBeenCalled();
    expect(mocks.ranked.begin).toHaveBeenCalledExactlyOnceWith("classic");
    expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
    expect(container.textContent).toContain(`Поля дня · ${DAY}`);
    expect(JSON.parse(localStorage.getItem(STORAGE)!).day).toBe(DAY);
  });

  it("can still resume yesterday's practice because practice has no daily attempt boundary", async () => {
    window.history.replaceState(null, "", "/one-line/?mode=practice");
    save("practice", "2026-10-28");
    mocks.ranked.resume.mockResolvedValue(run({ id: OLD_ID, mode: "practice" }));
    await mount();
    await begin();
    expect(mocks.ranked.resume).toHaveBeenCalledExactlyOnceWith(OLD_ID);
    expect(mocks.ranked.begin).not.toHaveBeenCalled();
    expect(mocks.ranked.lineStart).toHaveBeenCalledExactlyOnceWith(0);
  });
});

describe("one-line completed-party recovery", () => {
  it.each(["begin", "resume"] as const)("shows the existing completed result from %s without opening a new field or timer", async (source) => {
    const completed = run({
      id: source === "resume" ? OLD_ID : NEW_ID,
      completed: true,
      published: true,
      score: 430,
      answers: Array.from({ length: 5 }, () => ({ score: 86, elapsedMs: 15_000, hints: 0 })),
    });
    if (source === "resume") {
      save();
      mocks.ranked.resume.mockResolvedValue(completed);
    } else mocks.ranked.begin.mockResolvedValue(completed);
    const interval = vi.spyOn(window, "setInterval");
    await mount();
    await begin();
    expect(container.textContent).toContain("Пять маршрутов найдены.");
    expect(container.querySelector(".line-total strong")?.textContent).toBe("430");
    expect(container.querySelectorAll(".line-results li")).toHaveLength(5);
    expect(container.querySelector(".line-board")).toBeNull();
    expect(container.querySelector(".line-stats")).toBeNull();
    expect(mocks.ranked.lineStart).not.toHaveBeenCalled();
    expect(mocks.ranked.lineAnswer).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE)!).completed).toBe(true);
  });
});
