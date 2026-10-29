import {
  lineDailyText,
  lineFaq,
  linePracticeText,
  lineRules,
  lineScoreText,
} from "./lineContent";

export default function LineAbout() {
  return (
    <section
      className="pressure-about line-about"
      id="line-about"
      aria-labelledby="line-about-title"
    >
      <div className="pressure-about-grid">
        <div>
          <p className="eyebrow">СОЕДИНИ ЧИСЛА. ЗАПОЛНИ КАЖДУЮ КЛЕТКУ.</p>
          <h2 id="line-about-title">Головоломка «Одной линией» на русском</h2>
          <p>
            Проведи один маршрут от 1 до последнего числа. По пути нужно
            побывать в каждой клетке ровно один раз: короткая дорога между
            числами не всегда ведёт к решению. Стенки и уже пройденные клетки
            помогают понять, куда повернуть дальше.
          </p>
          <p>{lineDailyText}</p>
          <p>{linePracticeText}</p>
          <p>
            Игра похожа по идее на Zip. В Playne свои поля, подсказки и счёт.
            Первая партия доступна без входа, дальше — бесплатно через Яндекс.
            Играй пальцем или мышью прямо в браузере.
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
      <nav className="pressure-related" aria-label="Ещё игры Playne">
        <h3>Что ещё попробовать</h3>
        <a href="/pressure/">Проверь память и реакцию в «Жми» ↗</a>
        <a href="/circle/">Нарисуй идеальный круг ↗</a>
        <a href="/naglaz/">Сравни размеры в «На глаз» ↗</a>
        <a href="/colorfle/">Подбери цвет в «Оттенке» ↗</a>
      </nav>
    </section>
  );
}
