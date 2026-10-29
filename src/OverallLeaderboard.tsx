import { useEffect, useState, type CSSProperties } from "react";
import { api, useAuth, resultText } from "./account";
import {
  OVERALL_GAMES,
  OVERALL_MAX_POINTS,
  overallNumber,
  type OverallBoard,
  type OverallEntry,
} from "./overall";

export function OverallContributions({ entry }: { entry: OverallEntry }) {
  return (
    <details className="overall-breakdown">
      <summary>{entry.gamesPlayed} из 5 игр</summary>
      <div className="overall-breakdown-body">
        <p>Вклад каждой игры · до 1000 баллов</p>
        <ul>
          {OVERALL_GAMES.map((game) => {
            const part = entry.contributions.find((p) => p.game === game.id);
            return (
              <li key={game.id}>
                <a
                  href={
                    part
                      ? `/leaderboard/?game=${game.id}&mode=${part.mode}&period=all`
                      : `/${game.id}/`
                  }
                >
                  {game.name}
                </a>
                <span>
                  <small>
                    {part ? resultText(game.id, part.score) : "Не сыграно"}
                  </small>
                  <strong>{overallNumber(part?.points ?? 0)}</strong>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

export function OverallRules() {
  return (
    <details className="overall-rules">
      <summary>Как считаются баллы</summary>
      <p>
        Пять игр — до {overallNumber(OVERALL_MAX_POINTS)} баллов. В каждой берём
        один лучший результат за всё время, независимо от режима. Непройденная
        игра даёт 0.
      </p>
      <ul>
        <li>На глаз, Оттенок, Где я?: результат из 500 умножаем на 2.</li>
        <li>Круг: процент точности умножаем на 10.</li>
        <li>
          Жми: 1000 × уровни / (уровни + 50). За 50 уровней — 500 баллов, за 100
          — 666.
        </li>
      </ul>
      <p>
        Баллы каждой игры округляем вниз. Места при одинаковой сумме совпадают.
        Учитываются только опубликованные, проверенные сервером партии; старые
        результаты с совместимыми правилами переводим в текущую шкалу.
      </p>
    </details>
  );
}

export function TopFiveCard({
  data,
  loading = false,
  error = "",
}: {
  data: OverallBoard | null;
  loading?: boolean;
  error?: string;
}) {
  return (
    <section
      className="top-five"
      aria-label="Топ-5 общего рейтинга"
      aria-busy={loading}
    >
      <header className="top-five-heading">
        <div>
          <h2>Топ-5 Playne</h2>
          <span>
            За всё время
            {data?.mine ? ` · ты №${overallNumber(data.mine.place)}` : ""}
          </span>
        </div>
        <a className="top-five-cta" href="/leaderboard/?game=overall">
          Займи место <span aria-hidden="true">→</span>
        </a>
      </header>
      {error ? (
        <p className="top-five-message" role="status">
          Рейтинг временно недоступен.{" "}
          <a href="/leaderboard/?game=overall">Открыть рейтинг →</a>
        </p>
      ) : (
        <ol className="top-five-list" aria-label="Пять лидеров Playne">
          {Array.from({ length: 5 }, (_, i) => {
            const entry = data?.entries[i];
            return (
              <li
                key={i}
                className={`${entry?.isMe ? "is-me" : ""} ${loading ? "is-loading" : ""}`}
                style={
                  {
                    "--leader-delay": `${i * 50}ms`,
                  } as CSSProperties
                }
              >
                <a
                  href="/leaderboard/?game=overall"
                  aria-label={
                    entry
                      ? `${entry.place}. ${entry.nickname}. ${overallNumber(entry.score)} баллов${entry.isMe ? ". Это ты" : ""}`
                      : loading
                        ? "Загружаем рейтинг"
                        : "Свободное место в рейтинге"
                  }
                >
                  <span className="top-five-place" aria-hidden="true">
                    {entry?.place ?? i + 1}
                  </span>
                  <span className="top-five-name" title={entry?.nickname}>
                    {entry?.nickname ??
                      (loading ? "Загружаем…" : "Место свободно")}
                  </span>
                  <strong className="top-five-score">
                    {entry ? overallNumber(entry.score) : "—"}
                  </strong>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function HubTopFive() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<OverallBoard | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLoading(true);
    setError("");
    void api<OverallBoard>("/leaderboard?game=overall&limit=5")
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError("unavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, authLoading]);
  return <TopFiveCard data={data} loading={loading} error={error} />;
}
