import {
  geoPoints,
  validGeoMode,
  geoCanMove,
  geoIsTimed,
  geoIsLandmarks,
  geoModeFor,
  type GeoMode,
} from "./geo";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import { useEffect, useState } from "react";
import { api, gameNames, resultText, AccountNav, type GameId } from "./account";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import { shadeModeName, type ShadeMode } from "./colorfle";
import { OverallContributions, OverallRules } from "./OverallLeaderboard";
import { overallNumber } from "./overall";
type LeaderboardGame = GameId | "overall";
const boardNames = { overall: "Общий", ...gameNames };
export default function LeaderboardPage() {
  const query =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const initial = query?.get("game");
  const [game, setGame] = useState<LeaderboardGame>(
    initial && Object.hasOwn(boardNames, initial)
      ? (initial as LeaderboardGame)
      : "overall",
  );
  const [mode, setMode] = useState<GeoMode>(
    validGeoMode(query?.get("mode"))
      ? (query!.get("mode") as GeoMode)
      : "classic",
  );
  const [period, setPeriod] = useState<"all" | "week">(
      initial && initial !== "overall" && query?.get("period") !== "all"
        ? "week"
        : "all",
    ),
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
      game === "overall"
        ? `/leaderboard?game=overall&page=${page}`
        : `/leaderboard?game=${game}&period=${period}&page=${page}&mode=${mode}`,
    )
      .then((d) => {
        if (active) {
          setData(d);
          reachGoal(ACCOUNT_GOALS.leaderboardOpen, {
            game,
            period,
            ...(game === "geo" || game === "colorfle" ? { mode } : {}),
          });
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
  function change(next: LeaderboardGame) {
    const nextPeriod = next === "overall" ? "all" : period;
    setPeriod(nextPeriod);
    setGame(next);
    if (next !== "geo") setMode("classic");
    setPage(1);
    window.history.replaceState(
      null,
      "",
      "/leaderboard/?game=" +
        next +
        (next === "geo" ? `&mode=${mode}` : "") +
        `&period=${nextPeriod}`,
    );
  }
  function chooseMode(next: GeoMode) {
    setMode(next);
    setPage(1);
    window.history.replaceState(
      null,
      "",
      `/leaderboard/?game=${game}&mode=${next}&period=${period}`,
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
        {game === "overall" && <OverallContributions entry={e} />}
        {game !== "circle" && game !== "overall" && (
          <small className="rank-rounds">
            {e.rounds.map((s: number, i: number) => (
              <span key={i}>{geoPoints(s)}</span>
            ))}
          </small>
        )}
      </td>
      <td className="rank-score">
        {game === "overall"
          ? overallNumber(e.score)
          : resultText(game, e.score)}
      </td>
    </tr>
  );
  return (
    <div className="app community-app">
      <a className="skip-link" href="#leaderboard-main">
        Перейти к рейтингу
      </a>
      <GameHeader back={false} />
      <main id="leaderboard-main" className="community-main">
        <p className="eyebrow">ИГРОКИ PLAYNE</p>
        <h1>
          Рейтинг<span className="brand-dot">.</span>
        </h1>
        <p className="community-intro">
          Общий зачёт и рекорды по играм. Найди своё место.
        </p>
        <div className="rank-games" aria-label="Выбор игры">
          {Object.entries(boardNames).map(([id, name]) => (
            <button
              key={id}
              aria-pressed={game === id}
              onClick={() => change(id as LeaderboardGame)}
            >
              {name}
            </button>
          ))}
        </div>
        {game === "colorfle" && (
          <div
            className="rank-period geo-rank-modes"
            aria-label="Режим Оттенка"
          >
            {(["classic", "timed"] as ShadeMode[]).map((option) => (
              <button
                key={option}
                aria-pressed={mode === option}
                onClick={() => chooseMode(option)}
              >
                {shadeModeName(option)}
              </button>
            ))}
          </div>
        )}
        {game === "geo" && (
          <div className="geo-ranking-filters">
            <div className="rank-period geo-rank-modes" aria-label="Места">
              {([false, true] as const).map((landmarks) => (
                <button
                  key={String(landmarks)}
                  aria-pressed={geoIsLandmarks(mode) === landmarks}
                  onClick={() =>
                    chooseMode(
                      geoModeFor(geoCanMove(mode), geoIsTimed(mode), landmarks),
                    )
                  }
                >
                  {landmarks ? "Достопримечательности" : "Весь мир"}
                </button>
              ))}
            </div>
            {!geoIsLandmarks(mode) && (
              <div
                className="rank-period geo-rank-modes"
                aria-label="Перемещение"
              >
                {([false, true] as const).map((moving) => (
                  <button
                    key={String(moving)}
                    aria-pressed={geoCanMove(mode) === moving}
                    onClick={() =>
                      chooseMode(geoModeFor(moving, geoIsTimed(mode)))
                    }
                  >
                    {moving ? "С перемещением" : "Без перемещения"}
                  </button>
                ))}
              </div>
            )}
            <div className="rank-period geo-rank-modes" aria-label="Время">
              {([false, true] as const).map((timed) => (
                <button
                  key={String(timed)}
                  aria-pressed={geoIsTimed(mode) === timed}
                  onClick={() =>
                    chooseMode(
                      geoModeFor(geoCanMove(mode), timed, geoIsLandmarks(mode)),
                    )
                  }
                >
                  {timed ? "На время" : "Без таймера"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="rank-toolbar">
          {game === "overall" ? (
            <span className="overall-period-label">
              За всё время · до 5000 баллов
            </span>
          ) : (
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
          )}
          <span>
            {game === "overall"
              ? "5 игр · один общий счёт"
              : "Один лучший результат на игрока"}
          </span>
        </div>
        <section className="community-panel ranking-panel" aria-busy={loading}>
          <h2 className="sr-only">{boardNames[game]} — рейтинг</h2>
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
              <table
                className={`rank-table${game === "overall" ? " overall-table" : ""}`}
              >
                <thead>
                  <tr>
                    <th scope="col">Место</th>
                    <th scope="col">Игрок</th>
                    <th scope="col">
                      {game === "overall" ? "Баллы" : "Результат"}
                    </th>
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
                  <strong>
                    {game === "overall"
                      ? overallNumber(data.mine.score)
                      : resultText(game, data.mine.score)}
                  </strong>
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
                {game === "overall"
                  ? "Сыграй в любую игру и сохрани результат — появишься здесь."
                  : period === "week"
                    ? "На этой неделе ещё никто не сохранил результат."
                    : "В этой игре ещё нет опубликованных результатов."}
              </p>
              <a
                className="primary"
                href={
                  game === "overall"
                    ? "/#games"
                    : `/${game}/${game === "geo" && mode !== "classic" ? `?mode=${mode}` : ""}`
                }
              >
                {game === "overall"
                  ? "Выбрать игру →"
                  : `Играть в «${gameNames[game]}» ↗`}
              </a>
            </div>
          )}
        </section>
        {game === "overall" ? (
          <div className="ranking-rules">
            <OverallRules />
            <a className="primary overall-play" href="/#games">
              Подними свой рекорд →
            </a>
          </div>
        ) : (
          <div className="ranking-rules">
            <p>
              В таблице — только завершённые и проверенные сервером партии. При
              равных результатах место одинаковое.
            </p>
            <p>
              Неделя начинается в понедельник по московскому времени. Случайные
              задания могут различаться по сложности. Старые рекорды из браузера
              в рейтинг не переносятся.
            </p>
          </div>
        )}
      </main>
      <footer className="community-footer">
        <FooterLinks />
      </footer>
    </div>
  );
}
