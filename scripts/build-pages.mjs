import { mkdir, readFile, writeFile } from "node:fs/promises";

// Two real static pages share the app bundle. Unknown URLs remain 404s.
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
    "Игры на глазомер, память и интуицию. Бесплатно, без скачивания и регистрации.",
    "Подбери размер предмета рядом с другим. Пять раундов, 22 сравнения и твой глазомер.",
  )
  .replace('href="https://playne.ru/"', 'href="https://playne.ru/naglaz/"');
await mkdir(new URL("../dist/naglaz/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/naglaz/index.html", import.meta.url), game);
