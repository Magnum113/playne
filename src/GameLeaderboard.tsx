import { useEffect, useState } from "react";
import { api, gameNames, resultText, useAuth, type GameId } from "./account";
import { geoModeName, validGeoMode } from "./geo";
import { shadeModeName } from "./colorfle";

export type GameRankEntry = {
  nickname: string;
  score: number;
  place: number;
  isMe: boolean;
};
export type GameRankBoard = {
  entries: GameRankEntry[];
  mine: GameRankEntry | null;
};
const dailyGames = ["line", "flash", "rotate", "slide", "dispatch"];
export function gameRankingMode(game: GameId, mode: string) {
  return dailyGames.includes(game) ? "classic" : mode;
}
export function GameLeaderboardCard({
  game,
  mode = "classic",
  data,
  loading = false,
  error = false,
  onRetry,
}: {
  game: GameId;
  mode?: string;
  data: GameRankBoard | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const href = `/leaderboard/?game=${game}&mode=${mode}&period=all`;
  const entries = data?.entries.slice(0, 5) ?? [];
  const outside =
    data?.mine && !entries.some((entry) => entry.isMe) ? data.mine : null;
  const modeLabel =
    game === "geo" && validGeoMode(mode)
      ? geoModeName(mode)
      : game === "colorfle"
        ? shadeModeName(mode === "timed" ? "timed" : "classic")
        : dailyGames.includes(game)
          ? "Задача дня"
          : "";
  const row = (entry: GameRankEntry, key: string) => (
    <li key={key} className={entry.isMe ? "is-me" : ""}>
      <a
        href={href}
        aria-label={`Место ${entry.place}. ${entry.nickname}. ${resultText(game, entry.score)}${entry.isMe ? ". Это ты" : ""}`}
      >
        <span className="top-five-place" aria-hidden="true">
          {entry.place}
        </span>
        <span className="top-five-name" title={entry.nickname}>
          {entry.nickname}
            {entry.isMe && <small className="game-rank-you">Твой рекорд</small>}
        </span>
        <strong className="top-five-score">
          {game === "circle"
            ? resultText(game, entry.score)
            : entry.score.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
        </strong>
      </a>
    </li>
  );
  return (
    <section
      className="top-five game-leaderboard"
      aria-label={`Топ-5 игры «${gameNames[game]}»`}
      aria-busy={loading}
    >
      <header className="top-five-heading">
        <div>
          <h2>Топ-5 · {gameNames[game]}</h2>
          <span>{modeLabel ? modeLabel + " · " : ""}За всё время</span>
        </div>
        <a
          className="top-five-cta"
          href={href}
          aria-label={`Весь рейтинг игры «${gameNames[game]}»`}
        >
          Все <span aria-hidden="true">→</span>
        </a>
      </header>
      {loading ? (
        <p className="top-five-message" role="status">
          Загружаем рейтинг…
        </p>
      ) : error ? (
        <p className="top-five-message" role="status">
          Не удалось загрузить рейтинг.{" "}
          <button type="button" className="text-button" onClick={onRetry}>
            Повторить
          </button>
        </p>
      ) : (
        <>
          {entries.length ? (
            <ol className="top-five-list" aria-label="Пять лучших результатов">
              {entries.map((entry, i) => row(entry, `top-${i}`))}
            </ol>
          ) : (
            <p className="top-five-message">Пока нет результатов.</p>
          )}
          {outside && (
            <>
              <div className="game-rank-gap" aria-hidden="true">
                ···
              </div>
              <ol
                className="top-five-list game-rank-mine"
                aria-label="Твоё место в рейтинге"
                start={outside.place}
              >
                {row(outside, "mine")}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function GameLeaderboard({
  game,
  mode = "classic",
  refreshKey = "",
}: {
  game: GameId;
  mode?: string;
  refreshKey?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const boardMode = gameRankingMode(game, mode);
  const key = `${game}:${boardMode}:${user?.id ?? "guest"}:${refreshKey}`;
  const [state, setState] = useState<{
    key: string;
    data: GameRankBoard | null;
    error: boolean;
  }>({ key: "", data: null, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setState({ key: "", data: null, error: false });
    void api<GameRankBoard>(
      `/leaderboard?game=${game}&mode=${boardMode}&period=all&limit=5`,
    )
      .then((data) => {
        if (active) setState({ key, data, error: false });
      })
      .catch(() => {
        if (active) setState({ key, data: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [game, boardMode, key, authLoading, retry]);
  const current = !authLoading && state.key === key;
  return (
    <GameLeaderboardCard
      game={game}
      mode={boardMode}
      data={current ? state.data : null}
      loading={!current}
      error={current && state.error}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}
