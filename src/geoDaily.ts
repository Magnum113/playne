import { lineMoscowDate } from "./line";

export const GEO_DAILY_URL = "/geo/?mode=daily";
export const geoDailyBoardUrl = (day?: string) =>
  "/leaderboard/?game=geo&mode=daily&period=all" +
  (day ? "&day=" + encodeURIComponent(day) : "");

export type GeoDailyStatus = {
  day: string;
  attempt: {
    id: string;
    completed: boolean;
    published: boolean;
    score: number | null;
  } | null;
};

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
