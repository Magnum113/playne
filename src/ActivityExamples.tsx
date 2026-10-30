import { useState } from "react";
import PlayWeek from "./PlayWeek";
import type { PlayDay, PlayProgress } from "./playProgress";
import "./brain-hub.css";

type ActivityState = "progress" | "empty" | "loading" | "error";

const states: { value: ActivityState; label: string }[] = [
  { value: "progress", label: "Есть прогресс" },
  { value: "empty", label: "Пусто" },
  { value: "loading", label: "Загрузка" },
  { value: "error", label: "Ошибка" },
];

const exampleDay = "2026-10-30";
const dates = [
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
];
const emptyWeek: PlayDay[] = dates.map((day) => ({
  day,
  gamesCompleted: 0,
  score: 0,
}));
const exampleWeek: PlayDay[] = emptyWeek.map((day, index) => ({
  ...day,
  gamesCompleted: index === 0 ? 2 : index === 2 ? 1 : 0,
  score: index === 0 ? 762 : index === 2 ? 425 : 0,
}));
const emptyMilestones: PlayProgress["milestones"] = {
  completedWeeks: 0,
  activeDaysThisMonth: 0,
  totalActiveDays: 0,
  tenDayMonths: 0,
};
const exampleMilestones: PlayProgress["milestones"] = {
  completedWeeks: 4,
  activeDaysThisMonth: 10,
  totalActiveDays: 18,
  tenDayMonths: 1,
};

/** Catalog-only fixtures. One real PlayWeek instance; no progress hooks or requests. */
export default function ActivityExamples() {
  const [state, setState] = useState<ActivityState>("progress");
  const hasData = state === "progress" || state === "empty";
  return (
    <>
      <div
        className="rank-period ds-save-tabs"
        role="group"
        aria-label="Состояние недельного прогресса"
      >
        {states.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={state === option.value}
            onClick={() => setState(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="ds-note">
        Пример недели 26 октября — 1 ноября. Данные вымышлены. «Повторить»
        вернёт пример с прогрессом.
      </p>
      <PlayWeek
        day={exampleDay}
        days={
          state === "progress"
            ? exampleWeek
            : state === "empty"
              ? emptyWeek
              : []
        }
        goal={
          hasData
            ? { days: 3, completedDays: state === "progress" ? 2 : 0 }
            : undefined
        }
        milestones={
          hasData
            ? state === "progress"
              ? exampleMilestones
              : emptyMilestones
            : undefined
        }
        loading={state === "loading"}
        error={state === "error" ? "Не удалось обновить неделю." : undefined}
        onRetry={() => setState("progress")}
      />
    </>
  );
}
