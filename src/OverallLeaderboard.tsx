import { useEffect, useState, type CSSProperties } from "react";
import { api, useAuth, resultText } from "./account";
import { geoModeName, validGeoMode } from "./geo";
import { shadeModeName } from "./colorfle";
import {
  OVERALL_GAMES,
  BRAIN_RANK_GAMES,
  OVERALL_MAX_POINTS,
  overallNumber,
  type OverallBoard,
  type OverallEntry,
} from "./overall";

export function OverallContributions({
  entry,
  scope = "overall",
}: {
  entry: OverallEntry;
  scope?: "overall" | "brain";
}) {
  const games = scope === "brain" ? BRAIN_RANK_GAMES : OVERALL_GAMES;
  const max = scope === "brain" ? 250 : 1000;
  const record = (game: string, value: number) =>
    game === "brain"
      ? `${overallNumber(value)} / 1000 баллов`
      : resultText(game as Parameters<typeof resultText>[0], value);
  return (
    <div className="overall-breakdown-body">
      <p className="overall-breakdown-caption">
        <strong>Баллы по играм</strong>
        <span>
          До {max} за каждую {scope === "brain" ? "игру" : "категорию"}
        </span>
      </p>
      <ul className="overall-contributions">
        {games.map((game) => {
          const part = entry.contributions.find((p) => p.game === game.id);
          const mode =
            part?.game === "geo" && validGeoMode(part.mode)
              ? geoModeName(part.mode)
              : part?.game === "colorfle"
                ? shadeModeName(part.mode === "timed" ? "timed" : "classic")
                : part?.game === "line" || scope === "brain"
                  ? "Задача дня"
                  : "";
          return (
            <li key={game.id}>
              <a
                className={part ? "" : "is-unplayed"}
                href={
                  part
                    ? `/leaderboard/?game=${game.id}&mode=${part.mode}&period=all`
                    : game.id === "brain"
                      ? "/brain/"
                      : scope === "brain"
                        ? `/brain/${game.id}/`
                        : game.id === "line"
                          ? "/one-line/"
                          : `/${game.id}/`
                }
                aria-label={`${game.name}. ${overallNumber(part?.points ?? 0)} из ${max} баллов. ${part ? `Рекорд: ${record(game.id, part.score)}. ${mode ? mode + ". " : ""}Открыть рейтинг` : "Не сыграно. Играть"}`}
              >
                <span className="overall-contribution-game">
                  {game.name}
                  <span aria-hidden="true">↗</span>
                </span>
                <span className="overall-contribution-points">
                  <strong>{overallNumber(part?.points ?? 0)}</strong>
                  <small>/ {max}</small>
                </span>
                <span className="overall-contribution-record">
                  {part
                    ? `Рекорд: ${record(game.id, part.score)}`
                    : "Не сыграно"}
                </span>
                {mode && (
                  <span className="overall-contribution-mode">
                    {mode.replace(
                      "Достопримечательности",
                      "Достопримеча\u00adтельности",
                    )}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One semantic list and native disclosure work at every screen size. */
export function OverallStandings({
  entries,
  scope = "overall",
}: {
  entries: OverallEntry[];
  scope?: "overall" | "brain";
}) {
  const count =
    scope === "brain" ? BRAIN_RANK_GAMES.length : OVERALL_GAMES.length;
  const unit = scope === "brain" ? "игр" : "категорий";
  return (
    <div className="overall-standings">
      <div className="overall-standings-heading" aria-hidden="true">
        <span>Место</span>
        <span>Игрок</span>
        <span>Баллы</span>
        <span />
      </div>
      <ol
        className="overall-standings-list"
        aria-label={
          scope === "brain"
            ? "Рейтинг разминки для ума"
            : "Общий рейтинг игроков"
        }
      >
        {entries.map((entry, index) => (
          <li key={index}>
            <details
              className={`overall-standing${entry.isMe ? " is-me" : ""}`}
            >
              <summary
                aria-label={`Место ${entry.place}. ${entry.nickname}. ${overallNumber(entry.score)} баллов. ${entry.gamesPlayed} из ${count} ${unit}.${entry.isMe ? " Это ты." : ""} Результаты по играм`}
              >
                <span
                  className={`overall-standing-place${entry.place <= 3 ? " is-top" : ""}`}
                  aria-hidden="true"
                >
                  {entry.place}
                </span>
                <span className="overall-standing-player">
                  <strong>
                    {entry.nickname}
                    {entry.isMe && <span className="overall-you">Ты</span>}
                  </strong>
                  <span>
                    {entry.gamesPlayed} из {count} {unit}
                  </span>
                </span>
                <strong className="overall-standing-score">
                  {overallNumber(entry.score)}
                </strong>
                <svg
                  className="overall-standing-chevron"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m6 8 4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <OverallContributions entry={entry} scope={scope} />
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function OverallRules() {
  return (
    <details className="overall-rules">
      <summary>Как считаются баллы</summary>
      <p>
        Шесть игр и категория «Разминка для ума» — до{" "}
        {overallNumber(OVERALL_MAX_POINTS)} баллов. Каждая категория даёт до
        1000. В «Одной линией» и разминке учитываются только задачи дня, в
        остальных играх — лучший из всех режимов за всё время. Непройденная
        категория даёт 0.
      </p>
      <ul>
        <li>На глаз, Оттенок, Где я?: результат из 500 умножаем на 2.</li>
        <li>
          Одной линией: лучший дневной результат режима «Задача дня» из 500
          умножаем на 2. «Практика» не учитывается.
        </li>
        <li>Круг: процент точности умножаем на 10.</li>
        <li>
          Разминка для ума: складываем лучшие дневные результаты «Вспышки»,
          «Поворота», «Передвинь» и «Диспетчера» и делим на 2 — до 1000 за все
          четыре игры вместе. Практика не учитывается.
        </li>
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
      className={`top-five${!loading && !error && data?.entries.length ? " has-leaders" : ""}`}
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
