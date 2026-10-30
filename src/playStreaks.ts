export type PlayStreak = {
  current: number;
  best: number;
  playedToday: boolean;
  lastDay: string | null;
};
export type StreakEntry = {
  nickname: string;
  days: number;
  place: number;
  isMe: boolean;
};
export type StreakBoard = {
  day: string;
  page: number;
  limit: number;
  total: number;
  entries: StreakEntry[];
  mine: (StreakEntry & { best: number; playedToday: boolean }) | null;
};
export function streakDays(value: number) {
  const n = Math.abs(value) % 100;
  return `${value} ${n > 10 && n < 20 ? "дней" : n % 10 === 1 ? "день" : n % 10 >= 2 && n % 10 <= 4 ? "дня" : "дней"}`;
}
