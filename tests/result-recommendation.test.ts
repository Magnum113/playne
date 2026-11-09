// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://playne.ru/"}
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PLAY_GOALS } from "../src/analytics";
import {
  bindRecommendationRun,
  trackRecommendationClick,
  trackRecommendationCompletion,
  trackRecommendationShown,
} from "../src/resultRecommendation";

const ym = vi.fn();
beforeEach(() => {
  sessionStorage.clear();
  ym.mockClear();
  window.ym = ym;
});
afterEach(() => {
  delete window.ym;
  vi.useRealTimers();
});

it("attributes only the accepted destination run, and counts each step once", () => {
  trackRecommendationShown("geo", "private-geo-run");
  trackRecommendationShown("geo", "private-geo-run");
  trackRecommendationClick("geo", "private-geo-run", true);
  bindRecommendationRun("colorfle", "unrelated-color-run");
  bindRecommendationRun("naglaz", "private-first-size-run");
  bindRecommendationRun("naglaz", "private-second-size-run");
  trackRecommendationCompletion("naglaz", "private-second-size-run");
  expect(ym.mock.calls.map((call) => call[2])).toEqual([
    PLAY_GOALS.nextGameShown,
    PLAY_GOALS.nextGame,
  ]);
  trackRecommendationCompletion("naglaz", "private-first-size-run");
  trackRecommendationCompletion("naglaz", "private-first-size-run");
  expect(ym).toHaveBeenCalledTimes(3);
  expect(ym.mock.calls[2].slice(2)).toEqual([
    PLAY_GOALS.nextGameCompleted,
    { source: "result_card", from_game: "geo", game: "naglaz" },
  ]);
  expect(JSON.stringify(ym.mock.calls)).not.toContain("private-");
});

it("does not attribute a new-tab click or a completion outside the 24-hour window", () => {
  vi.useFakeTimers();
  trackRecommendationClick("naglaz", "new-tab", false);
  bindRecommendationRun("colorfle", "new-tab-color");
  trackRecommendationCompletion("colorfle", "new-tab-color");
  trackRecommendationClick("naglaz", "old-result", true);
  bindRecommendationRun("colorfle", "old-color");
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  trackRecommendationCompletion("colorfle", "old-color");
  expect(ym.mock.calls.map((call) => call[2])).not.toContain(
    PLAY_GOALS.nextGameCompleted,
  );
});
