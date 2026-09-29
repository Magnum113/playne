import { guides } from "./guides";
import { PlayneBrand, DestroyWebsiteLink, ThemeToggle } from "./SiteHeader";
import FooterLinks from "./FooterLinks";

export default function GuidePage({
  slug,
  notFound = false,
}: {
  slug?: string;
  notFound?: boolean;
}) {
  const guide = guides.find((g) => g.slug === slug);
  return (
    <div className="app guide-app">
      <a className="skip-link" href="#guide-main">
        Перейти к содержанию
      </a>
      <header className="hub-header">
        <PlayneBrand large />
        <nav aria-label="Навигация">
          <a href="/">Игры</a>
          <a href="/guides/">Правила</a>
          <DestroyWebsiteLink />
          <ThemeToggle />
        </nav>
      </header>
      <main id="guide-main" className="guide-main">
        <nav className="breadcrumbs" aria-label="Хлебные крошки">
          <a href="/">Playne</a>
          <span aria-hidden="true">/</span>
          {guide ? (
            <>
              <a href="/guides/">Правила и советы</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{guide.gameName}</span>
            </>
          ) : (
            <span aria-current="page">
              {notFound ? "Страница не найдена" : "Правила и советы"}
            </span>
          )}
        </nav>
        {notFound ? (
          <section className="guide-hero">
            <p className="eyebrow">404</p>
            <h1>Здесь пока пусто</h1>
            <p>
              Такой страницы нет. Выбери игру на главной или загляни в правила.
            </p>
            <a className="guide-play" href="/">
              Выбрать игру →
            </a>
          </section>
        ) : guide ? (
          <article>
            <div className={`guide-hero guide-${guide.accent}`}>
              <p className="eyebrow">
                ПРАВИЛА И СОВЕТЫ · {guide.gameName.toUpperCase()}
              </p>
              <h1>{guide.title}</h1>
              <p>{guide.intro}</p>
              <a className="guide-play" href={guide.game}>
                Играть в «{guide.gameName}» <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="guide-layout">
              <aside className="guide-toc">
                <nav aria-label="В этой статье">
                  <strong>В этой статье</strong>
                  {guide.sections.map((s) => (
                    <a key={s.id} href={`#${s.id}`}>
                      {s.title}
                    </a>
                  ))}
                </nav>
              </aside>
              <div className="guide-copy">
                {guide.sections.map((s) => (
                  <section key={s.id} id={s.id}>
                    <h2>{s.title}</h2>
                    {s.paragraphs.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                    {s.steps && (
                      <ol>
                        {s.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    )}
                  </section>
                ))}
                <div className="guide-bottom-cta">
                  <h2>Теперь попробуй</h2>
                  <p>Правила проще запоминаются в игре.</p>
                  <a className="guide-play" href={guide.game}>
                    Открыть «{guide.gameName}» →
                  </a>
                </div>
              </div>
            </div>
          </article>
        ) : (
          <>
            <section className="guide-hero">
              <p className="eyebrow">РАЗОБРАТЬСЯ И ПОПРОБОВАТЬ</p>
              <h1>Правила и советы</h1>
              <p>
                Как устроены игры Playne, что означают результаты и что
                попробовать в следующей попытке.
              </p>
            </section>
            <div className="guide-cards">
              {guides.map((g, i) => (
                <a
                  className={`guide-card guide-${g.accent}`}
                  href={`/guides/${g.slug}/`}
                  key={g.slug}
                >
                  <span className="guide-number" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <span className="eyebrow">{g.gameName}</span>
                  <h2>{g.title}</h2>
                  <p>{g.description}</p>
                  <span className="guide-card-link">
                    Читать <span aria-hidden="true">↗</span>
                  </span>
                </a>
              ))}
            </div>
          </>
        )}
      </main>
      <footer className="guide-footer">
        <PlayneBrand />
        <a href="/">Все игры Playne ↗</a>
        <FooterLinks />
      </footer>
    </div>
  );
}
