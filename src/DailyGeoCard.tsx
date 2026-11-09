import { PLAY_GOALS, reachGoal } from "./analytics";
import { GEO_DAILY_URL, geoDailyBoardUrl, geoDailyLabel } from "./geoDaily";
import LandmarkPreview from "./LandmarkPreview";
import { useGeoDailyStatus } from "./useGeoDailyStatus";
import "./geo-daily.css";

export default function DailyGeoCard() {
  const status = useGeoDailyStatus();
  const attempt = status?.attempt;
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
            className="primary"
            href={GEO_DAILY_URL}
            onClick={() => reachGoal(PLAY_GOALS.todayGame, {
              game: "geo", mode: "daily", source: "geo_daily_home", action,
            })}
          >
            {action} <span aria-hidden="true">→</span>
          </a>
          <a className="daily-geo-ranking" href={geoDailyBoardUrl(status?.day)}>
            Рейтинг дня
          </a>
        </div>
      </div>
      <div className="daily-geo-art"><LandmarkPreview /></div>
    </section>
  );
}
