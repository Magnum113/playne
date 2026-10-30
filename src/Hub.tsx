import { PressurePreview } from "./PressureGame";
import LinePreview from "./LinePreview";
import { readPressStats, formatPressScore } from "./pressure";
import { HeaderAccount } from "./SiteHeader";
import HubTopFive from "./OverallLeaderboard";
import FooterLinks from "./FooterLinks";
import { DestroyWebsiteLink, PlayneBrand, ThemeToggle } from "./SiteHeader";
import { SizePreview, CirclePreview, ColorPreview } from "./GamePreviews";
export { SizePreview, CirclePreview, ColorPreview } from "./GamePreviews";
import { readBest } from "./game";
import { circlePercent, readCircleBest } from "./circle";
import GeoPreview from "./GeoPreview";
import LandmarkPreview from "./LandmarkPreview";
import { readGeoStats } from "./geo";
import { BrainFeature } from "./BrainHub";
import { MarkerWord } from "./HandDrawn";
import RandomGame from "./RandomGame";
import RecordCelebration from "./RecordCelebration";
import CategoryGlyph from "./CategoryGlyph";
import useCardMotion from "./useCardMotion";
import TodayPlay from "./TodayPlay";
import { StreakBoardCard } from "./StreakLeaderboard";

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Hub() {
  const motionRef = useCardMotion<HTMLElement>();
  const best = readBest();
  const pressureBest = readPressStats().best;
  const circleBest = readCircleBest();
  const geoBest = readGeoStats().best;
  const landmarkBest = readGeoStats("landmarks").best;
  return (
    <div className="hub app">
      <a className="skip-link" href="#main-content">
        Перейти к играм
      </a>
      <header className="hub-header">
        <PlayneBrand large />
        <nav aria-label="Навигация">
          <a href="#games">Игры</a>
          <a href="#brain-games" className="hub-brain-link">
            Разминка
          </a>
          <a href="#about">О Playne</a>
          <a className="hub-ranking-link" href="/leaderboard/">
            Рейтинг
          </a>
          <DestroyWebsiteLink />
          <HeaderAccount />
          <ThemeToggle />
        </nav>
      </header>
      <main className="hub-main" id="main-content" ref={motionRef}>
        <section id="games" aria-labelledby="games-title">
          <div className="hub-intro">
            <div className="hub-intro-copy">
              <p className="eyebrow">ИГРЫ В БРАУЗЕРЕ</p>
              <h1 id="games-title">
                Во что <MarkerWord>сыграем?</MarkerWord>
              </h1>
              <p>
                Проверь глазомер, реакцию и знание мира.
                <br />
                <a className="hub-brain-shortcut" href="#brain-games">
                  Разминка для ума каждый день →
                </a>
              </p>
            </div>
            <div className="hub-intro-random">
              <RandomGame />
            </div>
          </div>
          <RecordCelebration />
          <TodayPlay />
          <div className="hub-catalog">
            <aside className="hub-leaderboards" aria-label="Рейтинги Playne">
              <HubTopFive />
              <StreakBoardCard compact />
            </aside>
            <div className="game-cards">
              <a
                className="game-card game-card-live"
                href="/naglaz/"
                aria-label="Играть в На глаз"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="size" />
                    ГЛАЗОМЕР
                  </span>
                </div>
                <SizePreview />
                <div className="card-copy">
                  <h2>
                    На глаз<span className="brand-dot">.</span>
                  </h2>
                  <p>
                    Насколько велика ракета рядом с башней?
                    <br /> Подбери размер и проверь себя.
                  </p>
                </div>
                <div className="card-bottom">
                  <span>
                    {best > 0
                      ? `Твой рекорд: ${best} / 500`
                      : "5 раундов · 500 очков"}
                  </span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
              <a
                className="game-card game-card-live"
                href="/circle/"
                aria-label="Играть в Круг"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="circle" />
                    ТОЧНОСТЬ
                  </span>
                </div>
                <CirclePreview />
                <div className="card-copy">
                  <h2>
                    Круг<span className="brand-dot">.</span>
                  </h2>
                  <p>
                    Нарисуй идеальный круг одним движением.
                    <br /> Кажется, что это просто?
                  </p>
                </div>
                <div className="card-bottom">
                  <span>
                    {circleBest > 0
                      ? `Твой рекорд: ${circlePercent(circleBest)}`
                      : "Одна линия · 100% точности"}
                  </span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
              <a
                className="game-card game-card-live"
                href="/colorfle/"
                aria-label="Играть в Оттенок"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="color" />
                    ЧУВСТВО ЦВЕТА
                  </span>
                </div>
                <ColorPreview />
                <div className="card-copy">
                  <h2>
                    Оттенок<span className="brand-dot">.</span>
                  </h2>
                  <p>
                    Сможешь попасть в этот цвет?
                    <br /> Подбери оттенок на палитре.
                  </p>
                </div>
                <div className="card-bottom">
                  <span>5 цветов · 500 очков</span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
              <a
                className="game-card game-card-live"
                href="/geo/"
                aria-label="Играть в Где я?"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="geo" />
                    ГЕОГРАФИЯ
                  </span>
                </div>
                <GeoPreview />
                <div className="card-copy">
                  <h2>
                    Где я<span className="brand-dot">?</span>
                  </h2>
                  <p>
                    Бесплатный аналог GeoGuessr.
                    <br /> Найди его на карте мира.
                  </p>
                </div>
                <div className="card-bottom">
                  <span>
                    {geoBest > 0
                      ? `Твой рекорд: ${geoBest.toLocaleString("ru-RU")} / 500`
                      : "5 мест · 500 очков"}
                  </span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
              <a
                className="game-card game-card-live landmark-card"
                href="/geo/?mode=landmarks"
                aria-label="Играть в Достопримечательности"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="landmark" />
                    ЗНАМЕНИТЫЕ МЕСТА
                  </span>
                </div>
                <LandmarkPreview />
                <div className="card-copy">
                  <h2>
                    Достопримечательности<span className="brand-dot">.</span>
                  </h2>
                  <p>
                    Узнай храмы, памятники и чудеса природы.
                    <br />
                    Найди их на карте мира.
                  </p>
                </div>
                <div className="card-bottom">
                  <span>
                    {landmarkBest > 0
                      ? `Твой рекорд: ${landmarkBest.toLocaleString("ru-RU")} / 500`
                      : "5 мест · 500 очков"}
                  </span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
              <a
                className="game-card game-card-live"
                href="/pressure/"
                aria-label="Играть в Жми — бесплатный аналог Press Under Pressure"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="reaction" />
                    ВНИМАТЕЛЬНОСТЬ И РЕАКЦИЯ
                  </span>
                </div>
                <PressurePreview />
                <div className="card-copy">
                  <h2>
                    Жми<span className="brand-dot">.</span>
                  </h2>
                  <p>
                    По мотивам Press Under Pressure, на русском.
                    <br />
                    Одна кнопка, память, логика и реакция.
                  </p>
                </div>
                <div className="card-bottom">
                  <span>
                    {pressureBest > 0
                      ? `Твой рекорд: ${formatPressScore(pressureBest)}`
                      : "До первой ошибки · без ограничения уровней"}
                  </span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
              <a
                className="game-card game-card-live line-card"
                href="/one-line/"
                aria-label="Играть в Одной линией — соедини числа и заполни всё поле"
              >
                <div className="card-topline">
                  <span className="card-category">
                    <CategoryGlyph kind="line" />
                    ЛОГИКА И МАРШРУТЫ
                  </span>
                </div>
                <LinePreview />
                <div className="card-copy">
                  <h2>
                    Одной линией<span className="brand-dot">.</span>
                  </h2>
                  <p>
                    Соедини числа по порядку.
                    <br />
                    Пройди каждую клетку один раз.
                  </p>
                </div>
                <div className="card-bottom">
                  <span>5 полей дня · 500 очков</span>
                  <span className="card-play">
                    Играть <Arrow />
                  </span>
                </div>
              </a>
            </div>
          </div>
        </section>
        <BrainFeature />
        <section className="hub-about" id="about" aria-labelledby="about-title">
          <div className="hub-about-heading">
            <p className="eyebrow">О PLAYNE</p>
            <h2 id="about-title">Есть пара минут?</h2>
            <p>
              Простые игры, к которым хочется вернуться.
              <br /> Выбирай любую и играй прямо в браузере.
            </p>
          </div>
          <div className="hub-facts">
            <div>
              <span className="fact-symbol mint-symbol" aria-hidden="true">
                ↗
              </span>
              <h3>Сразу в игру</h3>
              <p>Без аккаунта и установки.</p>
            </div>
            <div>
              <span className="fact-symbol purple-symbol" aria-hidden="true">
                ◎
              </span>
              <h3>В своём темпе</h3>
              <p>Можно подумать. Таймер не торопит.</p>
            </div>
            <div>
              <span className="fact-symbol orange-symbol" aria-hidden="true">
                ✳
              </span>
              <h3>Ещё одна попытка</h3>
              <p>Переигрывай и улучшай результат.</p>
            </div>
          </div>
        </section>
        <section className="hub-faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Пара вопросов</h2>
          <div className="faq-items">
            <details>
              <summary>
                Все игры бесплатные?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Да. В каждой игре первая партия доступна без входа. Затем войди
                через Яндекс, чтобы играть дальше бесплатно и сохранять
                результаты в рейтинг.
              </p>
            </details>
            <details>
              <summary>
                Где хранится мой рекорд?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Локальный рекорд хранится в этом браузере. Чтобы сохранить
                результат в аккаунте и общем рейтинге, войди через Яндекс —
                результаты онлайн-партий сохранятся в рейтинг автоматически.
              </p>
            </details>
            <details>
              <summary>
                Можно играть с телефона?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Да. Меняй размеры, рисуй круг, подбирай цвет, осматривай
                панорамы и соединяй числа пальцем прямо на экране.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className="hub-footer">
        <PlayneBrand />
        <span>Игры для любопытных.</span>
        <DestroyWebsiteLink badge />
        <a href="#games">Выбрать игру ↑</a>
        <FooterLinks />
      </footer>
    </div>
  );
}
