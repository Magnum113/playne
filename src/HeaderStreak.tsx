import StreakFlame from "./StreakFlame";
import { streakDays } from "./playStreaks";
import { usePlayProgress } from "./usePlayProgress";
import "./streak.css";

export default function HeaderStreak() {
  const { data, loading, error } = usePlayProgress();
  const days = data?.streak.current;
  const label =
    days !== undefined
      ? `Ударная серия: ${streakDays(days)}`
      : error
        ? "Ударная серия недоступна"
        : "Загружаем ударную серию";
  return (
    <a
      className={`header-streak${days ? " is-active" : ""}`}
      href="/leaderboard/?game=streak"
      aria-label={label}
      aria-busy={loading || undefined}
      title={label}
    >
      <StreakFlame active={!!days} />
      <span aria-hidden="true">{days ?? "—"}</span>
    </a>
  );
}
