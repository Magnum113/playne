import { guides } from "./guides";

export const SITE_URL = "https://playne.ru";
export type PageMeta = {
  path: string;
  title: string;
  description: string;
  kind: "home" | "game" | "guides" | "article";
  name: string;
};
export const pages: PageMeta[] = [
  {
    path: "/",
    title: "Playne — небольшие игры онлайн без регистрации",
    description:
      "Бесплатные браузерные игры на пару минут: сравнивай размеры в «На глаз», рисуй идеальный круг и угадывай смеси цветов. Играй на телефоне и компьютере.",
    kind: "home",
    name: "Playne",
  },
  {
    path: "/naglaz/",
    title: "На глаз — игра в размеры | Playne",
    description:
      "Сравни размеры предметов и проверь свой глазомер. Пять раундов, до 500 очков и наглядный разбор каждого ответа. Играть бесплатно без регистрации.",
    kind: "game",
    name: "На глаз",
  },
  {
    path: "/circle/",
    title: "Круг — нарисуй идеальный круг | Playne",
    description:
      "Нарисуй идеальный круг мышью или пальцем и узнай процент точности. Игра по мотивам Perfect Circle: без скачивания, регистрации и ограничения попыток.",
    kind: "game",
    name: "Круг",
  },
  {
    path: "/colorfle/",
    title: "Оттенок — угадай смесь цветов | Playne",
    description:
      "Игра по мотивам Colorfle на русском. Угадай три цвета в пропорции 50/30/20 за шесть попыток. Подсказки, история смесей и новые оттенки без ожидания.",
    kind: "game",
    name: "Оттенок",
  },
  {
    path: "/guides/",
    title: "Правила и советы для игр Playne",
    description:
      "Как играть в «На глаз», нарисовать идеальный круг и собрать оттенок из трёх цветов. Правила, примеры ходов и объяснение результатов.",
    kind: "guides",
    name: "Правила и советы",
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
