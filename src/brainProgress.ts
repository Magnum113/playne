import type { BrainGameId } from "./brainContent";

export type BrainProgress = {
  today: {
    day: string;
    results: Partial<
      Record<
        BrainGameId,
        { id: string; completed: boolean; score: number | null; mode: string }
      >
    >;
  };
  last7Days: { day: string; gamesCompleted: number; score: number }[];
  weeklyDays: number;
  goal: { days: number; completedDays: number };
  suggestedLevels: Partial<Record<BrainGameId, number>>;
  history: {
    id: string;
    game: BrainGameId;
    mode: string;
    score: number;
    difficulty?: number;
    day?: string;
    completedAt?: string;
  }[];
};

export function brainDateLabel(
  day: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: "Europe/Moscow",
  }).format(new Date(`${day}T12:00:00Z`));
}
