import { useEffect, useRef, useState } from "react";
import { api, useAuth } from "./account";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import { brainGames } from "./brainContent";
import { brainMoscowDate } from "./brain";
import { BrainPreview } from "./BrainBoards";
import {
  brainDateLabel,
  brainWeekDays,
  type BrainProgress,
} from "./brainProgress";
import "./brain-hub.css";
import CategoryGlyph from "./CategoryGlyph";
import { DailySpark } from "./HandDrawn";
import PlayWeek from "./PlayWeek";

export function BrainFeature() {
  return (
    <section
      className="brain-feature"
      id="brain-games"
      aria-labelledby="brain-feature-title"
    >
      <div className="brain-section-heading">
        <div>
          <p className="eyebrow">
            ПАМЯТЬ · ПРОСТРАНСТВО · ПЛАНИРОВАНИЕ · ВНИМАНИЕ
          </p>
          <h2 id="brain-feature-title">
            Разминка для ума<span className="brand-dot">.</span>
            <DailySpark />
          </h2>
        </div>
        <a href="/brain/">Вся разминка и мой прогресс ↗</a>
      </div>
      <p className="brain-feature-description">
        Четыре короткие игры на разные навыки. Новые задания каждый день —
        выбери одну или попробуй все.
      </p>
      <div className="brain-cards brain-cards-compact">
        {brainGames.map((game) => (
          <a
            className={`brain-card brain-card-${game.id}`}
            key={game.id}
            href={game.path}
          >
            <span className="brain-card-skill">
              <CategoryGlyph
                kind={
                  game.id === "flash"
                    ? "memory"
                    : game.id === "rotate"
                      ? "space"
                      : game.id === "slide"
                        ? "planning"
                        : "attention"
                }
              />
              {game.skill}
            </span>
            <BrainPreview game={game.id} />
            <h3>{game.name}</h3>
            <p>{game.tagline}</p>
            <span className="brain-card-link">
              Играть <span aria-hidden="true">↗</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function BrainHub() {
  const { user, loading: authLoading } = useAuth();
  const identity = user?.id ?? "guest";
  const today = brainMoscowDate();
  const lastDay = useRef(today);
  const [storedProgress, setStoredProgress] = useState<{
    identity: string;
    data: BrainProgress;
  } | null>(null);
  const progress =
    storedProgress?.identity === identity &&
    storedProgress.data.today.day === today
      ? storedProgress.data
      : null;
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      lastDay.current = brainMoscowDate();
      setRetry((value) => value + 1);
    };
    const visible = () => {
      if (!document.hidden) refresh();
    };
    const timer = window.setInterval(() => {
      if (brainMoscowDate() !== lastDay.current) refresh();
    }, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLoading(true);
    setError("");
    api<BrainProgress>("/brain/progress")
      .then((data) => {
        if (active) setStoredProgress({ identity, data });
      })
      .catch(() => {
        if (active)
          setError(
            "Не удалось загрузить прогресс. Игры доступны — можно начать сейчас.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, authLoading, retry]);
  const completed = Object.values(progress?.today.results ?? {}).filter(
    (result) => result?.completed,
  ).length;
  const week = progress
    ? brainWeekDays(progress.today.day, progress.last7Days)
    : [];
  return (
    <div className="app brain-hub">
      <a className="skip-link" href="#brain-main">
        К разминке
      </a>
      <GameHeader />
      <main id="brain-main">
        <section className="brain-hub-intro">
          <p className="eyebrow">ЧЕТЫРЕ ИГРЫ · ЧЕТЫРЕ РАЗНЫХ ЗАДАЧИ</p>
          <h1>
            Разминка для ума<span className="brand-dot">.</span>
          </h1>
          <p>
            Запомни узор, поверни фигуру в уме, освободи выход и отправь поезда
            по своим станциям. Начни с того, что интересно сегодня.
          </p>
        </section>
        <section className="brain-daily" aria-labelledby="brain-today-title">
          <div className="brain-section-heading">
            <div>
              <p className="eyebrow">
                {progress
                  ? brainDateLabel(progress.today.day)
                  : "КАЖДЫЙ ДЕНЬ НОВЫЕ ЗАДАНИЯ"}
              </p>
              <h2 id="brain-today-title">Твоя разминка сегодня</h2>
            </div>
            <span className="brain-today-count">{completed} / 4 игр</span>
          </div>
          <p className="brain-section-lead">
            У всех одинаковые задания дня. Первую попытку записываем в рейтинг;
            незавершённую партию можно продолжить.
          </p>
          {error && (
            <div className="brain-progress-error" role="status">
              <p>{error}</p>
              <button
                className="text-button"
                onClick={() => setRetry((v) => v + 1)}
              >
                Повторить загрузку
              </button>
            </div>
          )}
          {loading && (
            <p className="brain-loading" role="status">
              Загружаем твой прогресс…
            </p>
          )}
          <div className="brain-cards">
            {brainGames.map((game) => {
              const result = progress?.today.results[game.id];
              return (
                <article
                  className={`brain-card brain-card-${game.id}`}
                  key={game.id}
                >
                  <div className="brain-card-top">
                    <span className="brain-card-skill">{game.skill}</span>
                    {result?.completed && (
                      <span className="brain-done">✓ Готово</span>
                    )}
                  </div>
                  <a
                    className="brain-card-preview"
                    href={game.path}
                    aria-label={`Играть в «${game.name}»`}
                  >
                    <BrainPreview game={game.id} />
                  </a>
                  <h3>
                    <a href={game.path}>{game.name}</a>
                  </h3>
                  <p>{game.description}</p>
                  <p className="brain-day-result">
                    {result?.completed
                      ? `Сегодня: ${result.score ?? 0} / 500 очков`
                      : result
                        ? "Партия начата — продолжи с того же места"
                        : "5 раундов · до 500 очков"}
                  </p>
                  <a
                    className="secondary-button"
                    href={
                      result?.completed
                        ? `${game.path}?result=${encodeURIComponent(result.id)}`
                        : game.path
                    }
                  >
                    {result?.completed
                      ? "Посмотреть результат"
                      : result
                        ? "Продолжить партию"
                        : "Начать задачу дня"}
                    <span aria-hidden="true">→</span>
                  </a>
                </article>
              );
            })}
          </div>
        </section>
        <PlayWeek
          day={progress?.today.day ?? today}
          days={week}
          goal={progress?.goal}
          milestones={progress?.milestones}
          loading={loading}
          error={error ? "Не удалось обновить неделю." : undefined}
          onRetry={() => setRetry((value) => value + 1)}
        />
        <section
          className="brain-practice"
          aria-labelledby="brain-practice-title"
        >
          <div className="brain-section-heading">
            <div>
              <p className="eyebrow">БЕЗ ВЛИЯНИЯ НА РЕЙТИНГ</p>
              <h2 id="brain-practice-title">Практика в своём темпе</h2>
            </div>
            <a href="/account/">Личная история →</a>
          </div>
          <p className="brain-section-lead">
            Выбери сложность сам. После нескольких партий подскажем, когда
            попробовать следующий уровень. Очки сравнивай на одинаковой
            сложности.
          </p>
          <div className="brain-practice-links">
            {brainGames.map((game) => {
              const suggested = progress?.suggestedLevels[game.id];
              const level = Number.isInteger(suggested)
                ? Math.max(1, Math.min(3, suggested!))
                : 1;
              return (
                <a
                  href={`${game.path}?mode=practice&level=${level}`}
                  key={game.id}
                >
                  <span>{game.name}</span>
                  <small>
                    {level === 1
                      ? "Начни с обычной сложности"
                      : level === 2
                        ? "Рекомендуем сложный уровень"
                        : "Можно попробовать экспертный"}
                  </small>
                  <span aria-hidden="true">↗</span>
                </a>
              );
            })}
          </div>
        </section>
        <section
          className="brain-score-info"
          aria-labelledby="brain-ranking-title"
        >
          <div>
            <p className="eyebrow">ОДНА КАТЕГОРИЯ В ОБЩЕМ ЗАЧЁТЕ</p>
            <h2 id="brain-ranking-title">Четыре игры — до 1000 баллов</h2>
            <p>
              Лучший дневной результат каждой игры даёт до 250 баллов. Вместе
              они образуют одну категорию «Разминка для ума» в общем рейтинге
              Playne. Практика остаётся в личной истории.
            </p>
          </div>
          <a className="primary" href="/leaderboard/?game=brain">
            Рейтинг разминки →
          </a>
        </section>
        <section
          className="brain-explain"
          aria-labelledby="brain-explain-title"
        >
          <h2 id="brain-explain-title">Смотри на конкретный прогресс</h2>
          <p>
            Во «Вспышке» — запомненные клетки, в «Повороте» — верные сравнения,
            в «Передвинь» — ходы до выхода, в «Диспетчере» — доставленные
            поезда. Это показатели игровых задач: здесь интересно практиковаться
            и находить более удачный способ решения.
          </p>
          <a href="/guides/brain/">Как устроены игры и очки →</a>
        </section>
      </main>
      <footer className="community-footer">
        <FooterLinks />
      </footer>
    </div>
  );
}
