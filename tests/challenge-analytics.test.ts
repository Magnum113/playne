// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAIN_GOALS,
  METRIKA_COUNTER_ID,
  SHARE_GOALS,
  analyticsUrl,
  reachGoal,
  reachGoalOnce,
  trackChallengeStart,
  trackChallengeComplete,
  trackChallengeResult,
} from "../src/analytics";
import {
  challengeAnalyticsScript,
  challengeAnalyticsCsp,
} from "../server/challenge-analytics";

let ym = vi.fn();
beforeEach(() => {
  sessionStorage.clear();
  ym = vi.fn();
  window.ym = ym;
});
afterEach(() => {
  delete window.ym;
  document.body.innerHTML = "";
});
describe("challenge analytics", () => {
  it("never includes private queries, hashes or public link codes in page URLs", () => {
    for (const path of [
      "/circle/?challenge=secret&result=private#hash",
      "/c/secret",
      "/challenge/secret",
    ]) {
      const url = analyticsUrl("https://playne.ru" + path);
      expect(url).not.toMatch(/secret|private|hash/);
    }
    expect(analyticsUrl("https://playne.ru/brain/?level=2")).toBe(
      "https://playne.ru/brain/",
    );
    expect(analyticsUrl("")).toBe("");
    expect(analyticsUrl("https://playne.ru/c/secret?utm_source=telegram&utm_campaign=friends&challenge=secret")).toBe("https://playne.ru/challenge/?utm_source=telegram&utm_campaign=friends");
  });
  it("separates game-specific brain conversions without replacing existing goals", () => {
    reachGoal(BRAIN_GOALS.gameComplete, {
      game: "flash",
      mode: "practice",
      score: 200,
    });
    expect(ym.mock.calls.map((c) => c[2])).toEqual([
      "brain_game_complete",
      "flash_game_complete",
    ]);
    reachGoal(BRAIN_GOALS.roundComplete, { game: "flash" });
    expect(ym).toHaveBeenCalledTimes(3);
  });
  it("counts issued starts and confirmed completions once, and separates retries", () => {
    const run = {
      id: "analytics-retry-1",
      game: "circle",
      mode: "classic",
      challenge: { retryOf: "private-parent" },
    };
    trackChallengeStart(run, false);
    trackChallengeStart(run, false);
    trackChallengeComplete(run, 78);
    trackChallengeComplete(run, 78);
    expect(ym.mock.calls.map((c) => c[2])).toEqual([
      SHARE_GOALS.started,
      SHARE_GOALS.retryStarted,
      SHARE_GOALS.completed,
      SHARE_GOALS.retryCompleted,
    ]);
    expect(JSON.stringify(ym.mock.calls)).not.toMatch(
      /analytics-retry|private-parent/,
    );
    trackChallengeComplete({ id: "unrelated-run" }, 80);
    trackChallengeStart(
      { ...run, id: "already-completed", completed: true },
      true,
    );
    expect(ym).toHaveBeenCalledTimes(4);
  });
  it("does not lose a completion after page reload and marks comparison outcome", () => {
    sessionStorage.setItem(
      "playne:challenge-analytics:reloaded-run",
      JSON.stringify({
        game: "slide",
        mode: "practice",
        attempt_kind: "first",
        player: "account",
      }),
    );
    trackChallengeComplete({ id: "reloaded-run" }, 300);
    trackChallengeResult("comparison1", "slide", 300, 400);
    trackChallengeResult("comparison1", "slide", 300, 400);
    expect(ym.mock.calls.map((c) => c[2])).toEqual([
      SHARE_GOALS.completed,
      SHARE_GOALS.resultViewed,
    ]);
    expect(ym.mock.calls[1][3]).toMatchObject({
      outcome: "behind",
      reference_score: 400,
    });
  });
  it("does not break gameplay when session storage or Metrika are blocked", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("blocked");
      });
    expect(() =>
      reachGoalOnce(SHARE_GOALS.resultViewed, "blocked-storage", {
        game: "circle",
      }),
    ).not.toThrow();
    spy.mockRestore();
    delete window.ym;
    expect(() => trackChallengeComplete({ id: "no-tag" }, 30)).not.toThrow();
  });
  it("tracks human landing and acceptance separately, without leaking source title or URLs", () => {
    document.body.innerHTML =
      '<a class="cta" href="/circle/?challenge=secret">Принять вызов</a>';
    document.body.dataset.game = "circle";
    document.body.dataset.mode = "classic";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const append = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation((node) => node);
    new Function(challengeAnalyticsScript)();
    append.mockRestore();
    document
      .querySelector<HTMLAnchorElement>(".cta")!
      .dispatchEvent(new MouseEvent("click"));
    expect(ym.mock.calls[0]).toMatchObject([
      METRIKA_COUNTER_ID,
      "init",
      { webvisor: false, trackLinks: false, title: "Вызов друга · Playne" },
    ]);
    expect(
      ym.mock.calls.filter((c) => c[1] === "reachGoal").map((c) => c[2]),
    ).toEqual([SHARE_GOALS.landing, SHARE_GOALS.accepted]);
    expect(JSON.stringify(ym.mock.calls)).not.toContain("secret");
    expect(challengeAnalyticsCsp).toContain(
      "script-src 'self' https://mc.yandex.ru",
    );
    expect(challengeAnalyticsCsp).not.toContain("script-src 'unsafe-inline'");
  });
});
