import { useEffect, useState } from "react";
import { api } from "./account";
import MaloktoDescent from "./MaloktoDescent";
import CategoryGlyph from "./CategoryGlyph";
import { geoDailyLabel } from "./geoDaily";
import { maloktoBoardUrl, maloktoTime } from "./malokto";
import "./malokto.css";

export type MaloktoDaily = {
  day: string;
  available: boolean;
  attempt: { completed: boolean } | null;
  leaders: { nickname: string; score: number; elapsedMs: number; place: number; position: number }[];
};

export default function MaloktoCard() {
  const [data, setData] = useState<MaloktoDaily | null>();
  useEffect(() => {
    let active = true;
    api<MaloktoDaily>("/malokto/daily")
      .then(value => { if (active) setData(value); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, []);
  return <article className="game-card perception-home-card malokto-home" aria-labelledby="malokto-home-title">
    <a href="/malokto/" className="perception-home-game">
      <div className="card-topline malokto-card-topline">
        <span className="card-category"><CategoryGlyph kind="logic" /> ИГРА ДНЯ</span>
        <span className="card-badge available"><i aria-hidden="true" /> Новинка</span>
      </div>
      <div className="card-copy">
        <h2 id="malokto-home-title">Мало кто<span className="brand-dot">.</span></h2>
        <p>Вспомни правильный ответ, который мало кому придёт в голову.</p>
      </div>
      <MaloktoDescent variant="card" />
      <span className="card-play">Играть <span aria-hidden="true">→</span></span>
    </a>
    <section className="perception-home-ranking malokto-home-ranking" aria-labelledby="malokto-home-ranking-title">
      <header className="perception-ranking-heading">
        <div>
          <h3 id="malokto-home-ranking-title">Рейтинг дня</h3>
          {data && <time dateTime={data.day}>{geoDailyLabel(data.day)}</time>}
        </div>
        <a className="perception-ranking-link" href={maloktoBoardUrl(data?.day)} aria-label="Открыть рейтинг дня «Мало кто»">Весь рейтинг <span aria-hidden="true">↗</span></a>
      </header>
      {data?.leaders.length ? <ol className="perception-ranking-list" role="list">
        {data.leaders.map(leader => <li key={leader.position}>
          <span className="perception-ranking-place">{leader.place}</span>
          <span className="perception-ranking-name">{leader.nickname}</span>
          <strong>{leader.score}</strong>
          <small>{maloktoTime(leader.elapsedMs)}</small>
        </li>)}
      </ol> : <div className="perception-ranking-status">
        <p>{data === undefined ? "Загружаем результаты…" : !data ? "Рейтинг временно недоступен" : "Первое место пока свободно."}</p>
      </div>}
    </section>
  </article>;
}
