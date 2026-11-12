import type { GameId } from "./account";
import { PLAY_GOALS, reachGoal, reachGoalOnce, type MetrikaParams } from "./analytics";
import { alternateShadeMode, validShadeMode, type ShadeMode } from "./colorfle";

export const resultRecommendations = {
  perception: "naglaz",
  geo: "naglaz",
  naglaz: "colorfle",
  colorfle: "circle",
  circle: "pressure",
  flow: "line",
} as const;

type Source = keyof typeof resultRecommendations;
export type ResultOffer =
  | { from: Source; fromMode?: never }
  | { from: "colorfle"; fromMode: ShadeMode };

type Recommendation = ResultOffer & {
  sourceRun: string;
  expiresAt: number;
  destinationRun?: string;
};

const key = "playne:result-recommendation";
const day = 24 * 60 * 60 * 1000;

export function hasResultRecommendation(game: GameId): game is Source {
  return Object.hasOwn(resultRecommendations, game);
}

function params({ from, fromMode }: ResultOffer): MetrikaParams {
  if (fromMode !== undefined)
    return {
      source: "result_mode_card",
      from_game: from,
      game: from,
      from_mode: fromMode,
      mode: alternateShadeMode(fromMode),
    };
  return { source: "result_card", from_game: from, game: resultRecommendations[from] };
}

function offerKey(offer: ResultOffer, runId: string) {
  return offer.fromMode === undefined ? runId : `${runId}:mode:${offer.fromMode}`;
}

function read(): Recommendation | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as
      | Recommendation
      | null;
    if (!value) return;
    if (
      hasResultRecommendation(value.from) &&
      (value.fromMode === undefined ||
        (value.from === "colorfle" && validShadeMode(value.fromMode))) &&
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

export function trackRecommendationShown(offer: ResultOffer, sourceRun: string) {
  reachGoalOnce(PLAY_GOALS.nextGameShown, offerKey(offer, sourceRun), params(offer));
}

export function trackRecommendationClick(
  offer: ResultOffer,
  sourceRun: string | undefined,
  sameTab: boolean,
) {
  if (!sourceRun) {
    reachGoal(PLAY_GOALS.nextGame, params(offer));
    return;
  }
  trackRecommendationShown(offer, sourceRun);
  reachGoalOnce(PLAY_GOALS.nextGame, offerKey(offer, sourceRun), params(offer));
  if (sameTab) write({ ...offer, sourceRun, expiresAt: Date.now() + day });
}

function matches(offer: ResultOffer, game: GameId, mode?: string) {
  const destination = params(offer);
  return destination.game === game &&
    (destination.mode === undefined || destination.mode === mode);
}

export function bindRecommendationRun(game: GameId, runId: string, mode?: string) {
  const value = read();
  if (value && !value.destinationRun && matches(value, game, mode)) {
    write({ ...value, destinationRun: runId });
  }
}

export function trackRecommendationCompletion(game: GameId, runId: string, mode?: string) {
  const value = read();
  if (!value || value.destinationRun !== runId || !matches(value, game, mode))
    return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // The one-shot goal also deduplicates within the current page.
  }
  reachGoalOnce(PLAY_GOALS.nextGameCompleted, offerKey(value, value.sourceRun), params(value));
}
