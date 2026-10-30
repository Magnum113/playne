import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  challengePath,
  challengeScore,
  type PublicChallenge,
} from "../src/challenges";

// The production build embeds these bytes. Source-mode tests load the same files.
declare const __PLAYNE_PREVIEW_WASM_B64__: string | undefined;
declare const __PLAYNE_PREVIEW_FONT_B64__: string | undefined;
declare const __PLAYNE_PREVIEW_BOLD_B64__: string | undefined;
const xml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (letter) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[letter]!,
  );
const scoreText = (score: number) => String(score).replace(".", ",");
const dateText = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${day}T12:00:00Z`));
const prompt = (data: PublicChallenge) =>
  data.maxScore > 0 && data.score >= data.maxScore
    ? "Сможешь повторить?"
    : "Побьёшь мой результат?";

export function challengeSvg(data: PublicChallenge) {
  const nickname = [...data.nickname];
  const displayName =
    nickname.length > 32 ? `${nickname.slice(0, 31).join("")}…` : data.nickname;
  const main =
    data.game === "circle"
      ? scoreText(data.score) + "%"
      : scoreText(data.score);
  const detail =
    data.game === "pressure"
      ? "очков"
      : data.game === "circle"
        ? "точность круга"
        : `из ${data.maxScore} очков`;
  const motif =
    data.game === "circle"
      ? '<circle cx="963" cy="288" r="102" fill="none" stroke="#137866" stroke-width="18" stroke-dasharray="570 75" transform="rotate(-45 963 288)"/>'
      : data.game === "colorfle"
        ? '<circle cx="910" cy="250" r="76" fill="#bea5f7"/><circle cx="1002" cy="324" r="76" fill="#72d6bd"/>'
        : data.game === "geo"
          ? '<path d="M960 172c-57 0-94 41-94 90 0 70 94 151 94 151s94-81 94-151c0-49-37-90-94-90Z" fill="#137866"/><circle cx="960" cy="264" r="30" fill="#e1f3ec"/>'
          : '<g transform="translate(846 184) rotate(-8 120 110)"><rect width="108" height="108" rx="26" fill="#137866"/><rect x="126" width="108" height="108" rx="26" fill="#bea5f7"/><rect y="126" width="108" height="108" rx="26" fill="#72d6bd"/><path d="M150 206l35-35m-35 0h35v35" fill="none" stroke="#137866" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#f7f7f2"/>
    <circle cx="1020" cy="256" r="278" fill="#e1f3ec"/>
    <g font-family="Noto Sans" fill="#252a2d">
      <text x="68" y="85" font-size="34" font-weight="700">playne<tspan fill="#137866">.</tspan></text>
      <text x="68" y="172" font-size="45" font-weight="700">${xml(data.gameName)}</text>
      <text x="58" y="354" font-size="${main.length > 6 ? 126 : 164}" font-weight="700" letter-spacing="-6">${xml(main)}</text>
      <text x="70" y="405" font-size="29" fill="#5f6b6e">${xml(detail)}</text>
      <text x="70" y="463" font-size="27" fill="#5f6b6e">${xml(displayName)}</text>
      ${motif}
      <rect x="0" y="508" width="1200" height="122" fill="#bea5f7"/>
      <text x="68" y="584" font-size="44" font-weight="700">${prompt(data)}</text>
      <path d="M1060 569h65m-25-25 25 25-25 25" stroke="#252a2d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
  </svg>`;
}

let renderer: Promise<typeof import("@resvg/resvg-wasm")> | undefined;
let fonts: Uint8Array[];
async function initializedRenderer() {
  if (!renderer)
    renderer = (async () => {
      const module = await import("@resvg/resvg-wasm");
      const require = createRequire(`${process.cwd()}/package.json`);
      const wasm =
        typeof __PLAYNE_PREVIEW_WASM_B64__ === "undefined"
          ? readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))
          : Buffer.from(__PLAYNE_PREVIEW_WASM_B64__, "base64");
      const regular =
        typeof __PLAYNE_PREVIEW_FONT_B64__ === "undefined"
          ? readFileSync(`${process.cwd()}/server/assets/NotoSans-Regular.ttf`)
          : Buffer.from(__PLAYNE_PREVIEW_FONT_B64__, "base64");
      const bold =
        typeof __PLAYNE_PREVIEW_BOLD_B64__ === "undefined"
          ? readFileSync(`${process.cwd()}/server/assets/NotoSans-Bold.ttf`)
          : Buffer.from(__PLAYNE_PREVIEW_BOLD_B64__, "base64");
      fonts = [regular, bold];
      await module.initWasm(wasm);
      return module;
    })();
  return renderer;
}

const cache = new Map<string, Buffer>();
export async function renderChallengePng(
  data: PublicChallenge,
): Promise<Buffer> {
  const key = JSON.stringify([
    data.token,
    data.game,
    data.nickname,
    data.day,
    data.score,
    "v2",
  ]);
  const cached = cache.get(key);
  if (cached) return cached;
  const { Resvg } = await initializedRenderer();
  const svg = new Resvg(challengeSvg(data), {
    font: { fontBuffers: fonts, defaultFontFamily: "Noto Sans" },
  });
  let rendered: ReturnType<typeof svg.render> | undefined;
  try {
    rendered = svg.render();
    const png = Buffer.from(rendered.asPng());
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, png);
    return png;
  } finally {
    rendered?.free();
    svg.free();
  }
}

export function challengeHtml(data: PublicChallenge) {
  const title = `${data.nickname}: ${challengeScore(data)} · ${data.gameName}`;
  const description = `${prompt(data)} ${data.gameName}, ${dateText(data.day).replace(/\.$/, "")}. Прими вызов и сравни результат на Playne.`;
  const status = data.isTodayDaily
    ? "Сегодняшняя задача дня. В зачёт идёт твоя первая попытка."
    : "Те же условия в отдельном вызове. Результат не меняет рейтинг.";
  const playUrl =
    challengePath(data.game) + `?challenge=${encodeURIComponent(data.token)}`;
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${xml(title)} · Playne</title><meta name="description" content="${xml(description)}">
    <meta name="robots" content="noindex,nofollow,noarchive"><link rel="canonical" href="${xml(data.url)}">
    <meta property="og:type" content="website"><meta property="og:site_name" content="Playne"><meta property="og:title" content="${xml(title)}">
    <meta property="og:description" content="${xml(description)}"><meta property="og:url" content="${xml(data.url)}"><meta property="og:image" content="${xml(data.imageUrl)}">
    <meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${xml(data.imageUrl)}">
    <style>body{margin:0;background:#f7f7f2;color:#252a2d;font-family:Inter,system-ui,sans-serif}main{max-width:700px;margin:8vh auto;padding:32px}a{color:#137866}header{font-size:32px;font-weight:750}header a{text-decoration:none;color:inherit}.dot{color:#137866}article{background:#fffefa;border:1px solid #dedfd8;border-radius:24px;padding:clamp(24px,6vw,48px);margin-top:32px}.eyebrow{color:#5f6b6e}h1{font-size:clamp(30px,6vw,52px);line-height:1.12}.score{font-size:clamp(64px,13vw,104px);font-weight:750;line-height:1.15;margin:24px 0}.score span{font-size:28px;color:#5f6b6e}.cta{display:inline-block;border-radius:12px;background:#bea5f7;color:#17131e;text-decoration:none;padding:16px 22px;font-weight:700}.cta:focus-visible,a:focus-visible{outline:3px solid #137866;outline-offset:4px}p{line-height:1.6}footer{font-size:14px;color:#5f6b6e;margin-top:28px}@media(max-width:500px){main{margin:3vh auto;padding:20px}}</style>
  </head><body><main><header><a href="/">playne<span class="dot">.</span></a></header><article>
    <p class="eyebrow">${xml(data.gameName)} · ${xml(dateText(data.day))}</p><h1>${prompt(data)}</h1>
    <p>${xml(data.nickname)}</p><p class="score">${xml(challengeScore(data))}</p><p>${xml(status)}</p>
    <a class="cta" href="${xml(playUrl)}">Принять вызов →</a><footer>Сыграй и сравни результат с другом</footer>
    </article></main></body></html>`;
}
