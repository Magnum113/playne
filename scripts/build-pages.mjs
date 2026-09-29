import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const dist = new URL("../dist/", import.meta.url);
const template = await readFile(new URL("index.html", dist), "utf8");
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
try {
  const { default: Site } = await server.ssrLoadModule("/src/Site.tsx");
  const { pages, SITE_URL, structuredData } =
    await server.ssrLoadModule("/src/seo.ts");
  const notFound = {
    path: "/404.html",
    title: "Страница не найдена | Playne",
    description: "Такой страницы нет. Выбери одну из игр Playne.",
    name: "Страница не найдена",
    kind: "error",
  };
  for (const page of [...pages, notFound]) {
    const error = page.kind === "error";
    const canonical = SITE_URL + page.path;
    const image = SITE_URL + "/art/playne-logo.png?v=2";
    const head = [
      `<meta name="robots" content="${error ? "noindex, follow" : "index, follow, max-image-preview:large"}" />`,
      `<meta property="og:site_name" content="Playne" />`,
      `<meta property="og:locale" content="ru_RU" />`,
      `<meta property="og:type" content="${page.kind === "article" ? "article" : "website"}" />`,
      `<meta property="og:title" content="${escape(page.title)}" />`,
      `<meta property="og:description" content="${escape(page.description)}" />`,
      `<meta property="og:url" content="${canonical}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:width" content="1254" />`,
      `<meta property="og:image:height" content="1254" />`,
      `<meta property="og:image:alt" content="Логотип Playne" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${escape(page.title)}" />`,
      `<meta name="twitter:description" content="${escape(page.description)}" />`,
      `<meta name="twitter:image" content="${image}" />`,
      ...(!error
        ? [
            `<script type="application/ld+json">${JSON.stringify(structuredData(page)).replace(/</g, "\\u003c")}</script>`,
          ]
        : []),
    ].join("\n    ");
    const markup = renderToString(createElement(Site, { path: page.path }));
    if (!template.includes('<div id="root"></div>'))
      throw new Error("Missing root placeholder");
    const html = template
      .replace(
        /<title>.*?<\/title>/s,
        () => `<title>${escape(page.title)}</title>`,
      )
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
        () =>
          `<meta name="description" content="${escape(page.description)}" />`,
      )
      .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, () =>
        error ? "" : `<link rel="canonical" href="${canonical}" />`,
      )
      .replace("</head>", () => `${head}\n  </head>`)
      .replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
    const filename = error ? "404.html" : `${page.path.slice(1)}index.html`;
    await mkdir(new URL(".", new URL(filename, dist)), { recursive: true });
    await writeFile(new URL(filename, dist), html);
  }
  // No fabricated lastmod: optional dates should reflect actual content changes.
  await writeFile(
    new URL("sitemap.xml", dist),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE_URL}${p.path}</loc></url>`).join("\n")}\n</urlset>\n`,
  );
  await writeFile(
    new URL("robots.txt", dist),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  );
} finally {
  await server.close();
}
