// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TodayPlay from "../src/TodayPlay";
import type { PlayProgress } from "../src/playProgress";
import { dailyRunFixture, playProgressFixture } from "./playProgressFixture";

const mock = vi.hoisted(() => ({
  api: vi.fn(),
  user: { id: "a" } as { id: string } | null,
  authLoading: false,
}));
vi.mock("../src/account", () => ({
  api: (path: string) => mock.api(path),
  useAuth: () => ({
    user: mock.user,
    loading: mock.authLoading,
    ready: !mock.authLoading,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const favorite = (game: "pressure" | "geo") => ({
  game,
  completedRuns: 9,
  lastCompletedAt: "2026-10-29T12:00:00Z",
});
let box: HTMLDivElement, root: Root;
const render = () => act(async () => root.render(<TodayPlay />));
const primary = () =>
  box.querySelector<HTMLAnchorElement>(
    ".play-choice:not(.play-choice-secondary)",
  );
const week = () => box.querySelector(".play-week-link");
const retry = () => box.querySelector<HTMLButtonElement>(".play-refresh")!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T08:00:00Z"));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  mock.api.mockReset();
  mock.user = { id: "a" };
  mock.authLoading = false;
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TodayPlay with server-owned progress", () => {
  it("shows a loading state without inventing a zero counter or game recommendations", async () => {
    const request = deferred<PlayProgress>();
    mock.api.mockReturnValue(request.promise);
    await render();
    expect(box.querySelector('[role="status"]')?.textContent).toContain(
      "Подбираем игры",
    );
    expect(box.querySelector("section")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(week()).toBeNull();
    expect(box.querySelectorAll(".play-choice")).toHaveLength(0);
    expect(box.textContent).not.toContain("0 / 3");
    await act(async () =>
      request.resolve(
        playProgressFixture({
          goal: { days: 3, completedDays: 2 },
          daily: { slide: dailyRunFixture("slide") },
        }),
      ),
    );
    expect(week()?.textContent).toContain("2 / 3");
    expect(primary()?.getAttribute("href")).toBe("/brain/slide/");
    expect(primary()?.textContent).toContain("Продолжить");
    expect(box.querySelectorAll(".play-choice")).toHaveLength(2);
    expect(box.querySelector("section")?.hasAttribute("aria-busy")).toBe(false);
    expect(mock.api).toHaveBeenCalledWith("/play/progress");
  });

  it("uses a playable fallback after failure and restores personalized progress on retry", async () => {
    mock.api
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        playProgressFixture({
          goal: { days: 3, completedDays: 2 },
          favorites: [favorite("pressure")],
        }),
      );
    await render();
    const links = [...box.querySelectorAll<HTMLAnchorElement>(".play-choice")];
    expect(links).toHaveLength(2);
    expect(links[0].href).not.toBe(links[1].href);
    expect(week()).toBeNull();
    expect(box.textContent).not.toContain("0 / 3");
    expect(retry()?.textContent).toContain("Обновить рекомендации");
    await act(async () => retry().click());
    expect(primary()?.getAttribute("href")).toBe("/pressure/");
    expect(week()?.textContent).toContain("2 / 3");
    expect(retry()).toBeNull();
    expect(mock.api).toHaveBeenCalledTimes(2);
  });

  it("hides the previous account's progress immediately while the next identity loads", async () => {
    const next = deferred<PlayProgress>();
    mock.api
      .mockResolvedValueOnce(
        playProgressFixture({
          goal: { days: 3, completedDays: 3 },
          favorites: [favorite("pressure")],
        }),
      )
      .mockReturnValueOnce(next.promise);
    await render();
    expect(week()?.textContent).toContain("3 / 3");
    expect(primary()?.getAttribute("href")).toBe("/pressure/");
    mock.user = { id: "b" };
    await render();
    expect(week()).toBeNull();
    expect(primary()).toBeNull();
    expect(box.textContent).not.toContain("3 / 3");
    expect(box.textContent).not.toContain("0 / 3");
    await act(async () =>
      next.resolve(
        playProgressFixture({
          goal: { days: 3, completedDays: 1 },
          favorites: [favorite("geo")],
        }),
      ),
    );
    expect(week()?.textContent).toContain("1 / 3");
    expect(primary()?.getAttribute("href")).toBe("/geo/");
  });

  it("discards a late response from the previous identity", async () => {
    const old = deferred<PlayProgress>(),
      current = deferred<PlayProgress>();
    mock.api
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    await render();
    mock.user = { id: "b" };
    await render();
    await act(async () =>
      current.resolve(
        playProgressFixture({
          goal: { days: 3, completedDays: 1 },
          favorites: [favorite("geo")],
        }),
      ),
    );
    await act(async () =>
      old.resolve(
        playProgressFixture({
          goal: { days: 3, completedDays: 3 },
          favorites: [favorite("pressure")],
        }),
      ),
    );
    expect(week()?.textContent).toContain("1 / 3");
    expect(primary()?.getAttribute("href")).toBe("/geo/");
    expect(box.textContent).not.toContain("3 / 3");
  });

  it("discards an older overlapping refresh even for the same account", async () => {
    const old = deferred<PlayProgress>(),
      latest = deferred<PlayProgress>();
    mock.api
      .mockResolvedValueOnce(playProgressFixture())
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    await render();
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () =>
      latest.resolve(
        playProgressFixture({
          favorites: [favorite("geo")],
          goal: { days: 3, completedDays: 2 },
        }),
      ),
    );
    await act(async () =>
      old.resolve(
        playProgressFixture({
          favorites: [favorite("pressure")],
          goal: { days: 3, completedDays: 1 },
        }),
      ),
    );
    expect(primary()?.getAttribute("href")).toBe("/geo/");
    expect(week()?.textContent).toContain("2 / 3");
  });

  it("waits for authentication to settle before requesting personal recommendations", async () => {
    mock.authLoading = true;
    mock.api.mockResolvedValue(playProgressFixture());
    await render();
    expect(mock.api).not.toHaveBeenCalled();
    expect(week()).toBeNull();
    expect(primary()).toBeNull();
    mock.authLoading = false;
    await render();
    expect(mock.api).toHaveBeenCalledTimes(1);
    expect(box.querySelectorAll(".play-choice")).toHaveLength(2);
  });

  it.each(["focus", "visibility", "interval"])(
    "refreshes the Moscow day on %s and hides yesterday's snapshot",
    async (trigger) => {
      vi.setSystemTime(new Date("2026-10-29T20:59:50Z"));
      const next = deferred<PlayProgress>();
      mock.api
        .mockResolvedValueOnce(
          playProgressFixture({
            day: "2026-10-29",
            favorites: [favorite("pressure")],
            goal: { days: 3, completedDays: 2 },
          }),
        )
        .mockReturnValueOnce(next.promise);
      await render();
      expect(primary()?.getAttribute("href")).toBe("/pressure/");
      vi.setSystemTime(new Date("2026-10-29T21:00:01Z"));
      await act(async () => {
        if (trigger === "focus") window.dispatchEvent(new Event("focus"));
        else if (trigger === "visibility")
          document.dispatchEvent(new Event("visibilitychange"));
        else vi.advanceTimersByTime(30_000);
      });
      expect(mock.api).toHaveBeenCalledTimes(2);
      expect(week()).toBeNull();
      expect(primary()).toBeNull();
      expect(box.textContent).toContain("30 октября");
      expect(box.textContent).not.toContain("0 / 3");
      await act(async () =>
        next.resolve(
          playProgressFixture({
            day: "2026-10-30",
            goal: { days: 3, completedDays: 2 },
            daily: { rotate: dailyRunFixture("rotate") },
          }),
        ),
      );
      expect(primary()?.getAttribute("href")).toBe("/brain/rotate/");
      expect(week()?.textContent).toContain("2 / 3");
    },
  );

  it("rejects a stale server day instead of presenting yesterday's personal counter", async () => {
    mock.api.mockResolvedValueOnce(
      playProgressFixture({
        day: "2026-10-29",
        goal: { days: 3, completedDays: 3 },
        favorites: [favorite("pressure")],
      }),
    );
    await render();
    expect(week()).toBeNull();
    expect(retry()).toBeTruthy();
    expect(box.textContent).not.toContain("3 / 3");
    expect(primary()?.getAttribute("href")).not.toBe("/pressure/");
  });
});
