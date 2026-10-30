import StreakFlame from "./StreakFlame";
import { streakDays } from "./playStreaks";
import { usePlayProgress } from "./usePlayProgress";
import { useAuth } from "./account";
import "./streak.css";

export default function PlayStreak({ revision }: { revision?: string }) {
  const { data, loading, error, refresh } = usePlayProgress(revision);
  const { user } = useAuth();
  const streak = data?.streak;
  const target =
    [3, 7, 14, 30, 60, 100, 365].find((n) => n > (streak?.current ?? 0)) ??
    Math.ceil(((streak?.current ?? 0) + 1) / 100) * 100;
  return (
    <section
      className="streak-personal"
      aria-label="Твоя ударная серия"
      aria-busy={loading}
    >
      <div className="streak-personal-main">
        <StreakFlame active={!!streak?.current} animated={!!streak?.current} />
        <div>
          <p className="eyebrow">УДАРНАЯ СЕРИЯ</p>
          <h2>
            {streak ? streakDays(streak.current) : "—"} <span>подряд</span>
          </h2>
          <p className="streak-status">
            {streak
              ? streak.playedToday
                ? "Сегодня уже засчитано"
                : streak.current
                  ? "Заверши партию сегодня — продли серию"
                  : "Закончи любую игру — зажги серию"
              : error
                ? "Прогресс пока недоступен"
                : "Загружаем прогресс…"}
          </p>
        </div>
      </div>
      {streak && (
        <>
          <div className="streak-personal-stats">
            <span>
              Личный рекорд <strong>{streakDays(streak.best)}</strong>
            </span>
            <span>
              В этом месяце{" "}
              <strong>
                {streakDays(data!.milestones.activeDaysThisMonth)}
              </strong>
            </span>
          </div>
          <ol
            className="streak-calendar"
            aria-label="Дни игры за текущую неделю"
          >
            {data!.week.map((d) => (
              <li
                key={d.day}
                className={`${d.gamesCompleted ? "is-played" : ""} ${d.day === data!.day ? "is-today" : ""} ${d.day > data!.day ? "is-future" : ""}`}
                aria-current={d.day === data!.day ? "date" : undefined}
              >
                <span>
                  {new Intl.DateTimeFormat("ru-RU", {
                    weekday: "short",
                    timeZone: "Europe/Moscow",
                  }).format(new Date(d.day + "T12:00:00Z"))}
                </span>
                <span className="streak-calendar-mark">
                  {d.gamesCompleted ? <StreakFlame /> : Number(d.day.slice(-2))}
                </span>
                <span className="sr-only">
                  {d.day}:{" "}
                  {d.gamesCompleted
                    ? "день засчитан"
                    : d.day > data!.day
                      ? "ещё впереди"
                      : "без завершённых партий"}
                </span>
              </li>
            ))}
          </ol>
          <div className="streak-next-goal">
            <span>Следующая отметка — {streakDays(target)}</span>
            <progress
              max={target}
              value={streak.current}
              aria-label="Следующая отметка ударной серии"
            />
          </div>
        </>
      )}
      {error && (
        <button className="text-button" onClick={refresh}>
          Обновить прогресс
        </button>
      )}
      <div className="streak-personal-bottom">
        <details>
          <summary>Как считаем</summary>
          <p>
            Одна завершённая партия в любой игре — один день. Практика и вызовы
            тоже считаются. День заканчивается в полночь по Москве. После
            пропуска начинается новая серия; личный рекорд сохраняется.
          </p>
        </details>
        <a href="/leaderboard/?game=streak">Рейтинг серий →</a>
      </div>
      {!user && (
        <p className="streak-guest">
          <a href="/account/">Войди</a>, чтобы сохранить серию в аккаунте.
        </p>
      )}
    </section>
  );
}
