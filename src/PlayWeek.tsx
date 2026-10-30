import { brainDateLabel } from "./brainProgress";
import type { PlayDay, PlayProgress } from "./playProgress";
import "./play-progress.css";

export default function PlayWeek({
  day,
  days,
  goal,
  milestones,
  loading,
  error,
  onRetry,
}: {
  day: string;
  days: PlayDay[];
  goal?: PlayProgress["goal"];
  milestones?: PlayProgress["milestones"];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const count = goal ? Math.min(goal.completedDays, goal.days) : undefined;
  const badges = milestones
    ? [
        { label: "Первая неделя", earned: milestones.completedWeeks >= 1 },
        { label: "Четыре недели", earned: milestones.completedWeeks >= 4 },
        { label: "10 дней за месяц", earned: milestones.tenDayMonths > 0 },
      ]
    : [];
  return (
    <section
      className="brain-week play-week"
      id="play-week"
      aria-labelledby="play-week-title"
      aria-busy={loading || undefined}
    >
      <div>
        <p className="eyebrow">ПОНЕМНОГУ И РЕГУЛЯРНО</p>
        <h2 id="play-week-title">Три дня игры за неделю</h2>
        <p>Закончи партию в любой игре. Практика тоже считается.</p>
        {badges.length > 0 && (
          <ul className="play-badges" aria-label="Достижения за всё время">
            {badges.map((badge) => (
              <li key={badge.label} className={badge.earned ? "is-earned" : ""}>
                <span aria-hidden="true">{badge.earned ? "✓" : "○"}</span>{" "}
                {badge.label}
                <span className="sr-only">
                  {" "}
                  — {badge.earned ? "получено" : "впереди"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="brain-week-progress">
        <p className="play-week-count">
          <strong>{count ?? "—"}</strong> / {goal?.days ?? 3} дней на этой
          неделе
          {goal && count === goal.days && (
            <span className="play-goal-done">Цель выполнена ✓</span>
          )}
        </p>
        {goal && (
          <progress
            className="play-week-meter"
            aria-label="Недельная цель: дни игры"
            max={goal.days}
            value={count}
          />
        )}
        <ol
          className="brain-calendar"
          aria-label="Занятия за текущую неделю, с понедельника по воскресенье"
        >
          {days.map((item) => {
            const future = item.day > day;
            const active = item.gamesCompleted > 0;
            const description = future
              ? "день ещё не наступил"
              : active
                ? `завершено игр: ${item.gamesCompleted}`
                : "без завершённых партий";
            return (
              <li
                key={item.day}
                className={[
                  active ? "is-complete" : "",
                  item.day === day ? "is-today" : "",
                  future ? "is-future" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={item.day === day ? "date" : undefined}
                title={`${brainDateLabel(item.day)}: ${description}`}
              >
                <span>{brainDateLabel(item.day, { weekday: "short" })}</span>
                <strong aria-hidden="true">
                  {active ? "✓" : brainDateLabel(item.day, { day: "numeric" })}
                </strong>
                <span className="sr-only">
                  {brainDateLabel(item.day)}: {description}
                </span>
              </li>
            );
          })}
        </ol>
        {loading && !goal && <p role="status">Загружаем прогресс…</p>}
        {error && (
          <p role="status">
            {error}{" "}
            {onRetry && (
              <button className="text-button" onClick={onRetry}>
                Повторить
              </button>
            )}
          </p>
        )}
        <p className="brain-week-note">Понедельник–воскресенье, по Москве.</p>
      </div>
    </section>
  );
}
