import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import PerceptionPreview from "../src/PerceptionPreview";

const require = createRequire(import.meta.url);
await initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
const colors: Record<string, string> = {
  "--mint-tint": "#e0f4ec", "--mint": "#117e6d",
  "--purple-tint": "#eee6fb", "--purple": "#7d54b9",
  "--orange-tint": "#f8e8d6", "--orange": "#b76a27", "--panel": "#fffefa",
};
const illustration = renderToStaticMarkup(<PerceptionPreview />)
  .replace("<svg ", '<svg x="594" y="116" width="564" height="270" ')
  .replace(/var\((--[a-z-]+)\)/g, (_, token: string) => colors[token] ?? "#262b2c");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f7f7f2"/>
<rect x="28" y="28" width="1144" height="574" rx="44" fill="#fffefa" stroke="#dfe1d9" stroke-width="2"/>
${illustration}
<g font-family="Noto Sans" fill="#262b2c">
<text x="76" y="104" font-size="35" font-weight="700">playne<tspan fill="#7d54b9">.</tspan></text>
<text x="72" y="258" font-size="96" font-weight="700" letter-spacing="-5">Приметь<tspan fill="#7d54b9">.</tspan></text>
<text x="78" y="320" font-size="27">Глазомер. Ритм. Точность.</text>
<text x="78" y="365" font-size="25" fill="#697579">Пять заданий каждый день.</text>
<rect x="76" y="444" width="330" height="65" rx="20" fill="#bda6f8"/>
<text x="106" y="486" font-size="24" font-weight="700" fill="#2b2338">Играть бесплатно</text>
<text x="629" y="453" font-size="24" fill="#697579">В духе Perceptle. На русском.</text>
<text x="78" y="557" font-size="21" fill="#697579">playne.ru/perception</text>
</g></svg>`;
await writeFile("public/art/perception-social.svg", svg);
const fonts = await Promise.all(["Regular", "Bold"].map(weight => readFile(`server/assets/NotoSans-${weight}.ttf`)));
const png = new Resvg(svg, { font: { fontBuffers: fonts, defaultFontFamily: "Noto Sans" } }).render().asPng();
await writeFile("public/art/perception-social.png", png);
console.log("Rendered original perception-social.svg and PNG (1200 × 630)");
