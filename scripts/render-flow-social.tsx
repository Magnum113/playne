import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { FlowAnt, FlowScene } from "../src/FlowArt";
import { makeFlowPuzzle } from "../src/flow";
const require = createRequire(import.meta.url);
await initWasm(
  await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
);
const worldData = `data:image/svg+xml;base64,${(await readFile("public/art/flow/meadow-v2.svg")).toString("base64")}`;
const puzzle = makeFlowPuzzle("level", 5);
const scene = renderToStaticMarkup(
  <FlowScene puzzle={puzzle} cells={puzzle.cells} />,
).replace("<svg ", '<svg x="647" y="52" width="505" height="435" ');
const ants = [1, 2, 0]
  .map((color, i) =>
    renderToStaticMarkup(<FlowAnt color={color} size={88} />).replace(
      "<svg ",
      `<svg x="${747 + i * 100}" y="440" `,
    ),
  )
  .join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f0f4f8"/><circle cx="180" cy="105" r="260" fill="#e0f4eb"/><circle cx="1080" cy="540" r="380" fill="#e9e2fb"/><defs><clipPath id="flow-panel"><rect x="624" y="30" width="546" height="570" rx="48"/></clipPath></defs><image x="624" y="30" width="546" height="570" preserveAspectRatio="xMidYMid slice" clip-path="url(#flow-panel)" href="${worldData}"/>${scene}${ants}<g font-family="Noto Sans" fill="#20304d"><text x="64" y="96" font-size="35" font-weight="700" letter-spacing="-2">playne<tspan fill="#7355ba">.</tspan></text><text x="58" y="275" font-size="142" font-weight="700" letter-spacing="-9">Рой<tspan fill="#7355ba">.</tspan></text><text x="66" y="350" font-size="28">Маленькая команда.</text><text x="66" y="391" font-size="28">Большая задача.</text><rect x="64" y="454" width="171" height="44" rx="22" fill="#fff"/><rect x="247" y="454" width="250" height="44" rx="22" fill="#fff"/><text x="87" y="483" font-size="19">36 уровней</text><text x="268" y="483" font-size="19">Испытание каждый день</text><text x="66" y="558" font-size="22" fill="#627086">Запускай муравьёв. Держи поток.</text></g></svg>`;
await writeFile("public/art/flow-social.svg", svg);
const fonts = await Promise.all(
  ["Regular", "Bold"].map((weight) =>
    readFile(`server/assets/NotoSans-${weight}.ttf`),
  ),
);
const png = new Resvg(svg, {
  font: { fontBuffers: fonts, defaultFontFamily: "Noto Sans" },
})
  .render()
  .asPng();
await writeFile("public/art/flow-social.png", png);
console.log("Rendered flow-social.svg and flow-social.png (1200 × 630)");
