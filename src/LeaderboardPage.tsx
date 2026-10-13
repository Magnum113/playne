import { geoModeName, type GeoMode } from "./geo";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import { useEffect, useState } from "react";
import { api, gameNames, resultText, AccountNav, type GameId } from "./account";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
export default function LeaderboardPage() {
  const query =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const initial = query?.get("game");
  const [game, setGame] = useState<GameId>(
    initial && Object.hasOwn(gameNames, initial)
      ? (initial as GameId)
      : "naglaz",
  );
  const [mode, setMode] = useState<GeoMode>(
    query?.get("mode") === "timed" ? "timed" : "classic",
  );
  const [period, setPeriod] = useState<"all" | "week">("week"),
    [page, setPage] = useState(1),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api(
      `/leaderboard?game=${game}&period=${period}&page=${page}&mode=${mode}`,
    )
      .then((d) => {
        if (active) {
          setData(d);
          reachGoal(ACCOUNT_GOALS.leaderboardOpen, { game, period });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [game, period, page, mode, retry]);
  function change(next: GameId) {
    setGame(next);
    setPage(1);
    window.history.replaceState(
      null,
      "",
      "/leaderboard/?game=" + next + (next === "geo" ? `&mode=${mode}` : ""),
    );
  }
  const entry = (e: any, key: string) => (
    <tr className={e.isMe ? "my-entry" : ""} key={key}>
      <td className="rank-position">{e.place}</td>
      <td>
        <strong>
          {e.nickname}
          {e.isMe && <span className="you-label">Ты</span>}
        </strong>
        {game !== "circle" && (
          <small className="rank-rounds">
            {e.rounds.map((s: number, i: number) => (
              <span key={i}>{s}</span>
            ))}
          </small>
        )}
      </td>
      <td className="rank-score">{resultText(game, e.score)}</td>
    </tr>
  );
  return (
    <div className="app community-app">
      <a className="skip-link" href="#leaderboard-main">
        Перейти к рейтингу
      </a>
      <header className="header">
        <PlayneBrand />
        <nav className="game-header-actions">
          <AccountNav />
          <ThemeToggle />
        </nav>
      </header>
      <main id="leaderboard-main" className="community-main">
        <p className="eyebrow">ИГРОКИ PLAYNE</p>
        <h1>
          Рейтинг<span className="brand-dot">.</span>
        </h1>
        <p className="community-intro">
          Лучшие результаты по каждой игре. Сыграй и найди своё место.
        </p>
        <div className="rank-games" aria-label="Выбор игры">
          {Object.entries(gameNames).map(([id, name]) => (
            <button
              key={id}
              aria-pressed={game === id}
              onClick={() => change(id as GameId)}
            >
              {name}
            </button>
          ))}
        </div>
        {game === "geo" && (
          <div className="rank-period geo-rank-modes" aria-label="Режим игры">
            {(["classic", "timed"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setPage(1);
                  window.history.replaceState(
                    null,
                    "",
                    `/leaderboard/?game=geo&mode=${m}`,
                  );
                }}
              >
                {geoModeName(m)}
              </button>
            ))}
          </div>
        )}
        <div className="rank-toolbar">
          <div className="rank-period" aria-label="Период рейтинга">
            <button
              aria-pressed={period === "week"}
              onClick={() => {
                setPeriod("week");
                setPage(1);
              }}
            >
              Неделя
            </button>
            <button
              aria-pressed={period === "all"}
              onClick={() => {
                setPeriod("all");
                setPage(1);
              }}
            >
              Всё время
            </button>
          </div>
          <span>Один лучший результат на игрока</span>
        </div>
        <section className="community-panel ranking-panel" aria-busy={loading}>
          <h2 className="sr-only">{gameNames[game]} — рейтинг</h2>
          {loading ? (
            <p role="status">Загружаем рейтинг…</p>
          ) : error ? (
            <div>
              <p role="status">{error}</p>
              <button
                className="text-button"
                onClick={() => setRetry((r) => r + 1)}
              >
                Попробовать ещё раз
              </button>
            </div>
          ) : data?.entries.length ? (
            <>
              <table className="rank-table">
                <thead>
                  <tr>
                    <th scope="col">Место</th>
                    <th scope="col">Игрок</th>
                    <th scope="col">Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e: any, i: number) => entry(e, String(i)))}
                </tbody>
              </table>
              {data.mine && !data.entries.some((e: any) => e.isMe) && (
                <div className="my-rank">
                  <span>
                    Твоё место: <strong>{data.mine.place}</strong>
                  </span>
                  <strong>{resultText(game, data.mine.score)}</strong>
                </div>
              )}
              <div className="rank-pagination">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Назад
                </button>
                <span>
                  Страница {page} · Игроков {data.total}
                </span>
                <button
                  disabled={page * 25 >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Дальше →
                </button>
              </div>
            </>
          ) : (
            <div className="rank-empty">
              <h2>Первое место пока свободно.</h2>
              <p>
                {period === "week"
                  ? "На этой неделе ещё никто не сохранил результат."
                  : "В этой игре ещё нет опубликованных результатов."}
              </p>
              <a className="primary" href={`/${game}/`}>
                Играть в «{gameNames[game]}» ↗
              </a>
            </div>
          )}
        </section>
        <div className="ranking-rules">
          <p>
            В таблице — только завершённые и проверенные сервером партии. При
            равных результатах место одинаковое.
          </p>
          <p>
            Неделя начинается в понедельник по московскому времени. Случайные
            задания могут различаться по сложности. Старые рекорды из браузера в
            рейтинг не переносятся.
          </p>
        </div>
      </main>
      <footer className="community-footer">
        <FooterLinks />
      </footer>
    </div>
  );
}
