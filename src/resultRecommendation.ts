import type { GameId } from "./account";
import { PLAY_GOALS, reachGoal, reachGoalOnce } from "./analytics";

export const resultRecommendations = {
  geo: "naglaz",
  naglaz: "colorfle",
} as const;

type Source = keyof typeof resultRecommendations;
type Recommendation = {
  from: Source;
  sourceRun: string;
  expiresAt: number;
  destinationRun?: string;
};

const key = "playne:result-recommendation";
const day = 24 * 60 * 60 * 1000;

export function hasResultRecommendation(game: GameId): game is Source {
  return game === "geo" || game === "naglaz";
}

function params(from: Source) {
  return {
    source: "result_card",
    from_game: from,
    game: resultRecommendations[from],
  };
}

function read(): Recommendation | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as
      | Recommendation
      | null;
    if (!value) return;
    if (
      hasResultRecommendation(value.from) &&
      typeof value.sourceRun === "string" &&
      Number.isFinite(value.expiresAt) &&
      Date.now() < value.expiresAt
    ) {
      return value;
    }
    sessionStorage.removeItem(key);
  } catch {
    // Private or unavailable storage must not affect gameplay.
  }
}

function write(value: Recommendation) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navigation still works with storage disabled.
  }
}

export function trackRecommendationShown(from: Source, sourceRun: string) {
  reachGoalOnce(PLAY_GOALS.nextGameShown, sourceRun, params(from));
}

export function trackRecommendationClick(
  from: Source,
  sourceRun: string | undefined,
  sameTab: boolean,
) {
  if (!sourceRun) {
    reachGoal(PLAY_GOALS.nextGame, params(from));
    return;
  }
  trackRecommendationShown(from, sourceRun);
  reachGoalOnce(PLAY_GOALS.nextGame, sourceRun, params(from));
  if (sameTab) write({ from, sourceRun, expiresAt: Date.now() + day });
}

export function bindRecommendationRun(game: GameId, runId: string) {
  if (game !== "naglaz" && game !== "colorfle") return;
  const value = read();
  if (
    value &&
    !value.destinationRun &&
    resultRecommendations[value.from] === game
  ) {
    write({ ...value, destinationRun: runId });
  }
}

export function trackRecommendationCompletion(game: GameId, runId: string) {
  if (game !== "naglaz" && game !== "colorfle") return;
  const value = read();
  if (
    !value ||
    value.destinationRun !== runId ||
    resultRecommendations[value.from] !== game
  )
    return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // The one-shot goal also deduplicates within the current page.
  }
  reachGoalOnce(PLAY_GOALS.nextGameCompleted, value.sourceRun, params(value.from));
}
