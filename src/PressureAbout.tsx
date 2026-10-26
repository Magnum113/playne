import { pressureFaq } from "./pressureContent";

export default function PressureAbout() {
  return (
    <section
      className="pressure-about"
      id="pressure-about"
      aria-labelledby="pressure-about-title"
    >
      <div className="pressure-about-grid">
        <div>
          <p className="eyebrow">ОДНА КНОПКА. КАЖДЫЙ РАЗ НОВОЕ ПРАВИЛО.</p>
          <h2 id="pressure-about-title">
            Бесплатная игра по мотивам Pressing Under Pressure
          </h2>
          <p>
            «Жми» — игра с одной кнопкой по мотивам Pressing Under Pressure.
            Здесь нужно считать, запоминать, ловить момент и внимательно читать
            условие. Уровни продолжаются до первой ошибки, а новая игра приносит
            другие числа, задания и порядок.
          </p>
          <p>
            Можно играть онлайн на телефоне и компьютере. Все задания на
            русском. Первая попытка — без входа, дальше — бесплатно через
            Яндекс. Скачивать приложение не нужно.
          </p>
          <p>
            Если нравятся головоломки в духе The Impossible Quiz и игры «Не
            нажимай кнопку», попробуй продержаться как можно дольше. Быстрая
            реакция помогает, но иногда лучший ход — вообще ничего не делать.
          </p>
        </div>
        <section
          className="pressure-about-rules"
          id="pressure-rules"
          aria-labelledby="pressure-rules-heading"
        >
          <h3 id="pressure-rules-heading">Как играть в «Жми»</h3>
          <ol>
            <li>
              <strong>Прочитай правило.</strong> Не начинай нажимать по
              привычке: следующее задание может просить совсем другое.
            </li>
            <li>
              <strong>Нажимай, удерживай или жди.</strong> Количество нажатий,
              момент отпускания и таймер зависят от условия.
            </li>
            <li>
              <strong>Запоминай подсказки.</strong> Число или фигуры могут
              понадобиться через несколько уровней.
            </li>
            <li>
              <strong>Проверь результат.</strong> За каждый пройденный уровень —
              одно очко. Максимума нет: можно побить свой рекорд и подняться в
              рейтинге.
            </li>
          </ol>
          <a href="/leaderboard/?game=pressure">Рейтинг игроков «Жми» →</a>
        </section>
      </div>
      <section
        className="pressure-faq"
        id="pressure-faq"
        aria-labelledby="pressure-faq-heading"
      >
        <h2 id="pressure-faq-heading">Вопросы об игре</h2>
        {pressureFaq.map(({ question, answer }) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <nav className="pressure-related" aria-label="Ещё игры Playne">
        <h3>Что ещё попробовать</h3>
        <a href="/circle/">Нарисуй идеальный круг ↗</a>
        <a href="/naglaz/">Сравни размеры в «На глаз» ↗</a>
        <a href="/colorfle/">Попади в цвет в «Оттенке» ↗</a>
        <a href="/geo/">Угадай место в «Где я?» ↗</a>
      </nav>
    </section>
  );
}
