// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HeaderStreak from "../src/HeaderStreak";
import { PLAY_PROGRESS_UPDATED } from "../src/playProgress";
import { playProgressFixture } from "./playProgressFixture";

const mock = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { user: { id: "one" } as { id: string } | null, loading: false },
}));
vi.mock("../src/account", () => ({
  api: (...args: unknown[]) => mock.api(...args),
  useAuth: () => mock.auth,
}));
let root: Root, box: HTMLDivElement;
const progress = (current: number) =>
  playProgressFixture({
    streak: { current, best: current, playedToday: true, lastDay: "2026-10-30" },
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.api.mockReset();
  mock.api.mockResolvedValue(progress(3));
  mock.auth.user = { id: "one" };
  mock.auth.loading = false;
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("shows only the flame and count, with an accessible link to streaks", async () => {
  await act(async () => root.render(<HeaderStreak />));
  expect(box.textContent).toBe("3");
  expect(box.querySelector("a")?.getAttribute("aria-label")).toBe("Ударная серия: 3 дня");
  expect(box.querySelector("a")?.getAttribute("href")).toBe("/leaderboard/?game=streak");
  expect(box.querySelector(".streak-flame.is-lit")).toBeTruthy();
});
it("refreshes when a completed game updates progress", async () => {
  await act(async () => root.render(<HeaderStreak />));
  mock.api.mockResolvedValue(progress(4));
  await act(async () => window.dispatchEvent(new Event(PLAY_PROGRESS_UPDATED)));
  expect(box.textContent).toBe("4");
  expect(mock.api).toHaveBeenLastCalledWith("/play/progress");
});
it("shows zero for a new guest, without a lit flame", async () => {
  mock.auth.user = null;
  mock.api.mockResolvedValue(progress(0));
  await act(async () => root.render(<HeaderStreak />));
  expect(box.textContent).toBe("0");
  expect(box.querySelector(".streak-flame.is-lit")).toBeNull();
});
it("does not turn a request failure into a zero streak", async () => {
  mock.api.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(<HeaderStreak />));
  expect(box.textContent).toBe("—");
  expect(box.querySelector("a")?.getAttribute("aria-label")).toBe("Ударная серия недоступна");
});
it("hides the previous account's streak while the next account loads", async () => {
  await act(async () => root.render(<HeaderStreak />));
  let resolve!: (data: ReturnType<typeof progress>) => void;
  mock.api.mockReturnValue(new Promise((done) => { resolve = done; }));
  mock.auth.user = { id: "two" };
  await act(async () => root.render(<HeaderStreak />));
  expect(box.textContent).toBe("—");
  await act(async () => resolve(progress(9)));
  expect(box.textContent).toBe("9");
});
