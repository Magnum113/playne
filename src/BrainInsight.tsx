import { useEffect, useId, useState } from "react";
import { api, useAuth } from "./account";
import type { BrainGameId } from "./brainContent";
import type { BrainInsightResult } from "./brainInsights";
import "./brain-insight.css";

export default function BrainInsight({
  game,
  runId,
  historyHref = "/account/",
}: {
  game: BrainGameId;
  runId?: string;
  historyHref?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const key = `${user?.id ?? "guest"}:${game}:${runId ?? ""}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: BrainInsightResult;
  } | null>(null);
  const [request, setRequest] = useState<{
    key: string;
    status: "loading" | "ready" | "error";
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const heading = useId();
  const data = !authLoading && snapshot?.key === key ? snapshot.data : null;
  const status =
    !authLoading && request?.key === key ? request.status : "loading";
  useEffect(() => {
    if (!runId || authLoading) return;
    let active = true;
    setRequest({ key, status: "loading" });
    api<BrainInsightResult>(`/games/${encodeURIComponent(runId)}/insight`)
      .then((value) => {
        if (
          !value ||
          value.game !== game ||
          typeof value.fact !== "string" ||
          typeof value.nextStep !== "string"
        )
          throw new Error("Insight unavailable");
        if (active) {
          setSnapshot({ key, data: value });
          setRequest({ key, status: "ready" });
        }
      })
      .catch(() => {
        if (active) setRequest({ key, status: "error" });
      });
    return () => {
      active = false;
    };
  }, [key, runId, game, authLoading, retry]);
  if (!runId) return null;
  if (!data)
    return (
      <section
        className="brain-insight brain-insight-pending"
        aria-label="Личный результат"
      >
        {status === "error" ? (
          <>
            <p role="status">
              Личный разбор пока недоступен. Результат партии сохранён.
            </p>
            <button
              className="text-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Повторить
            </button>
          </>
        ) : (
          <p role="status">Смотрим твои прошлые партии…</p>
        )}
      </section>
    );
  return (
    <section className="brain-insight" aria-labelledby={heading}>
      <h3 id={heading}>Твой результат в деталях</h3>
      <p className="brain-insight-fact">{data.fact}</p>
      <p className="brain-insight-next">
        <span>Следующая цель:</span> {data.nextStep}
      </p>
      <div className="brain-insight-more">
        <details>
          <summary>Как считаем</summary>
          <p>{data.comparisonNote}</p>
          {data.status === "ready" && (
            <p>
              В сравнении — {data.sample.previous} прошлых сопоставимых партий.
            </p>
          )}
          {data.status === "insufficient" && (
            <p>
              Сопоставимых прошлых партий: {data.sample.previous} из{" "}
              {data.sample.required}. Новые случайные задания могут отличаться
              по параметрам.
            </p>
          )}
        </details>
        {historyHref && <a href={historyHref}>Личная история →</a>}
      </div>
    </section>
  );
}
