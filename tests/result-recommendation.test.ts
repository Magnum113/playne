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
  trackRecommendationShown({ from: "geo" }, "private-geo-run");
  trackRecommendationShown({ from: "geo" }, "private-geo-run");
  trackRecommendationClick({ from: "geo" }, "private-geo-run", true);
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
  trackRecommendationClick({ from: "naglaz" }, "new-tab", false);
  bindRecommendationRun("colorfle", "new-tab-color");
  trackRecommendationCompletion("colorfle", "new-tab-color");
  trackRecommendationClick({ from: "naglaz" }, "old-result", true);
  bindRecommendationRun("colorfle", "old-color");
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  trackRecommendationCompletion("colorfle", "old-color");
  expect(ym.mock.calls.map((call) => call[2])).not.toContain(
    PLAY_GOALS.nextGameCompleted,
  );
});

it("measures both Colorfle cards separately and attributes the selected mode only", () => {
  const mode = { from: "colorfle", fromMode: "classic" } as const;
  const game = { from: "colorfle" } as const;
  trackRecommendationShown(mode, "shade-result");
  trackRecommendationShown(game, "shade-result");
  trackRecommendationShown(mode, "shade-result");
  trackRecommendationClick(mode, "shade-result", true);
  bindRecommendationRun("colorfle", "classic-replay", "classic");
  trackRecommendationCompletion("colorfle", "classic-replay", "classic");
  bindRecommendationRun("colorfle", "timed-run", "timed");
  trackRecommendationCompletion("colorfle", "timed-run", "timed");
  trackRecommendationClick(game, "shade-result", true);
  bindRecommendationRun("circle", "circle-result");
  trackRecommendationCompletion("circle", "circle-result");
  expect(ym.mock.calls.map((call) => call.slice(2))).toEqual([
    [PLAY_GOALS.nextGameShown, { source: "result_mode_card", from_game: "colorfle", game: "colorfle", from_mode: "classic", mode: "timed" }],
    [PLAY_GOALS.nextGameShown, { source: "result_card", from_game: "colorfle", game: "circle" }],
    [PLAY_GOALS.nextGame, { source: "result_mode_card", from_game: "colorfle", game: "colorfle", from_mode: "classic", mode: "timed" }],
    [PLAY_GOALS.nextGameCompleted, { source: "result_mode_card", from_game: "colorfle", game: "colorfle", from_mode: "classic", mode: "timed" }],
    [PLAY_GOALS.nextGame, { source: "result_card", from_game: "colorfle", game: "circle" }],
    [PLAY_GOALS.nextGameCompleted, { source: "result_card", from_game: "colorfle", game: "circle" }],
  ]);
});

it.each([
  ["flow", "line"],
  ["circle", "pressure"],
] as const)("attributes a %s recommendation to the accepted %s result", (from, game) => {
  const offer = { from };
  const sourceRun = `${from}-result`;
  const nextRun = `${game}-run`;
  trackRecommendationShown(offer, sourceRun);
  trackRecommendationClick(offer, sourceRun, true);
  bindRecommendationRun(game, nextRun, "classic");
  trackRecommendationCompletion(game, nextRun, "classic");
  expect(ym.mock.calls.map((call) => call.slice(2))).toEqual(
    [PLAY_GOALS.nextGameShown, PLAY_GOALS.nextGame, PLAY_GOALS.nextGameCompleted]
      .map((goal) => [goal, { source: "result_card", from_game: from, game }]),
  );
});
