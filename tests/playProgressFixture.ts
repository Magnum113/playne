import {
  DAILY_PLAY_GAMES,
  type DailyPlayGame,
  type PlayProgress,
} from "../src/playProgress";

export function playProgressFixture(
  overrides: Partial<PlayProgress> = {},
): PlayProgress {
  const day = overrides.day ?? "2026-10-30";
  const today = new Date(`${day}T12:00:00Z`);
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const activeDays = overrides.goal?.completedDays ?? overrides.weeklyDays ?? 0;
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    return {
      day: dateKey,
      gamesCompleted: index < activeDays && dateKey <= day ? 1 : 0,
      score: index < activeDays && dateKey <= day ? 100 : 0,
    };
  });
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const dateKey = date.toISOString().slice(0, 10);
    return (
      week.find((record) => record.day === dateKey) ?? {
        day: dateKey,
        gamesCompleted: 0,
        score: 0,
      }
    );
  });
  return {
    streak: { current: 0, best: 0, playedToday: false, lastDay: null },
    day,
    weekStart: monday.toISOString().slice(0, 10),
    week,
    last7Days,
    weeklyDays: activeDays,
    goal: { days: 3, completedDays: activeDays },
    milestones: {
      completedWeeks: 0,
      activeDaysThisMonth: activeDays,
      totalActiveDays: activeDays,
      tenDayMonths: 0,
    },
    favorites: [],
    daily: {},
    recentCompletions: [],
    ...overrides,
  };
}

export function dailyRunFixture(game: DailyPlayGame, completed = false) {
  return {
    id: `12345678-1234-4234-8234-12345678900${DAILY_PLAY_GAMES.indexOf(game) + 1}`,
    completed,
    completedRounds: completed ? 5 : 2,
    totalRounds: 5,
  };
}

export function completedDailyFixtures(): PlayProgress["daily"] {
  return Object.fromEntries(
    DAILY_PLAY_GAMES.map((game) => [game, dailyRunFixture(game, true)]),
  );
}
