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
export const pages: PageMeta[] = [
  {
    path: "/brain/",
    title: "Разминка для ума — игры на память, внимание и логику | Playne",
    description:
      "Четыре бесплатные игры: запоминай клетки во «Вспышке», сравнивай фигуры в «Повороте», двигай блоки и управляй поездами. Задания дня, практика и личный прогресс.",
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
    title: `${game.name} — ${game.id === "flash" ? "игра на зрительную память" : game.id === "rotate" ? "мысленно поворачивай фигуры" : game.id === "slide" ? "освободи выход для блока" : "направляй поезда на станции"} | Playne`,
    description: `${game.description} Задача дня для всех и практика с выбором сложности. Бесплатно в браузере.`,
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
    title: "Жми — бесплатный аналог Press Under Pressure на русском | Playne",
    description:
      "Играй в «Жми» — бесплатный аналог Pressing Under Pressure на русском. Бесконечные уровни на память и реакцию, до первой ошибки. Первая попытка без входа, дальше — бесплатно через Яндекс.",
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
    title: "Одной линией — соедини числа, заполни поле | Playne",
    description:
      "Соедини числа по порядку и пройди каждую клетку один раз. Бесплатная головоломка в духе Zip на русском: 5 полей дня, подсказки и до 500 очков. Первая партия без входа.",
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
    title: "На глаз — сравни размеры и проверь глазомер | Playne",
    description:
      "Сравни размеры предметов и проверь свой глазомер. Пять раундов, до 500 очков и наглядный разбор каждого ответа. Первая партия без входа. Дальше играй бесплатно через Яндекс.",
    kind: "game",
    name: "На глаз",
  },
  {
    path: "/circle/",
    title: "Нарисуй идеальный круг — игра «Круг» | Playne",
    description:
      "Нарисуй идеальный круг мышью или пальцем и узнай процент точности. Игра по мотивам Perfect Circle: бесплатно в браузере. Первая попытка без входа, дальше — через Яндекс.",
    kind: "game",
    name: "Круг",
  },
  {
    path: "/colorfle/",
    title: "Угадай цвет на палитре — игра «Оттенок» | Playne",
    description:
      "Бесплатная игра на подбор цвета: смотри на образец, выбирай оттенок на палитре и получай очки за точность. 150 оттенков, пять раундов. Играй без таймера или с лимитом 30 секунд на цвет. Первая партия без входа, дальше — бесплатно через Яндекс.",
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
  const faq =
    brainGame?.faq ??
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
              ...(page.path === "/pressure/" ||
              page.path === "/one-line/" ||
              !!brainGame
                ? {
                    image: SITE_URL + page.image!.path,
                    genre: brainGame
                      ? ["Головоломка", brainGame.skill]
                      : page.path === "/one-line/"
                        ? ["Головоломка", "Логика"]
                        : ["Головоломка", "Логика", "Память", "Реакция"],
                    operatingSystem: "Any",
                    browserRequirements: "Requires JavaScript",
                    offers: {
                      "@type": "Offer",
                      price: "0",
                      priceCurrency: "RUB",
                      url,
                    },
                    publisher: {
                      "@type": "Organization",
                      name: "Playne",
                      url: SITE_URL + "/",
                    },
                  }
                : {}),
            },
          ]
        : []),
      ...(faq
        ? [
            {
              "@type": "FAQPage",
              "@id":
                url +
                (brainGame
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
