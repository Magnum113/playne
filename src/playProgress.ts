import type { GameId } from "./account";

export const DAILY_PLAY_GAMES = [
  "line",
  "flash",
  "rotate",
  "slide",
  "dispatch",
] as const;
export type DailyPlayGame = (typeof DAILY_PLAY_GAMES)[number];
export type PlayDay = { day: string; gamesCompleted: number; score: number };
export type PlayProgress = {
  day: string;
  weekStart: string;
  last7Days: PlayDay[];
  week: PlayDay[];
  weeklyDays: number;
  goal: { days: number; completedDays: number };
  milestones: {
    completedWeeks: number;
    activeDaysThisMonth: number;
    totalActiveDays: number;
    tenDayMonths: number;
  };
  favorites: { game: GameId; completedRuns: number; lastCompletedAt: string }[];
  daily: Partial<
    Record<
      DailyPlayGame,
      {
        id: string;
        completed: boolean;
        completedRounds: number;
        totalRounds: number;
      }
    >
  >;
  recentCompletions: { id: string; game: GameId; completedAt: string }[];
};
