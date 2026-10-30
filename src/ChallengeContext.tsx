import { useEffect, useState } from "react";
import { api } from "./account";
import {
  challengePath,
  challengeScore,
  type PublicChallenge,
  type ChallengeGame,
} from "./challenges";
import "./challenge.css";

export const readChallengeToken = () =>
  typeof window === "undefined"
    ? undefined
    : new URLSearchParams(window.location.search).get("challenge") || undefined;
export function challengeQuery(path: string, token?: string) {
  return token
    ? path +
        (path.includes("?") ? "&" : "?") +
        "challenge=" +
        encodeURIComponent(token)
    : path;
}
export default function ChallengeContext({
  game,
  token,
  score,
  completed,
  runDay,
  runMode,
  comparisonToken,
}: {
  game: ChallengeGame;
  token?: string;
  score?: number | null;
  completed?: boolean;
  runDay?: string;
  runMode?: string;
  comparisonToken?: string;
}) {
  const key = `${game}:${token}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: PublicChallenge;
  } | null>(null);
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    if (!token) return;
    let active = true;
    api<PublicChallenge>(`/challenges/${encodeURIComponent(token)}`)
      .then((data) => {
        if (data.game !== game) throw Error("Wrong game");
        if (active) {
          setSnapshot({ key, data });
          setFailed(undefined);
        }
      })
      .catch(() => {
        if (active) setFailed(key);
      });
    return () => {
      active = false;
    };
  }, [token, game, key]);
  if (!token) return null;
  const data = snapshot?.key === key ? snapshot.data : null;
  if (failed === key)
    return (
      <aside className="challenge-context" role="status">
        Вызов недоступен.{" "}
        <a href={challengePath(game)}>Открыть обычную игру →</a>
      </aside>
    );
  if (!data)
    return (
      <aside className="challenge-context" role="status">
        Загружаем вызов…
      </aside>
    );
  const matched =
    comparisonToken === token ||
    (data.mode === "classic" && runMode === "classic" && runDay === data.day);
  if (completed && !matched)
    return (
      <aside className="challenge-context">
        <strong>Для сравнения нужны те же задания</strong>
        <p>
          <a href={challengeQuery(challengePath(game), token)}>
            Принять вызов →
          </a>
        </p>
      </aside>
    );
  const difference = Math.round(((score ?? 0) - data.score) * 10) / 10;
  const n = Math.abs(difference);
  const unit = game === "circle" ? "п.п." : n % 10 === 1 && n % 100 !== 11 ? "очко" : [2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100) ? "очка" : "очков";
  return (
    <aside className="challenge-context" aria-label="Вызов друга">
      <span className="challenge-mark" aria-hidden="true">
        ↗
      </span>
      <div>
        <strong>
          {completed
            ? difference > 0
              ? `Ты впереди на ${difference} ${unit}`
              : difference === 0
                ? "Ничья"
                : `До результата друга — ${-difference} ${unit}`
            : `Вызов от ${data.nickname}`}
        </strong>
        <p>
          {completed
            ? `Ты: ${game === "circle" || game === "pressure" ? challengeScore({ ...data, score: score ?? 0 }) : score} · ${data.nickname}: ${challengeScore(data)}`
            : `${challengeScore(data)} · ${data.isTodayDaily ? "Сегодняшняя задача дня" : "Те же задания, отдельное сравнение"}`}
        </p>
      </div>
    </aside>
  );
}
