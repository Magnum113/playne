// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DailyGeoCard from "../src/DailyGeoCard";
import type { GeoDailyStatus } from "../src/geoDaily";

const { useStatus } = vi.hoisted(() => ({ useStatus: vi.fn() }));
vi.mock("../src/useGeoDailyStatus", () => ({ useGeoDailyStatus: useStatus }));
vi.mock("../src/geoAnalytics", () => ({
  geoDailyAction: vi.fn(),
  trackDailyAction: vi.fn(),
  useDailyImpression: () => ({ current: null }),
}));

const status: GeoDailyStatus = {
  day: "2026-11-12",
  speedScoring: true,
  leaders: [
    { nickname: "Первый игрок", place: 1, position: 1, score: 303, elapsedMs: 105_000 },
    { nickname: "Второй игрок", place: 2, position: 2, score: 290, elapsedMs: null },
    { nickname: "Третий игрок", place: 2, position: 3, score: 290, elapsedMs: 125_000 },
  ],
  attempt: null,
};

class MediaPreference extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

let root: Root;
let box: HTMLDivElement;
let mobile: MediaPreference;
let reduced: MediaPreference;
let observe: (entries: Partial<IntersectionObserverEntry>[]) => void;

const render = () => act(async () => root.render(<DailyGeoCard />));
const visible = (isIntersecting: boolean) => act(async () => observe([{ isIntersecting }]));
const advance = (ms = 2500) => act(async () => { vi.advanceTimersByTime(ms); });
const list = () => box.querySelector<HTMLOListElement>(".daily-geo-leader-window ol")!;
const position = () => Number(list().style.getPropertyValue("--daily-geo-leader-index"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mobile = new MediaPreference(true);
  reduced = new MediaPreference(false);
  vi.stubGlobal("matchMedia", (query: string) => query.includes("max-width") ? mobile : reduced);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof observe) { observe = callback; }
    observe() {}
    disconnect() {}
  });
  useStatus.mockReturnValue(status);
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

it("slides complete daily results every 2.5 seconds and loops to the first row", async () => {
  await render();
  await visible(true);
  await advance(2499);
  expect(position()).toBe(0);
  await advance(1);
  expect(position()).toBe(1);
  expect(list().children[1].textContent).toContain("Второй игрок290");
  await advance();
  expect(position()).toBe(2);
  expect(list().children[2].textContent).toContain("Третий игрок2902:05");
  await advance();
  expect(position()).toBe(3);
  expect(list().children[3].textContent).toBe(list().children[0].textContent);
  expect(list().children[3].getAttribute("aria-hidden")).toBe("true");
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "transform" });
  await act(async () => list().dispatchEvent(event));
  expect(position()).toBe(0);
  expect(list().classList.contains("is-resetting")).toBe(true);
});

it("keeps the wide layout static and pauses mobile rotation offscreen or with reduced motion", async () => {
  mobile.matches = false;
  await render();
  await visible(true);
  await advance();
  expect(position()).toBe(0);
  expect(list().querySelectorAll("li:not([aria-hidden])")).toHaveLength(3);
  await act(async () => mobile.change(true));
  await visible(false);
  await advance();
  expect(position()).toBe(0);
  await visible(true);
  await act(async () => reduced.change(true));
  await advance();
  expect(position()).toBe(0);
  await act(async () => reduced.change(false));
  await advance();
  expect(position()).toBe(1);
});

it("starts after live results arrive and leaves a single leader in place", async () => {
  useStatus.mockReturnValue(null);
  await render();
  await visible(true);
  useStatus.mockReturnValue({ ...status, leaders: status.leaders.slice(0, 1) });
  await render();
  await advance();
  expect(position()).toBe(0);
  expect(list().children).toHaveLength(1);
  useStatus.mockReturnValue(status);
  await render();
  await advance();
  expect(position()).toBe(1);
});
