import { DestroyWebsiteLink, PlayneBrand, ThemeToggle } from "./SiteHeader";
import Silhouette from "./Silhouette";
import { objects } from "./data";
import { readBest } from "./game";

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

function MemoryPreview() {
  return (
    <svg viewBox="0 0 260 150" className="coming-preview" aria-hidden="true">
      <g transform="rotate(-12 93 81)">
        <rect
          x="60"
          y="28"
          width="68"
          height="98"
          rx="13"
          fill="var(--mint-tint)"
          stroke="var(--mint)"
          strokeWidth="1.5"
        />
        <path
          d="m94 52 9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3Z"
          fill="var(--mint)"
        />
      </g>
      <g transform="rotate(12 165 78)">
        <rect
          x="131"
          y="25"
          width="68"
          height="98"
          rx="13"
          fill="var(--purple-tint)"
          stroke="var(--purple)"
          strokeWidth="1.5"
        />
        <path
          d="m165 49 9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3Z"
          fill="var(--purple)"
        />
      </g>
    </svg>
  );
}

function GeographyPreview() {
  return (
    <svg
      viewBox="0 0 260 150"
      className="coming-preview"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="126"
        cy="78"
        r="46"
        fill="var(--orange-tint)"
        stroke="var(--orange)"
        strokeWidth="1.5"
      />
      <ellipse
        cx="126"
        cy="78"
        rx="21"
        ry="46"
        stroke="var(--orange)"
        strokeWidth="1.2"
      />
      <path
        d="M82 65h88M82 91h88M126 32v92"
        stroke="var(--orange)"
        strokeWidth="1.2"
      />
      <path
        d="M173 23a19 19 0 0 1 19 19c0 14-19 32-19 32s-19-18-19-32a19 19 0 0 1 19-19Z"
        fill="var(--panel)"
        stroke="var(--orange)"
        strokeWidth="2"
      />
      <circle cx="173" cy="42" r="6" fill="var(--orange)" />
    </svg>
  );
}

export default function Hub() {
  const best = readBest();
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
              Проверь глазомер, память и интуицию.
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
            <article className="game-card coming-card">
              <div className="card-topline">
                <span className="card-category">ПАМЯТЬ</span>
                <span className="card-badge">Скоро</span>
              </div>
              <MemoryPreview />
              <div className="card-copy">
                <h2>Пары</h2>
                <p>
                  Открывай карточки.
                  <br /> Запоминай. Находи совпадения.
                </p>
              </div>
              <div className="card-bottom">
                <span>Готовим новую игру</span>
                <span className="coming-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            </article>
            <article className="game-card coming-card">
              <div className="card-topline">
                <span className="card-category">ГЕОГРАФИЯ</span>
                <span className="card-badge">Скоро</span>
              </div>
              <GeographyPreview />
              <div className="card-copy">
                <h2>Ближе</h2>
                <p>
                  Два города на карте.
                  <br /> Какой из них ближе к тебе?
                </p>
              </div>
              <div className="card-bottom">
                <span>Готовим новую игру</span>
                <span className="coming-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            </article>
          </div>
        </section>
        <section className="hub-about" id="about" aria-labelledby="about-title">
          <div className="hub-about-heading">
            <p className="eyebrow">О PLAYNE</p>
            <h2 id="about-title">Есть пара минут?</h2>
            <p>
              Здесь будут разные простые игры.
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
              <p>Да. «На глаз» уже доступна бесплатно, без регистрации.</p>
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
                Когда появятся новые игры?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Добавим их сюда, когда они будут готовы. Пока можно проверить
                свой глазомер в «На глаз».
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
