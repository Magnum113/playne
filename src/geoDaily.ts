import { lineMoscowDate } from "./line";
import { geoClock, type GeoAnswer } from "./geo";

export const GEO_DAILY_URL = "/geo/?mode=daily";
export const geoDailyBoardUrl = (day?: string) =>
  "/leaderboard/?game=geo&mode=daily&period=all" +
  (day ? "&day=" + encodeURIComponent(day) : "");

export type GeoDailyStatus = {
  day: string;
  speedScoring: boolean;
  leaders: {
    nickname: string;
    place: number;
    position: number;
    score: number;
    elapsedMs: number | null;
  }[];
  attempt: {
    id: string;
    completed: boolean;
    published: boolean;
    score: number | null;
  } | null;
};

// Speed can preserve up to 10% of the points earned by the guess.
export function geoDailyScore(accuracy: number, elapsedMs: number) {
  const speed = Math.max(0, 1 - elapsedMs / 180_000);
  return Math.round(accuracy * (0.9 + 0.1 * speed));
}

export function geoDailyElapsed(answers: Pick<GeoAnswer, "elapsedMs">[]) {
  return answers.length && answers.every((answer) => answer.elapsedMs !== undefined)
    ? answers.reduce((sum, answer) => sum + answer.elapsedMs!, 0)
    : null;
}

export function geoDailyTime(elapsedMs: number) {
  return geoClock(Math.floor(elapsedMs / 1000));
}

export const geoDailyDate = lineMoscowDate;

export function validGeoDailyDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function geoDailyLabel(day: string) {
  return new Date(day + "T12:00:00Z").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  });
}
