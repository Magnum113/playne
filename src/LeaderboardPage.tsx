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
import { useEffect, useRef, useState } from "react";
import {
  api,
  gameNames,
  resultText,
  type GameId,
  type GameMode,
} from "./account";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import { shadeModeName, type ShadeMode } from "./colorfle";
import { OverallStandings, OverallRules } from "./OverallLeaderboard";
import { OVERALL_GAMES, OVERALL_MAX_POINTS, overallNumber } from "./overall";
type LeaderboardGame = GameId | "overall";
const boardNames = { overall: "Общий", ...gameNames };

function modeForGame(game: LeaderboardGame, value: unknown): GameMode {
  if (game === "geo" && validGeoMode(value)) return value;
  if (game === "colorfle" && value === "timed") return "timed";
  if (game === "line" && value === "practice") return "practice";
  return "classic";
}

export default function LeaderboardPage() {
  const query =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const initial = query?.get("game");
  const initialGame: LeaderboardGame =
    initial && Object.hasOwn(boardNames, initial)
      ? (initial as LeaderboardGame)
      : "overall";
  const [game, setGame] = useState<LeaderboardGame>(initialGame);
  const [mode, setMode] = useState<GameMode>(
    modeForGame(initialGame, query?.get("mode")),
  );
  const geoMode: GeoMode = validGeoMode(mode) ? mode : "classic";
  const [period, setPeriod] = useState<"all" | "week">(
      initialGame !== "overall" && query?.get("period") !== "all"
        ? "week"
        : "all",
    ),
    [page, setPage] = useState(1),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  // Selection changes render before useEffect sets loading. Never interpret
  // the previous board's rows using another game's response format.
  const currentBoard =
    data?.game === game &&
    data?.page === page &&
    (game === "overall" || (data?.mode === mode && data?.period === period));
  const waiting = loading || (!error && !currentBoard);
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageFocusPending = useRef(false);
  useEffect(() => {
    if (waiting || !pageFocusPending.current) return;
    pageFocusPending.current = false;
    headingRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [waiting]);
  function changePage(next: number) {
    pageFocusPending.current = true;
    setPage(next);
  }
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
            ...(game === "geo" || game === "colorfle" || game === "line"
              ? { mode }
              : {}),
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
    pageFocusPending.current = false;
    const nextPeriod = next === "overall" ? "all" : period;
    const nextMode = modeForGame(next, mode);
    setPeriod(nextPeriod);
    setGame(next);
    setMode(nextMode);
    setPage(1);
    window.history.replaceState(
      null,
      "",
      "/leaderboard/?game=" +
        next +
        (next !== "overall" ? `&mode=${nextMode}` : "") +
        `&period=${nextPeriod}`,
    );
  }
  function chooseMode(next: GameMode) {
    pageFocusPending.current = false;
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
              className={id === "line" ? "rank-game-line" : undefined}
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
        {game === "line" && (
          <div
            className="rank-period geo-rank-modes"
            aria-label="Режим Одной линией"
          >
            {(["classic", "practice"] as const).map((option) => (
              <button
                key={option}
                aria-pressed={mode === option}
                onClick={() => chooseMode(option)}
              >
                {option === "classic" ? "Задача дня" : "Практика"}
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
                  aria-pressed={geoIsLandmarks(geoMode) === landmarks}
                  onClick={() =>
                    chooseMode(
                      geoModeFor(
                        geoCanMove(geoMode),
                        geoIsTimed(geoMode),
                        landmarks,
                      ),
                    )
                  }
                >
                  {landmarks ? "Достопримечательности" : "Весь мир"}
                </button>
              ))}
            </div>
            {!geoIsLandmarks(geoMode) && (
              <div
                className="rank-period geo-rank-modes"
                aria-label="Перемещение"
              >
                {([false, true] as const).map((moving) => (
                  <button
                    key={String(moving)}
                    aria-pressed={geoCanMove(geoMode) === moving}
                    onClick={() =>
                      chooseMode(geoModeFor(moving, geoIsTimed(geoMode)))
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
                  aria-pressed={geoIsTimed(geoMode) === timed}
                  onClick={() =>
                    chooseMode(
                      geoModeFor(
                        geoCanMove(geoMode),
                        timed,
                        geoIsLandmarks(geoMode),
                      ),
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
              За всё время · до {overallNumber(OVERALL_MAX_POINTS)} баллов
            </span>
          ) : (
            <div className="rank-period" aria-label="Период рейтинга">
              <button
                aria-pressed={period === "week"}
                onClick={() => {
                  pageFocusPending.current = false;
                  setPeriod("week");
                  setPage(1);
                }}
              >
                Неделя
              </button>
              <button
                aria-pressed={period === "all"}
                onClick={() => {
                  pageFocusPending.current = false;
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
              ? `${OVERALL_GAMES.length} игр · один общий счёт`
              : "Один лучший результат на игрока"}
          </span>
        </div>
        <section
          ref={panelRef}
          className={`community-panel ranking-panel${game === "overall" ? " overall-ranking-panel" : ""}`}
          aria-busy={waiting}
        >
          <h2 ref={headingRef} className="sr-only" tabIndex={-1}>
            {boardNames[game]} — рейтинг
          </h2>
          {waiting ? (
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
              {game === "overall" ? (
                <OverallStandings entries={data.entries} />
              ) : (
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col">Место</th>
                      <th scope="col">Игрок</th>
                      <th scope="col">Результат</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e: any, i: number) =>
                      entry(e, String(i)),
                    )}
                  </tbody>
                </table>
              )}
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
                  onClick={() => changePage(page - 1)}
                >
                  ← Назад
                </button>
                <span>
                  Страница {page} · Игроков {data.total}
                </span>
                <button
                  disabled={page * 25 >= data.total}
                  onClick={() => changePage(page + 1)}
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
                    : `/${game === "line" ? "one-line" : game}/${(game === "geo" || game === "colorfle" || game === "line") && mode !== "classic" ? `?mode=${mode}` : ""}`
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
              {game === "line"
                ? mode === "practice"
                  ? "Практика имеет отдельный рейтинг и не входит в общий зачёт."
                  : "В режиме «Задача дня» учитывается первая попытка за каждую московскую дату. Поля дня одинаковы для всех."
                : "Случайные задания могут различаться по сложности."}{" "}
              Неделя начинается в понедельник по московскому времени. Старые
              рекорды из браузера в рейтинг не переносятся.
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
