import { useState, type CSSProperties } from "react";
import { PLAY_GOALS, reachGoal } from "./analytics";
import { GEO_DAILY_URL, geoDailyBoardUrl, geoDailyLabel, geoDailyTime } from "./geoDaily";
import { geoPoints } from "./geo";
import { geoDailyAction, trackDailyAction, useDailyImpression } from "./geoAnalytics";
import LandmarkPreview from "./LandmarkPreview";
import { useGeoDailyStatus } from "./useGeoDailyStatus";
import { useLeaderboardTicker } from "./useLeaderboardTicker";
import "./geo-daily.css";

export default function DailyGeoCard() {
  const status = useGeoDailyStatus(true, true);
  const heading = useDailyImpression("home", status);
  const attempt = status?.attempt;
  const leaders = status?.leaders ?? [];
  const [rankingFocused, setRankingFocused] = useState(false);
  const { viewport, position, onTransitionEnd } = useLeaderboardTicker(
    leaders.length, JSON.stringify([status?.day, leaders]), rankingFocused, "(max-width: 620px)",
  );
  const rankingUrl = geoDailyBoardUrl(status?.day);
  const trackRanking = () => trackDailyAction("home", "leaderboard", status?.day);
  const action = attempt?.completed
    ? "Мой результат"
    : attempt ? "Продолжить маршрут" : "Пройти маршрут";
  return (
    <section className="daily-geo-card" aria-labelledby="daily-geo-title">
      <div className="daily-geo-copy">
        <p className="eyebrow">
          «ГДЕ Я?» · {status ? geoDailyLabel(status.day) : "КАЖДЫЙ ДЕНЬ"}
        </p>
        <h2 id="daily-geo-title" ref={heading}>Маршрут дня<span className="brand-dot">.</span></h2>
        <p>
          {attempt?.completed
            ? `Твой результат — ${attempt.score ?? 0} из 500. Новый маршрут завтра.`
            : "Пять достопримечательностей. Один маршрут для всех."}
        </p>
        <div className="daily-geo-actions">
          <a
            className="primary daily-geo-launch"
            href={GEO_DAILY_URL}
            aria-label={action}
            onClick={() => {
              reachGoal(PLAY_GOALS.todayGame, {
                game: "geo", mode: "daily", source: "geo_daily_home", action,
              });
              trackDailyAction("home", geoDailyAction(attempt), status?.day);
            }}
          >
            <span className="daily-geo-launch-label">{action}</span>
            <span className="daily-geo-launch-arrow" aria-hidden="true">→</span>
            <span className="daily-geo-launch-play" aria-hidden="true">▶</span>
          </a>
          <a className="daily-geo-ranking" href={rankingUrl} onClick={trackRanking}>
            Рейтинг дня
          </a>
        </div>
      </div>
      <div ref={viewport} className={leaders.length ? "daily-geo-leaders" : "daily-geo-art"}>
        <div className="daily-geo-leaders-header">
          <h3>Впереди сегодня</h3>
          <a className="daily-geo-rank-shortcut" href={rankingUrl} aria-label="Рейтинг дня"
            onClick={trackRanking}
            onFocus={(event) => setRankingFocused(event.currentTarget.matches(":focus-visible"))}
            onBlur={() => setRankingFocused(false)}>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        {leaders.length ? (
          <div className="daily-geo-leader-window">
            <ol
              className={position.snap ? "is-resetting" : undefined}
              style={{ "--daily-geo-leader-index": position.index } as CSSProperties}
              onTransitionEnd={onTransitionEnd}
            >
              {(leaders.length > 1 ? [...leaders, leaders[0]] : leaders).map((leader, index) => {
                const repeat = index === leaders.length;
                return (
                  <li key={repeat ? "repeat" : leader.position}
                    className={repeat ? "daily-geo-leader-repeat" : undefined}
                    aria-hidden={repeat || undefined}>
                    <span className="daily-geo-leader-place">{leader.place}</span>
                    <span className="daily-geo-leader-name">{leader.nickname}</span>
                    <span className="daily-geo-leader-score">
                      <strong>{geoPoints(leader.score)}</strong>
                      {leader.elapsedMs !== null && <small>{geoDailyTime(leader.elapsedMs)}</small>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <>
            <LandmarkPreview />
            {status && <p>Первое место пока свободно</p>}
          </>
        )}
      </div>
    </section>
  );
}
