import { useEffect, useRef, useState } from "react";
import { api, useAuth } from "./account";
import type { StreakBoard } from "./playStreaks";
import { streakDays } from "./playStreaks";
import StreakFlame from "./StreakFlame";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import PlayStreak from "./PlayStreak";
import { ACCOUNT_GOALS, reachGoalOnce } from "./analytics";
import "./streak.css";

export function StreakBoardCard({ compact = false }: { compact?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const identity = user?.id ?? "guest";
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    data: StreakBoard;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const heading = useRef<HTMLHeadingElement>(null),
    changed = useRef(false);
  const data =
    !authLoading &&
    snapshot?.identity === identity &&
    snapshot.data.page === page
      ? snapshot.data
      : null;
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setStatus("loading");
    api<StreakBoard>(`/play/streaks?page=${page}&limit=${compact ? 5 : 25}`)
      .then((data) => {
        if (active) {
          setSnapshot({ identity, data });
          setStatus("ready");
          if (changed.current) {
            heading.current?.focus();
            changed.current = false;
          }
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [identity, authLoading, page, compact, revision]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setRevision((n) => n + 1);
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (!compact && data && status === "ready")
      reachGoalOnce(
        ACCOUNT_GOALS.leaderboardOpen,
        `streak:${identity}:${data.day}:${page}`,
        { game: "streak", period: "current" },
      );
  }, [compact, data, status, identity, page]);
  const waiting = authLoading || status === "loading";
  const pages = data ? Math.ceil(data.total / data.limit) : 1;
  return (
    <section
      className={`streak-board${compact ? " is-compact" : ""}`}
      aria-label={compact ? "Топ ударных серий" : "Рейтинг ударных серий"}
      aria-busy={waiting}
    >
      <header className="streak-board-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            Кто в огне
            <StreakFlame animated />
          </h2>
          <p>Дней подряд в Playne</p>
        </div>
        {compact && (
          <a
            className="streak-all"
            href="/leaderboard/?game=streak"
            aria-label="Все ударные серии"
          >
            Все <span aria-hidden="true">↗</span>
          </a>
        )}
      </header>
      {status === "error" ? (
        <p className="streak-empty" role="status">
          Не удалось загрузить серии.{" "}
          <button
            className="text-button"
            onClick={() => setRevision((n) => n + 1)}
          >
            Повторить
          </button>
        </p>
      ) : !data ? (
        <p className="streak-empty" role="status">
          Загружаем серии…
        </p>
      ) : data.entries.length ? (
        <ol className="streak-rank-list" aria-label="Игроки по текущей серии">
          {data.entries.map((entry, i) => (
            <li className={entry.isMe ? "is-me" : ""} key={`${page}:${i}`}>
              <span
                className="streak-place"
                aria-label={`Место ${entry.place}`}
              >
                {entry.place}
              </span>
              <strong className="streak-name" title={entry.nickname}>
                {entry.nickname}
                {entry.isMe && <small>Ты</small>}
              </strong>
              <span className="streak-score">
                <StreakFlame />
                <b>{entry.days}</b>
                <span className="sr-only">
                  {streakDays(entry.days).replace(String(entry.days), "")}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="streak-empty">
          <p>Первая серия может быть твоей.</p>
          <a href="/brain/">Выбрать игру →</a>
        </div>
      )}
      {data?.mine && !data.entries.some((e) => e.isMe) && (
        <p className="streak-mine">
          Твоя серия{" "}
          <strong>
            №{data.mine.place} · {streakDays(data.mine.days)}
          </strong>
        </p>
      )}
      {!compact && data && pages > 1 && (
        <nav className="streak-pagination" aria-label="Страницы рейтинга серий">
          <button
            className="secondary-button"
            disabled={page === 1 || waiting}
            onClick={() => {
              changed.current = true;
              setPage((p) => p - 1);
            }}
          >
            ← Назад
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className="secondary-button"
            disabled={page >= pages || waiting}
            onClick={() => {
              changed.current = true;
              setPage((p) => p + 1);
            }}
          >
            Дальше →
          </button>
        </nav>
      )}
    </section>
  );
}
export default function StreakLeaderboardPage() {
  return (
    <div className="app community-app">
      <a className="skip-link" href="#streak-main">
        К рейтингу серий
      </a>
      <GameHeader back={false} />
      <main className="community-main" id="streak-main">
        <a className="streak-back" href="/leaderboard/">
          ← Рейтинг очков
        </a>
        <p className="eyebrow">ИГРОКИ PLAYNE</p>
        <h1>
          Ударные серии<span className="brand-dot">.</span>
        </h1>
        <p className="community-intro">
          Одна законченная игра в день — и серия растёт.
        </p>
        <div className="streak-page-grid">
          <PlayStreak />
          <StreakBoardCard />
        </div>
      </main>
      <FooterLinks />
    </div>
  );
}
