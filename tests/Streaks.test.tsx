// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { StreakBoardCard } from "../src/StreakLeaderboard";
import PlayStreak from "../src/PlayStreak";
import { streakDays } from "../src/playStreaks";
import { playProgressFixture } from "./playProgressFixture";
const mock = vi.hoisted(() => ({
  api: vi.fn(),
  goal: vi.fn(),
  user: { id: "one" } as { id: string } | null,
  progress: undefined as any,
}));
vi.mock("../src/account", () => ({
  api: (...args: unknown[]) => mock.api(...args),
  useAuth: () => ({ user: mock.user, loading: false }),
}));
vi.mock("../src/usePlayProgress", () => ({
  usePlayProgress: () => mock.progress,
}));
vi.mock("../src/analytics", () => ({
  ACCOUNT_GOALS: { leaderboardOpen: "leaderboard_open" },
  reachGoalOnce: (...args: unknown[]) => mock.goal(...args),
}));
vi.mock("../src/SiteHeader", () => ({ GameHeader: () => null }));
vi.mock("../src/FooterLinks", () => ({ default: () => null }));
let root: Root, box: HTMLDivElement;
const board = (nickname = "Игрок", page = 1) => ({
  day: "2026-10-30",
  page,
  limit: 25,
  total: 26,
  entries: [{ nickname, days: 5, place: 1, isMe: false }],
  mine: {
    nickname: "Я",
    days: 2,
    place: 4,
    best: 8,
    playedToday: true,
    isMe: true,
  },
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  mock.api.mockReset();
  mock.goal.mockReset();
  mock.user = { id: "one" };
  mock.api.mockResolvedValue(board());
  mock.progress = {
    data: playProgressFixture({
      streak: {
        current: 4,
        best: 8,
        playedToday: false,
        lastDay: "2026-10-29",
      },
    }),
    loading: false,
    error: false,
    refresh: vi.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([
  [0, "0 дней"],
  [1, "1 день"],
  [2, "2 дня"],
  [5, "5 дней"],
  [11, "11 дней"],
  [21, "21 день"],
  [111, "111 дней"],
])("formats %i days", (n, s) => expect(streakDays(n as number)).toBe(s));
it("shows current, personal record, a Moscow week and an achievable next mark", async () => {
  await act(async () => root.render(<PlayStreak />));
  expect(box.textContent).toContain("4 дня");
  expect(box.textContent).toContain("8 дней");
  expect(box.textContent).toContain("продли серию");
  expect(box.textContent).toContain("Следующая отметка — 7 дней");
  expect(box.querySelectorAll(".streak-calendar li")).toHaveLength(7);
  expect(box.querySelector("[aria-current=date]")).toBeTruthy();
  expect(box.textContent).not.toContain("Войди");
  mock.user = null;
  mock.progress.data = playProgressFixture({
    streak: { current: 0, best: 8, playedToday: false, lastDay: "2026-10-20" },
  });
  await act(async () => root.render(<PlayStreak />));
  expect(box.textContent).toContain("зажги серию");
  expect(box.textContent).toContain("8 дней");
  expect(box.textContent).toContain("Войди");
});
it("does not invent a zero streak on failure and offers a retry", async () => {
  mock.progress = {
    data: undefined,
    loading: false,
    error: true,
    refresh: vi.fn(),
  };
  await act(async () => root.render(<PlayStreak />));
  expect(box.textContent).toContain("Прогресс пока недоступен");
  expect(box.textContent).not.toContain("0 дней");
  await act(async () =>
    Array.from(box.querySelectorAll("button"))
      .find((b) => b.textContent === "Обновить прогресс")!
      .click(),
  );
  expect(mock.progress.refresh).toHaveBeenCalledOnce();
});
it("renders tied places, the current player outside the page, and paging with focus", async () => {
  await act(async () => root.render(<StreakBoardCard />));
  expect(box.textContent).toContain("Кто в огне");
  expect(box.textContent).toContain("№4 · 2 дня");
  mock.api.mockResolvedValue(board("Другой игрок", 2));
  await act(async () =>
    Array.from(box.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Дальше"))!
      .click(),
  );
  expect(mock.api).toHaveBeenLastCalledWith("/play/streaks?page=2&limit=25");
  expect(document.activeElement).toBe(box.querySelector("h2"));
});
it("hides another account’s personal placement while reloading", async () => {
  await act(async () => root.render(<StreakBoardCard />));
  expect(box.textContent).toContain("№4");
  mock.api.mockReturnValue(new Promise(() => {}));
  mock.user = { id: "two" };
  await act(async () => root.render(<StreakBoardCard />));
  expect(box.textContent).not.toContain("№4");
  expect(box.textContent).toContain("Загружаем серии");
});
it("shows an empty board and recovers from API failure without static fake leaders", async () => {
  mock.api.mockRejectedValueOnce(Error("offline"));
  await act(async () => root.render(<StreakBoardCard compact />));
  expect(box.textContent).toContain("Не удалось загрузить серии");
  mock.api.mockResolvedValue({ ...board(), entries: [], total: 0, mine: null });
  await act(async () =>
    Array.from(box.querySelectorAll("button"))
      .find((b) => b.textContent === "Повторить")!
      .click(),
  );
  expect(box.textContent).toContain("Первая серия может быть твоей");
  expect(box.querySelectorAll(".streak-rank-list li")).toHaveLength(0);
});
