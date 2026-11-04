import { naglazFaq, colorFaq } from "./gameSeoContent";
import { guides } from "./guides";
import { pressureFaq } from "./pressureContent";
import { lineFaq } from "./lineContent";
import { brainGames } from "./brainContent";

export const SITE_URL = "https://playne.ru";
export type PageMeta = {
  path: string;
  title: string;
  description: string;
  kind: "home" | "game" | "guides" | "article" | "info" | "collection";
  noindex?: boolean;
  name: string;
  image?: { path: string; width: number; height: number; alt: string };
};
const brainSearch = {
  flash: { title: "Visual Memory на русском — «Вспышка» бесплатно | Playne", description: "«Вспышка» — бесплатная игра в духе Visual Memory из Human Benchmark на русском. Запоминай клетки и повторяй узор. 5 раундов, задача дня и практика." },
  rotate: { title: "Мысленное вращение фигур — игра «Поворот» онлайн | Playne", description: "Мысленно поверни фигуры и найди зеркальное отражение. Бесплатная игра на пространственное мышление: 5 раундов, задача дня и практика на русском." },
  slide: { title: "Rush Hour на русском — аналог «Передвинь» бесплатно | Playne", description: "«Передвинь» — бесплатный аналог Rush Hour на русском. Двигай машины и освободи выход из пробки. 5 задач, подсказки и практика. Первая партия без входа." },
  dispatch: { title: "Train of Thought на русском — игра «Диспетчер» | Playne", description: "«Диспетчер» — игра с поездами в духе Train of Thought на русском. Переключай стрелки и направляй поезда на станции. 5 волн, задача дня и практика. Бесплатно." },
} as const;
export const pages: PageMeta[] = [
  {
    path: "/swarm/",
    title: "Рой — игра с цветными муравьями и кубиками бесплатно | Playne",
    description: "Бесплатная головоломка с цветными муравьями: собирай пиксельные картины из кубиков и освобождай доки. 36 уровней и испытание дня. Играй онлайн на русском.",
    kind: "game",
    name: "Рой",
    image: { path: "/art/flow-social.png", width: 1200, height: 630, alt: "Рой — цветные муравьи, 36 уровней и испытание дня в Playne" },
  },

  {
    path: "/brain/",
    title: "Разминка для ума — игры на память, внимание и логику | Playne",
    description:
      "Четыре бесплатные игры: запоминай клетки, сравнивай фигуры после поворота, освобождай выход для машины и направляй поезда на станции. Задача дня и практика.",
    kind: "collection",
    name: "Разминка для ума",
    image: {
      path: "/art/brain-social.png",
      width: 1200,
      height: 630,
      alt: "Разминка для ума — четыре игры Playne",
    },
  },
  ...brainGames.map((game) => ({
    path: game.path,
    title: brainSearch[game.id].title,
    description: brainSearch[game.id].description,
    kind: "game" as const,
    name: game.name,
    image: {
      path: `/art/brain-${game.id}-social.png`,
      width: 1200,
      height: 630,
      alt: `${game.name} — ${game.skill}, игра Playne`,
    },
  })),
  {
    path: "/design-system/",
    title: "Дизайн-система Playne — компоненты, цвета и игровые интерфейсы",
    description:
      "Все компоненты Playne: цвета светлой и тёмной тем, типографика, кнопки, поля, игровые элементы, результаты и состояния интерфейса. Рабочие примеры на одной странице.",
    kind: "info",
    name: "Дизайн-система",
    noindex: true,
  },
  {
    path: "/pressure/",
    title: "Pressing Under Pressure на русском — играть в «Жми» | Playne",
    description:
      "«Жми» — самостоятельная игра по мотивам Pressing Under Pressure на русском. Играй бесплатно в браузере до первой ошибки. Первая попытка без входа, дальше — через Яндекс.",
    kind: "game",
    name: "Жми",
    image: {
      path: "/art/pressure-social.png",
      width: 1200,
      height: 630,
      alt: "Жми — бесплатная бесконечная игра с кнопкой на русском",
    },
  },
  {
    path: "/one-line/",
    title: "Zip на русском — «Одной линией», играть бесплатно | Playne",
    description:
      "Соедини числа по порядку и пройди каждую клетку один раз. Бесплатная головоломка в духе LinkedIn Zip на русском: 5 полей дня, подсказки и до 500 очков. Первая партия без входа.",
    kind: "game",
    name: "Одной линией",
    image: {
      path: "/art/line-social.png",
      width: 1200,
      height: 630,
      alt: "Одной линией — маршрут через пронумерованные клетки игрового поля",
    },
  },
  {
    path: "/leaderboard/",
    title: "Общий рейтинг игроков и рекорды по играм | Playne",
    description:
      "Общий рейтинг Playne за всё время и рекорды На глаз, Круг, Оттенок, Где я, Жми и Одной линией. Улучшай результаты во всех играх и поднимайся в топ.",
    kind: "guides",
    name: "Рейтинг",
  },
  {
    path: "/account/",
    title: "Личный кабинет | Playne",
    description:
      "Вход через Яндекс ID, изменение ника и сохранённые результаты игр Playne.",
    kind: "info",
    name: "Личный кабинет",
    noindex: true,
  },
  {
    path: "/privacy/",
    title: "Конфиденциальность и данные аккаунта | Playne",
    description:
      "Какие данные сохраняет Playne при входе через Яндекс ID и публикации результатов, как работают cookies и как управлять своим профилем.",
    kind: "info",
    name: "Конфиденциальность",
  },
  {
    path: "/terms/",
    title: "Правила игр и общего рейтинга | Playne",
    description:
      "Правила публикации результатов и участия в рейтингах Playne. Гостевые игры, проверка очков, ник и сохранение результатов.",
    kind: "info",
    name: "Правила сайта",
  },
  {
    path: "/",
    title: "Playne — игры онлайн для любопытных",
    description:
      "Бесплатные игры в браузере: глазомер, реакция, география, логика и отдельная разминка для ума — память, фигуры, блоки и поезда. Первая партия каждой игры без входа.",
    kind: "home",
    name: "Playne",
  },
  {
    path: "/naglaz/",
    title: "Size It Up на русском — играть бесплатно в «На глаз» | Playne",
    description:
      "«На глаз» — бесплатная игра в духе Size It Up на русском. Сравни размеры животных, зданий и предметов: 5 раундов, до 500 очков. Первая партия без входа, дальше — через Яндекс.",
    kind: "game",
    name: "На глаз",
  },
  {
    path: "/circle/",
    title: "Perfect Circle на русском — игра «Круг» бесплатно | Playne",
    description:
      "Нарисуй идеальный круг мышью или пальцем и узнай процент точности. Игра по мотивам Perfect Circle: бесплатно в браузере. Первая попытка без входа, дальше — через Яндекс.",
    kind: "game",
    name: "Круг",
  },
  {
    path: "/colorfle/",
    title: "Угадай цвет по образцу — игра «Оттенок» бесплатно | Playne",
    description:
      "Игра на цветовосприятие: угадай цвет по образцу и подбери оттенок на палитре. 150 цветов, 5 раундов, без таймера или по 30 секунд на цвет. Бесплатно на русском, первая партия без входа.",
    kind: "game",
    name: "Оттенок",
  },
  {
    path: "/guides/",
    title: "Правила и советы по играм Playne",
    description:
      "Правила и советы по играм Playne: глазомер, круг, цвет, география, одна линия и разминка для ума. Как играть, усложнять задачи и понимать очки.",
    kind: "guides",
    name: "Правила и советы",
  },
  {
    path: "/geo/",
    title: "Геогессер бесплатно — игра «Где я?» на русском | Playne",
    description:
      "Бесплатный аналог GeoGuessr на русском. Угадай страну и город по панораме Google Street View: 5 раундов, перемещение, достопримечательности и отдельные рейтинги. Первая партия без входа, дальше — бесплатно через Яндекс.",
    kind: "game",
    name: "Где я?",
  },
  ...guides.map((g) => ({
    path: `/guides/${g.slug}/`,
    title: `${g.title} | Playne`,
    description: g.description,
    kind: "article" as const,
    name: g.title,
  })),
];

export function structuredData(page: PageMeta) {
  const url = SITE_URL + page.path;
  const brainGame = brainGames.find((game) => game.path === page.path);
  const searchFaq = page.path === "/naglaz/" ? naglazFaq : page.path === "/colorfle/" ? colorFaq : null;
  const faq =
    searchFaq ?? brainGame?.faq ??
    (page.path === "/one-line/"
      ? lineFaq
      : page.path === "/pressure/"
        ? pressureFaq
        : null);
  const website = {
    "@type": "WebSite",
    "@id": SITE_URL + "/#website",
    url: SITE_URL + "/",
    name: "Playne",
    inLanguage: "ru",
  };
  const crumbs =
    page.kind === "home"
      ? []
      : [
          { name: "Playne", item: SITE_URL + "/" },
          ...(brainGame
            ? [{ name: "Разминка для ума", item: SITE_URL + "/brain/" }]
            : []),
          ...(page.kind === "article"
            ? [{ name: "Правила и советы", item: SITE_URL + "/guides/" }]
            : []),
          { name: page.name, item: url },
        ];
  const main = {
    "@type":
      page.kind === "article"
        ? "Article"
        : page.kind === "home" ||
            page.kind === "guides" ||
            page.kind === "collection"
          ? "CollectionPage"
          : "WebPage",
    "@id": url + "#page",
    url,
    name: page.name,
    headline: page.name,
    description: page.description,
    inLanguage: "ru",
    isPartOf: { "@id": website["@id"] },
    ...(page.kind === "article" ? { mainEntityOfPage: url } : {}),
    ...(page.kind === "game" ? { mainEntity: { "@id": url + "#game" } } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      website,
      main,
      ...(page.kind === "game"
        ? [
            {
              "@type": "VideoGame",
              "@id": url + "#game",
              name: page.name,
              url,
              description: page.description,
              inLanguage: "ru",
              gamePlatform: "Web browser",
              playMode: "https://schema.org/SinglePlayer",
              isAccessibleForFree: true,
              mainEntityOfPage: { "@id": main["@id"] },
              ...(page.image ? { image: SITE_URL + page.image.path } : {}),
              genre: brainGame
                ? ["Головоломка", brainGame.skill]
                : page.path === "/geo/" ? ["География", "Угадывание мест"]
                : page.path === "/naglaz/" ? ["Глазомер", "Сравнение размеров"]
                : page.path === "/circle/" ? ["Рисование", "Точность"]
                : page.path === "/colorfle/" ? ["Цвет", "Глазомер"]
                : page.path === "/pressure/" ? ["Головоломка", "Логика", "Память", "Реакция"]
                : ["Головоломка", "Логика"],
              operatingSystem: "Any",
              browserRequirements: "Requires JavaScript",
              offers: { "@type": "Offer", price: "0", priceCurrency: "RUB", url },
              publisher: { "@type": "Organization", name: "Playne", url: SITE_URL + "/" },
            },
          ]
        : []),
      ...(faq
        ? [
            {
              "@type": "FAQPage",
              "@id":
                url +
                (searchFaq ? `#${page.path === "/naglaz/" ? "naglaz" : "colorfle"}-faq` : brainGame
                  ? `#${brainGame.id}-faq`
                  : page.path === "/one-line/"
                    ? "#line-faq"
                    : "#pressure-faq"),
              isPartOf: { "@id": main["@id"] },
              inLanguage: "ru",
              mainEntity: faq.map(({ question, answer }) => ({
                "@type": "Question",
                name: question,
                acceptedAnswer: { "@type": "Answer", text: answer },
              })),
            },
          ]
        : []),
      ...(crumbs.length
        ? [
            {
              "@type": "BreadcrumbList",
              itemListElement: crumbs.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                ...c,
              })),
            },
          ]
        : []),
    ],
  };
}
