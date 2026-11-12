import { useEffect, useState } from "react";
import { api, useAuth } from "./account";
import { PERCEPTION_GOALS, reachGoal } from "./analytics";
import CategoryGlyph from "./CategoryGlyph";
import { geoDailyTime } from "./geoDaily";
import PerceptionPreview from "./PerceptionPreview";
import { perceptionBoardUrl, perceptionDay, perceptionDayLabel } from "./perception";
import "./perception-home.css";

type DailyRanking = {
  day: string;
  leaders: {
    nickname: string;
    place: number;
    position: number;
    score: number;
    elapsedMs: number | null;
  }[];
};

export default function DailyPerceptionCard() {
  const { loading: authLoading } = useAuth();
  const [ranking, setRanking] = useState<DailyRanking | null>();

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    let pending = false;

    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await api<DailyRanking>("/perception/daily");
        if (active) setRanking(data);
      } catch {
        if (active) {
          setRanking((previous) => previous?.day === perceptionDay() ? previous : null);
        }
      } finally {
        pending = false;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authLoading]);

  return (
    <article className="game-card perception-home-card" aria-labelledby="perception-home-title" data-preview-on-view>
      <a className="perception-home-game" href="/perception/" aria-label="Играть в «Приметь»">
        <span className="card-category">
          <CategoryGlyph kind="size" /> ВОСПРИЯТИЕ
        </span>
        <div className="card-copy">
          <h2 id="perception-home-title">Приметь<span className="brand-dot">.</span></h2>
          <p>Пять заданий на глазомер и чувство ритма.</p>
        </div>
        <PerceptionPreview />
        <span className="card-play">Играть <span aria-hidden="true">→</span></span>
      </a>
      <section className="perception-home-ranking" aria-labelledby="perception-home-ranking-title">
        <span className="perception-ranking-spark" aria-hidden="true" />
        <header className="perception-ranking-heading">
          <div>
            <h3 id="perception-home-ranking-title">Рейтинг дня</h3>
            {ranking && <time dateTime={ranking.day}>{perceptionDayLabel(ranking.day)}</time>}
          </div>
          <a
            className="perception-ranking-link"
            href={perceptionBoardUrl(ranking?.day)}
            aria-label="Открыть рейтинг дня «Приметь»"
            onClick={() => reachGoal(PERCEPTION_GOALS.leaderboardOpen, {
              game: "perception", mode: "daily", source: "home",
              ...(ranking && { day: ranking.day }),
            })}
          >
            Весь рейтинг <span aria-hidden="true">↗</span>
          </a>
        </header>
        {ranking?.leaders.length ? (
          <ol className="perception-ranking-list" role="list">
            {ranking.leaders.map((leader) => (
              <li key={leader.position}>
                <span className="perception-ranking-place">{leader.place}</span>
                <span className="perception-ranking-name">{leader.nickname}</span>
                <strong>{leader.score}<span className="sr-only"> очков</span></strong>
                {leader.elapsedMs !== null && (
                  <small><span className="sr-only">Время </span>{geoDailyTime(leader.elapsedMs)}</small>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="perception-ranking-status">
            {ranking ? (
              <><strong>Первое место свободно</strong><p>Сыграй и задай планку на сегодня.</p></>
            ) : (
              <p>{ranking === null ? "Рейтинг временно недоступен" : "Загружаем результаты…"}</p>
            )}
          </div>
        )}
      </section>
    </article>
  );
}
