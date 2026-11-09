import { PLAY_GOALS, reachGoal } from "./analytics";
import { GEO_DAILY_URL, geoDailyBoardUrl, geoDailyLabel, geoDailyTime } from "./geoDaily";
import { geoPoints } from "./geo";
import LandmarkPreview from "./LandmarkPreview";
import { useGeoDailyStatus } from "./useGeoDailyStatus";
import "./geo-daily.css";

export default function DailyGeoCard() {
  const status = useGeoDailyStatus(true, true);
  const attempt = status?.attempt;
  const leaders = status?.leaders ?? [];
  const rankingUrl = geoDailyBoardUrl(status?.day);
  const action = attempt?.completed
    ? "Мой результат"
    : attempt ? "Продолжить маршрут" : "Пройти маршрут";
  return (
    <section className="daily-geo-card" aria-labelledby="daily-geo-title">
      <div className="daily-geo-copy">
        <p className="eyebrow">
          «ГДЕ Я?» · {status ? geoDailyLabel(status.day) : "КАЖДЫЙ ДЕНЬ"}
        </p>
        <h2 id="daily-geo-title">Маршрут дня<span className="brand-dot">.</span></h2>
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
            onClick={() => reachGoal(PLAY_GOALS.todayGame, {
              game: "geo", mode: "daily", source: "geo_daily_home", action,
            })}
          >
            <span className="daily-geo-launch-label">{action}</span>
            <span className="daily-geo-launch-arrow" aria-hidden="true">→</span>
            <span className="daily-geo-launch-play" aria-hidden="true">▶</span>
          </a>
          <a className="daily-geo-ranking" href={rankingUrl}>
            Рейтинг дня
          </a>
        </div>
      </div>
      <div className={leaders.length ? "daily-geo-leaders" : "daily-geo-art"}>
        <div className="daily-geo-leaders-header">
          <h3>Впереди сегодня</h3>
          <a className="daily-geo-rank-shortcut" href={rankingUrl} aria-label="Рейтинг дня">
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        {leaders.length ? (
          <ol>
            {leaders.map((leader) => (
              <li key={leader.position}>
                <span className="daily-geo-leader-place">{leader.place}</span>
                <span className="daily-geo-leader-name">{leader.nickname}</span>
                <span className="daily-geo-leader-score">
                  <strong>{geoPoints(leader.score)}</strong>
                  {leader.elapsedMs !== null && <small>{geoDailyTime(leader.elapsedMs)}</small>}
                </span>
              </li>
            ))}
          </ol>
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
