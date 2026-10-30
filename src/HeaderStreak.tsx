import StreakFlame from "./StreakFlame";
import { streakDays } from "./playStreaks";
import { usePlayProgress } from "./usePlayProgress";
import "./streak.css";

export default function HeaderStreak() {
  const { data, loading, error } = usePlayProgress();
  return (
    <HeaderStreakLink
      days={data?.streak.current}
      loading={loading}
      error={error}
    />
  );
}

export function HeaderStreakLink({
  days,
  loading = false,
  error = false,
}: {
  days?: number;
  loading?: boolean;
  error?: boolean;
}) {
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
