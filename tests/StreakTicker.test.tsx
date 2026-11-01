// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StreakTicker from "../src/StreakTicker";
import { StreakBoardCard } from "../src/StreakLeaderboard";
import type { StreakBoard } from "../src/playStreaks";
const mock = vi.hoisted(() => ({ fire: vi.fn(() => vi.fn()), api: vi.fn() }));
vi.mock("../src/buttonFire", () => ({ attachButtonFire: mock.fire }));
vi.mock("../src/account", () => ({ api: (...args: unknown[]) => mock.api(...args), useAuth: () => ({ user: null, loading: false }) }));
vi.mock("../src/SiteHeader", () => ({ GameHeader: () => null }));
vi.mock("../src/FooterLinks", () => ({ default: () => null }));
vi.mock("../src/PlayStreak", () => ({ default: () => null }));
class Preference extends EventTarget { matches = false; change(v: boolean) { this.matches = v; this.dispatchEvent(new Event("change")); } }
let motion: Preference, observer: (entries: Partial<IntersectionObserverEntry>[]) => void;
let root: Root, box: HTMLDivElement;
const board: StreakBoard = { day: "2026-11-01", page: 1, limit: 5, total: 3, mine: null, entries: [
  { nickname: "Первый игрок", days: 21, place: 1, isMe: false },
  { nickname: "Очень длинное имя второго игрока", days: 12, place: 2, isMe: false },
  { nickname: "Третий игрок", days: 12, place: 2, isMe: false },
] };
const summary = () => box.querySelector("summary")!;
const advance = async () => act(async () => { vi.advanceTimersByTime(4000); });
const see = async (visible = true) => act(async () => observer([{ isIntersecting: visible }]));
const render = async (data: StreakBoard | null = board, error = false) => act(async () => root.render(<StreakTicker data={data} error={error}><p>Весь список</p></StreakTicker>));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  motion = new Preference();
  vi.stubGlobal("matchMedia", () => motion);
  vi.stubGlobal("IntersectionObserver", class { constructor(fn: typeof observer) { observer = fn; } observe() {} disconnect() {} });
  mock.fire.mockClear(); mock.api.mockReset(); mock.api.mockResolvedValue(board);
  box = document.createElement("div"); document.body.append(box); root = createRoot(box);
});
afterEach(() => { act(() => root.unmount()); box.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("uses the same API snapshot for the summary and expanded list, preserving tied places", async () => {
  await act(async () => root.render(<StreakBoardCard compact disclosure />));
  expect(mock.api).toHaveBeenCalledExactlyOnceWith("/play/streaks?page=1&limit=5");
  expect(summary().getAttribute("aria-label")).toContain("№1, Первый игрок, 21 день");
  expect(box.querySelectorAll(".streak-rank-list li")).toHaveLength(3);
  expect(box.textContent).not.toContain("Кто играет каждый день");
});
it("rotates only when visible, preserves tied ranks and loops without reverse scrolling", async () => {
  await render(); await advance();
  expect(summary().getAttribute("aria-label")).toContain("Первый");
  await see(); expect(mock.fire).toHaveBeenCalledOnce();
  await advance(); expect(summary().getAttribute("aria-label")).toContain("№2, Очень длинное");
  await advance(); expect(summary().getAttribute("aria-label")).toContain("№2, Третий");
  await advance(); expect(summary().getAttribute("aria-label")).toContain("Первый");
  const event = new Event("transitionend", { bubbles: true }); Object.defineProperty(event, "propertyName", { value: "transform" });
  await act(async () => box.querySelector(".streak-ticker-track")!.dispatchEvent(event));
  expect((box.querySelector(".streak-ticker-track") as HTMLElement).style.transform).toBe("translateY(-0em)");
  await advance(); expect(summary().getAttribute("aria-label")).toContain("Очень длинное");
});
it("opens the native disclosure and stops rotation, with no explanatory copy", async () => {
  await render(); await see();
  await act(async () => { const details = box.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); });
  await advance(); expect(summary().getAttribute("aria-label")).toContain("Первый");
  expect(box.querySelector(".streak-ticker-pause")).toBeNull();
  expect(box.querySelector("details")!.open).toBe(true);
});
it("rotates automatically without a separate pause control or opening the list", async () => {
  await render(); await see();
  expect(box.querySelector("button")).toBeNull();
  expect(box.querySelector("details")!.open).toBe(false);
  await advance(); expect(summary().getAttribute("aria-label")).toContain("Очень длинное");
});
it("stops for reduced motion, hidden tabs, focus and offscreen content", async () => {
  await render(); await see();
  await act(async () => motion.change(true)); await advance();
  expect(summary().getAttribute("aria-label")).toContain("Первый");
  expect(box.querySelector(".streak-ticker-pause")).toBeNull();
  await act(async () => motion.change(false));
  await act(async () => summary().focus()); await advance();
  expect(summary().getAttribute("aria-label")).toContain("Первый");
  await act(async () => summary().blur());
  await see(false); await advance(); expect(summary().getAttribute("aria-label")).toContain("Первый");
  await see();
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange"))); await advance();
  expect(summary().getAttribute("aria-label")).toContain("Первый");
  vi.restoreAllMocks();
});
it("handles loading, API failure, empty and single-player boards without fake people", async () => {
  await render(null); expect(summary().textContent).toContain("Загружаем серии");
  await render(null, true); expect(summary().textContent).toContain("Серии пока недоступны");
  await render({ ...board, entries: [] }); expect(summary().textContent).toContain("Кто зажжёт первым?");
  await render({ ...board, entries: [board.entries[0]] }); await see(); await advance();
  expect(summary().getAttribute("aria-label")).toContain("Первый");
});
it("replaces the visible player immediately when the account snapshot changes and cleans timers", async () => {
  await render(); await see(); await advance();
  await render({ ...board, entries: [{ ...board.entries[0], nickname: "Новый игрок" }] });
  expect(summary().getAttribute("aria-label")).toContain("Новый игрок");
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
