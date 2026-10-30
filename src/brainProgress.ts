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

export function brainWeekDays(
  today: string,
  activity: BrainProgress["last7Days"],
) {
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const byDay = new Map(activity.map((day) => [day.day, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    const isFuture = day > today;
    const record = isFuture ? undefined : byDay.get(day);
    return {
      day,
      gamesCompleted: record?.gamesCompleted ?? 0,
      score: record?.score ?? 0,
      isToday: day === today,
      isFuture,
    };
  });
}

export function brainDateLabel(
  day: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: "Europe/Moscow",
  }).format(new Date(`${day}T12:00:00Z`));
}
