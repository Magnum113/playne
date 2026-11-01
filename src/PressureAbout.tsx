import { pressureFaq } from "./pressureContent";
import GameAbout from "./GameAbout";

export default function PressureAbout() {
  return (
    <GameAbout>
      <section
        className="pressure-about"
        id="pressure-about"
        aria-labelledby="pressure-about-title"
      >
        <div className="pressure-about-grid">
          <div>
            <h2 id="pressure-about-title">
              Бесплатная игра по мотивам Pressing Under Pressure
            </h2>
            <p>
              «Жми» — игра с одной кнопкой по мотивам Pressing Under Pressure.
              Задания на русском, числа и порядок меняются в каждой попытке.
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
      </section>
    </GameAbout>
  );
}
