import { geoDailyTime } from "./geoDaily";

export const MALOKTO_ROUNDS = 5;
export const MALOKTO_READ_MS = 2_000;
export const MALOKTO_ROUND_MS = 30_000;
export const MALOKTO_MAX = 500;
export const maloktoTiers = { 25: "Частый", 45: "Знакомый", 70: "Редкий", 100: "Находка" } as const;

export type MaloktoAnswer = {
  name: string | null;
  score: number;
  elapsedMs: number;
};
export type MaloktoQuestion = {
  prompt: string;
  category: string;
  deadline: number;
  serverNow: number;
};
export type MaloktoReview = {
  prompt: string;
  category: string;
  answer: MaloktoAnswer;
  examples: { name: string; score: number }[];
  matches: number;
};
export const maloktoBoardUrl = (day?: string) =>
  `/leaderboard/?game=malokto&mode=daily${day ? "&day=" + encodeURIComponent(day) : ""}`;

export function maloktoTime(elapsedMs: number) {
  return `${geoDailyTime(elapsedMs)},${Math.floor(elapsedMs / 100) % 10}`;
}
