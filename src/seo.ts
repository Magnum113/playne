import { guides } from "./guides";

export const SITE_URL = "https://playne.ru";
export type PageMeta = {
  path: string;
  title: string;
  description: string;
  kind: "home" | "game" | "guides" | "article" | "info";
  noindex?: boolean;
  name: string;
};
export const pages: PageMeta[] = [
  {
    path: "/leaderboard/",
    title: "Рейтинг игроков — лучшие результаты игр | Playne",
    description:
      "Рейтинги На глаз, Круг, Оттенок и Где я. Лучшие результаты недели и за всё время. Играй бесплатно и сохраняй результаты через Яндекс ID.",
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
      "Бесплатные игры в браузере: сравнивай размеры, рисуй круг, подбирай цвет и угадывай места по панорамам. Играй на телефоне и компьютере без регистрации.",
    kind: "home",
    name: "Playne",
  },
  {
    path: "/naglaz/",
    title: "На глаз — сравни размеры и проверь глазомер | Playne",
    description:
      "Сравни размеры предметов и проверь свой глазомер. Пять раундов, до 500 очков и наглядный разбор каждого ответа. Играть бесплатно без регистрации.",
    kind: "game",
    name: "На глаз",
  },
  {
    path: "/circle/",
    title: "Нарисуй идеальный круг — игра «Круг» | Playne",
    description:
      "Нарисуй идеальный круг мышью или пальцем и узнай процент точности. Игра по мотивам Perfect Circle: без скачивания, регистрации и ограничения попыток.",
    kind: "game",
    name: "Круг",
  },
  {
    path: "/colorfle/",
    title: "Угадай цвет на палитре — игра «Оттенок» | Playne",
    description:
      "Бесплатная игра на подбор цвета: смотри на образец, выбирай оттенок на палитре и получай очки за точность. Пять раундов, рекорд в браузере, без регистрации.",
    kind: "game",
    name: "Оттенок",
  },
  {
    path: "/guides/",
    title: "Правила и советы по играм Playne",
    description:
      "Как сравнивать размеры, рисовать круг, подбирать цвет и угадывать страну по панораме. Правила четырёх игр Playne, советы и объяснение очков.",
    kind: "guides",
    name: "Правила и советы",
  },
  {
    path: "/geo/",
    title: "Геогессер бесплатно — «Где я?» без регистрации | Playne",
    description:
      "Бесплатный аналог GeoGuessr на русском. Угадай страну и город по панораме Google Street View: 5 раундов, два режима и рейтинг. Играй онлайн без регистрации.",
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
          ...(page.kind === "article"
            ? [{ name: "Правила и советы", item: SITE_URL + "/guides/" }]
            : []),
          { name: page.name, item: url },
        ];
  const main = {
    "@type":
      page.kind === "article"
        ? "Article"
        : page.kind === "home" || page.kind === "guides"
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
