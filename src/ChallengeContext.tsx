import { reachGoal, SHARE_GOALS, trackChallengeResult } from "./analytics";
import ChallengeComparison from "./ChallengeComparison";
import { useEffect, useState } from "react";
import { api } from "./account";
import {
  challengePath,
  challengeScore,
  challengeRetryPath,
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
  runId,
}: {
  game: ChallengeGame;
  token?: string;
  score?: number | null;
  completed?: boolean;
  runDay?: string;
  runMode?: string;
  comparisonToken?: string;
  runId?: string;
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
        if (active) {
          setFailed(key);
          reachGoal(SHARE_GOALS.error, { game, stage: "load" });
        }
      });
    return () => {
      active = false;
    };
  }, [token, game, key]);
  const data = snapshot?.key === key ? snapshot.data : null;
  const matched =
    !!data &&
    (comparisonToken === token ||
      (data.mode === "classic" &&
        runMode === "classic" &&
        runDay === data.day));
  const referenceScore = data?.score;
  useEffect(() => {
    if (completed && matched && runId && referenceScore !== undefined)
      trackChallengeResult(runId, game, score ?? 0, referenceScore);
  }, [completed, matched, runId, referenceScore, game, score]);
  if (!token) return null;
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
  if (completed)
    return (
      <aside className="challenge-comparison-inline" aria-label="Вызов друга">
        <strong className="challenge-inline-heading">
          {(score ?? 0) > data.score
            ? "Ты впереди!"
            : score === data.score
              ? "Ничья"
              : "Друг впереди"}
        </strong>
        <ChallengeComparison reference={data} score={score ?? 0} />
        {runId && (
          <a
            className="secondary-button challenge-inline-retry"
            href={challengeRetryPath(data, runId)}
            onClick={() => reachGoal(SHARE_GOALS.retryClicked, { game })}
          >
            Попробовать ещё ↻
          </a>
        )}
      </aside>
    );
  return (
    <aside className="challenge-context" aria-label="Вызов друга">
      <span className="challenge-mark" aria-hidden="true">
        ↗
      </span>
      <div>
        <strong>Вызов от {data.nickname}</strong>
        <p>
          {challengeScore(data)} ·{" "}
          {data.isTodayDaily ? "Сегодняшняя задача дня" : "Те же задания"}
        </p>
      </div>
    </aside>
  );
}
