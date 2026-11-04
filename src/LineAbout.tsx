import {
  lineFaq,
  lineRules,
  lineScoreText,
} from "./lineContent";
import GameAbout from "./GameAbout";

export default function LineAbout() {
  return (
    <GameAbout>
      <section
        className="pressure-about line-about"
        id="line-about"
        aria-labelledby="line-about-title"
      >
        <div className="pressure-about-grid">
          <div>
            <h2 id="line-about-title">Головоломка «Одной линией» на русском</h2>
            <p>
              «Одной линией» — бесплатная головоломка в духе LinkedIn Zip на русском.
              Соедини числа по порядку и заполни всё поле одним маршрутом.
            </p>
          </div>
          <section
            className="pressure-about-rules"
            id="line-rules"
            aria-labelledby="line-rules-heading"
          >
            <h3 id="line-rules-heading">Как играть в «Одной линией»</h3>
            <ol>
              {lineRules.map(({ title, text }) => (
                <li key={title}>
                  <strong>{title}</strong> {text}
                </li>
              ))}
            </ol>
            <p>{lineScoreText}</p>
            <a href="/guides/one-line/">Правила и советы по поиску маршрута →</a>
            <p>
              <a href="/leaderboard/?game=line">
                Рейтинг игроков «Одной линией» →
              </a>
            </p>
          </section>
        </div>
        <section
          className="pressure-faq"
          id="line-faq"
          aria-labelledby="line-faq-heading"
        >
          <h2 id="line-faq-heading">Вопросы об игре</h2>
          {lineFaq.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
      </section>
    </GameAbout>
  );
}
