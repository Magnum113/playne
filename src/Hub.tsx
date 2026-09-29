import { DestroyWebsiteLink, PlayneBrand, ThemeToggle } from "./SiteHeader";
import Silhouette from "./Silhouette";
import { objects } from "./data";
import { readBest } from "./game";
import { circlePercent, readCircleBest } from "./circle";

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

function SizePreview() {
  return (
    <svg className="size-preview" viewBox="0 0 420 190" aria-hidden="true">
      <path d="M36 158H384" className="preview-ground" />
      <g style={{ color: "var(--mint)" }}>
        <Silhouette object={objects.eiffel} x={94} y={22} scale={136 / 330} />
      </g>
      <g style={{ color: "var(--purple)" }}>
        <Silhouette object={objects.rocket} x={283} y={46} scale={112 / 70} />
      </g>
      <path
        d="m187 102 37 0m-8-8 8 8-8 8"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M269 34h37v136h-37Z"
        fill="none"
        stroke="var(--purple)"
        strokeDasharray="3 5"
        opacity=".45"
      />
      <rect
        x="296"
        y="25"
        width="23"
        height="23"
        rx="6"
        fill="var(--purple-soft)"
      />
      <path
        d="m303 41 9-9m-6 0h6v6"
        fill="none"
        stroke="#292133"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CirclePreview() {
  return (
    <svg className="size-preview" viewBox="0 0 420 190" aria-hidden="true">
      <circle
        cx="210"
        cy="94"
        r="66"
        fill="none"
        stroke="var(--purple)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        opacity=".4"
      />
      <path
        d="M275 94C280 128 250 163 213 164C174 165 143 136 142 97C139 63 164 26 205 25C243 24 276 51 276 91"
        fill="none"
        stroke="var(--mint)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="210" cy="94" r="12" fill="var(--purple-tint)" />
      <circle cx="210" cy="94" r="4" fill="var(--purple)" />
      <circle cx="276" cy="91" r="5" fill="var(--mint)" />
    </svg>
  );
}

export default function Hub() {
  const best = readBest();
  const circleBest = readCircleBest();
  return (
    <div className="hub app">
      <a className="skip-link" href="#main-content">
        Перейти к играм
      </a>
      <header className="hub-header">
        <div>
          <PlayneBrand large />
          <p className="brand-tagline">Место для небольших игр</p>
        </div>
        <nav aria-label="Навигация">
          <a href="#games">Игры</a>
          <a href="#about">О Playne</a>
          <DestroyWebsiteLink />
          <ThemeToggle />
        </nav>
      </header>
      <main className="hub-main" id="main-content">
        <section id="games" aria-labelledby="games-title">
          <div className="hub-intro">
            <div>
              <p className="eyebrow">ИГРЫ В БРАУЗЕРЕ</p>
              <h1 id="games-title">Во что сыграем?</h1>
            </div>
            <p>
              Проверь глазомер и точность.
              <br /> Без скачивания и регистрации.
            </p>
          </div>
          <div className="game-cards">
            <a
              className="game-card game-card-live"
              href="/naglaz/"
              aria-label="Играть в На глаз"
            >
              <div className="card-topline">
                <span className="card-category">ГЛАЗОМЕР</span>
                <span className="card-badge available">
                  <i /> Можно играть
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
                <span className="card-category">ТОЧНОСТЬ</span>
                <span className="card-badge available">
                  <i /> Можно играть
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
          </div>
        </section>
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
              <p>Да. «На глаз» и «Круг» доступны бесплатно, без регистрации.</p>
            </details>
            <details>
              <summary>
                Где хранится мой рекорд?<span aria-hidden="true">+</span>
              </summary>
              <p>
                В этом браузере на этом устройстве. Если удалить данные сайта,
                рекорд сбросится.
              </p>
            </details>
            <details>
              <summary>
                Можно играть с телефона?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Да. В «На глаз» меняй размер пальцем, а в «Круге» рисуй прямо на
                экране.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className="hub-footer">
        <PlayneBrand />
        <span>Небольшие игры для любопытных.</span>
        <DestroyWebsiteLink badge />
        <a href="#games">Выбрать игру ↑</a>
      </footer>
    </div>
  );
}
