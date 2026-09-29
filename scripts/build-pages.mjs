import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

// Separate real static pages share the app bundle. Unknown URLs remain 404s.
const home = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const game = home
  .replace(
    "Playne — небольшие игры в браузере",
    "На глаз — игра в размеры | Playne",
  )
  .replace(
    "Игры на глазомер и точность. Бесплатно, без скачивания и регистрации.",
    "Подбери размер предмета рядом с другим. Пять раундов, 22 сравнения и твой глазомер.",
  )
  .replace('href="https://playne.ru/"', 'href="https://playne.ru/naglaz/"');

// Publish actual homepage content for readers that cannot run the app (including
// Sprite Fusion's static fallback). Render the same component, without a second
// copy of its markup. The client replaces it and restores browser preferences.
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
try {
  const { default: Hub } = await server.ssrLoadModule("/src/Hub.tsx");
  const markup = renderToString(createElement(Hub));
  if (!home.includes('<div id="root"></div>')) {
    throw new Error("Homepage root placeholder was not found");
  }
  await writeFile(
    new URL("../dist/index.html", import.meta.url),
    home.replace(
      '<div id="root"></div>',
      () => `<div id="root">${markup}</div>`,
    ),
  );
} finally {
  await server.close();
}
await mkdir(new URL("../dist/naglaz/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/naglaz/index.html", import.meta.url), game);

const circle = home
  .replace(
    "Playne — небольшие игры в браузере",
    "Круг — нарисуй идеальный круг | Playne",
  )
  .replace(
    "Игры на глазомер и точность. Бесплатно, без скачивания и регистрации.",
    "Нарисуй круг одним движением и узнай свою точность. Бесплатная игра без регистрации на Playne.",
  )
  .replace('href="https://playne.ru/"', 'href="https://playne.ru/circle/"');
await mkdir(new URL("../dist/circle/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/circle/index.html", import.meta.url), circle);
