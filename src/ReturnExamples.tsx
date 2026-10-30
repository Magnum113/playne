import { useState } from "react";
import { HeaderStreakLink } from "./HeaderStreak";
import { TodayPlayCard } from "./TodayPlay";
import { PlayStreakCard } from "./PlayStreak";
import { StreakBoardView } from "./StreakLeaderboard";
import { TopFiveCard } from "./OverallLeaderboard";
import type { OverallBoard } from "./overall";
import type { PlayProgress } from "./playProgress";
import type { StreakBoard } from "./playStreaks";

const day = "2026-10-30";
const week = [26, 27, 28, 29, 30, 31, 1].map((date, i) => ({
  day: `${i === 6 ? "2026-11" : "2026-10"}-${String(date).padStart(2, "0")}`,
  gamesCompleted: i >= 2 && i <= 4 ? 1 : 0,
  score: i >= 2 && i <= 4 ? 400 : 0,
}));
const example: PlayProgress = {
  day,
  weekStart: week[0].day,
  week,
  last7Days: week,
  weeklyDays: 3,
  goal: { days: 3, completedDays: 3 },
  milestones: {
    completedWeeks: 1,
    activeDaysThisMonth: 7,
    totalActiveDays: 7,
    tenDayMonths: 0,
  },
  streak: { current: 3, best: 7, playedToday: true, lastDay: day },
  favorites: [
    { game: "circle", completedRuns: 8, lastCompletedAt: `${day}T10:00:00Z` },
  ],
  daily: {},
  recentCompletions: [],
};
const board: StreakBoard = {
  day,
  page: 1,
  limit: 5,
  total: 5,
  mine: null,
  entries: [
    "Твой ник",
    "Игрок с очень длинным именем для проверки",
    "Следопыт",
    "Исследователь",
    "Игрок",
  ].map((nickname, i) => ({
    nickname,
    place: i === 0 ? 1 : 2,
    days: i === 0 ? 3 : 2,
    isMe: i === 0,
  })),
};
const states = [
  ["progress", "Есть серия"],
  ["empty", "Новая серия"],
  ["loading", "Загрузка"],
  ["error", "Ошибка"],
] as const;

/** The catalog uses real presentation components, without account/API side effects. */
export default function ReturnExamples({ overall }: { overall: OverallBoard }) {
  const [state, setState] = useState<(typeof states)[number][0]>("progress");
  const loading = state === "loading";
  const error = state === "error";
  const data =
    loading || error
      ? undefined
      : state === "progress"
        ? example
        : {
            ...example,
            week: week.map((item) => ({
              ...item,
              gamesCompleted: 0,
              score: 0,
            })),
            streak: { current: 0, best: 0, playedToday: false, lastDay: null },
            milestones: {
              completedWeeks: 0,
              activeDaysThisMonth: 0,
              totalActiveDays: 0,
              tenDayMonths: 0,
            },
            goal: { days: 3, completedDays: 0 },
            weeklyDays: 0,
          };
  const retry = () => setState("progress");
  return (
    <>
      <div
        className="rank-period ds-save-tabs"
        role="group"
        aria-label="Состояние серии и рекомендаций"
      >
        {states.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => setState(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="ds-note">
        Демонстрационные данные за 30 октября. Переключатель не меняет аккаунт.
        «Повторить» возвращает пример с серией.
      </p>
      <div className="ds-inline">
        <span className="header-account">
          <HeaderStreakLink
            days={data?.streak.current}
            loading={loading}
            error={error}
          />
        </span>
        <span className="header-account">
          <HeaderStreakLink days={365} />
        </span>
      </div>
      <p className="ds-note">
        В шапке и блоке дня — только огонь и число. Ноль отличается от
        недоступных данных: при загрузке и ошибке — «—».
      </p>
      <TodayPlayCard
        data={data}
        day={day}
        loading={loading}
        error={error}
        onRetry={retry}
      />
      <div className="ds-grid">
        <div>
          <h4>Личная серия на странице рейтинга</h4>
          <PlayStreakCard
            data={data}
            loading={loading}
            error={error}
            onRetry={retry}
            showRankingLink={false}
          />
          <p className="ds-note">
            Ссылка «Рейтинг серий» остаётся в кабинете; на самой странице
            рейтинга её нет. Блоки «Как считаем» и «Как попасть в рейтинг» не
            используются.
          </p>
        </div>
        <div>
          <h4>Два рейтинга на главной</h4>
          <div className="ds-top-five-demo hub-leaderboards">
            <TopFiveCard
              data={
                data
                  ? state === "empty"
                    ? { ...overall, entries: [], mine: null }
                    : overall
                  : null
              }
              loading={loading}
              error={error ? "unavailable" : ""}
            />
            <StreakBoardView
              data={
                data
                  ? state === "empty"
                    ? { ...board, entries: [] }
                    : board
                  : null
              }
              compact
              loading={loading}
              error={error}
              onRetry={retry}
            />
          </div>
          <p className="ds-note">
            До 650 px: пять игроков в каждом списке, короткое «Все», одна строка
            на имя, без подзаголовка серии и отдельной строки «Ты». Нажимаемые
            строки — от 44 px; строки серии без действия — 36 px.
          </p>
        </div>
      </div>
    </>
  );
}
