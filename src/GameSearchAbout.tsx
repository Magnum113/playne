import GameAbout from "./GameAbout";
import { naglazFaq, colorFaq, perceptionFaq } from "./gameSeoContent";
import "./game-search-about.css";

const content = {
  perception: {
    title: "Perceptle на русском: пять заданий на восприятие",
    intro: "«Приметь» — бесплатная игра Playne в духе Perceptle. Посчитай точки на глаз, продолжи траекторию, оцени угол, повтори ритм и найди нужную долю отрезка. Каждый день — новые условия, пять заданий и отдельный рейтинг.",
    guide: "/leaderboard/?game=perception&mode=daily", guideLabel: "Рейтинг дня «Приметь»", faq: perceptionFaq,
  },
  naglaz: {
    title: "Size It Up на русском: сравни размеры в «На глаз»",
    intro: "«На глаз» — бесплатная игра на глазомер в духе Size It Up. Сравнивай реальные размеры животных, зданий и предметов: один силуэт служит ориентиром, а размер второго нужно подобрать самому.",
    guide: "/guides/naglaz/", guideLabel: "Правила и советы по сравнению размеров", faq: naglazFaq,
  },
  colorfle: {
    title: "Угадай цвет по образцу на палитре",
    intro: "«Оттенок» — бесплатная игра на цветовосприятие: найди такой же цвет, как у образца. Выбирай тон, насыщенность и яркость, сравнивай оттенки и улучшай точность. Пять раундов, 150 цветов и два режима: без таймера или по 30 секунд на цвет.",
    guide: "/guides/colorfle/", guideLabel: "Как подбирать оттенки и понимать оценку", faq: colorFaq,
  },
} as const;

export default function GameSearchAbout({ game }: { game: keyof typeof content }) {
  const item = content[game];
  return (
    <GameAbout>
      <section className="game-search-about" id={`${game}-about`} aria-labelledby={`${game}-about-title`}>
        <h2 id={`${game}-about-title`}>{item.title}</h2>
        <p>{item.intro}</p>
        <a href={item.guide}>{item.guideLabel} →</a>
        <section id={`${game}-faq`} aria-labelledby={`${game}-faq-title`}>
          <h3 id={`${game}-faq-title`}>Вопросы об игре</h3>
          {item.faq.map(({ question, answer }) => (
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
