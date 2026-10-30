import { useState } from "react";
import { GameLeaderboardCard, type GameRankBoard } from "./GameLeaderboard";

const entries = [99.2, 98.7, 97.6, 96.8, 95.5].map((score, i) => ({
  nickname: [
    "Исследователь",
    "Игрок с очень длинным именем",
    "Твой ник",
    "Следопыт",
    "Наблюдатель",
  ][i],
  score,
  place: i + 1,
  isMe: false,
}));
const options = [
  ["outside", "Вне топ-5"],
  ["inside", "В топ-5"],
  ["guest", "Без результата"],
  ["loading", "Загрузка"],
  ["error", "Ошибка"],
] as const;
export default function GameRankingExamples() {
  const [state, setState] = useState<(typeof options)[number][0]>("outside");
  const inside = state === "inside";
  const data: GameRankBoard = {
    entries: entries.map((entry, i) => ({ ...entry, isMe: inside && i === 2 })),
    mine:
      state === "guest"
        ? null
        : inside
          ? { ...entries[2], isMe: true }
          : { nickname: "Твой ник", score: 84.5, place: 37, isMe: true },
  };
  return (
    <>
      <div
        className="rank-period ds-save-tabs"
        role="group"
        aria-label="Состояние рейтинга игры"
      >
        {options.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={value === state}
            onClick={() => setState(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ maxWidth: 360 }}>
        <GameLeaderboardCard
          game="circle"
          data={data}
          loading={state === "loading"}
          error={state === "error"}
          onRetry={() => setState("outside")}
        />
      </div>
    </>
  );
}
