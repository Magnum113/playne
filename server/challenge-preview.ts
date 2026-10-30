import { challengeArt, previewBrand } from "./challenge-art";
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

export const CHALLENGE_PREVIEW_VERSION = "field-b-v3";

export function challengeSvg(data: PublicChallenge) {
  const circle = data.game === "circle";
  const main = scoreText(data.score) + (circle ? "%" : "");
  const detail =
    data.game === "pressure" ? "очков" : `из ${data.maxScore} очков`;
  const maximum = data.maxScore > 0 && data.score >= data.maxScore;
  const fontSize = main.length > 7 ? 148 : main.length > 6 ? 168 : 188;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <pattern id="dots" x="0" y="3" width="33.4" height="33.4" patternUnits="userSpaceOnUse"><circle cx="16.7" cy="16.7" r="1.65" fill="#c7e7dd"/></pattern>
      <pattern id="field-grid" x="90" y="168" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#e8e9e2" stroke-width="1"/></pattern>
      <clipPath id="field-clip"><rect x="90" y="168" width="1020" height="342" rx="20"/></clipPath>
    </defs>
    <rect width="1200" height="630" fill="#f7f7f2"/>
    <rect width="1200" height="630" fill="url(#dots)" opacity=".8"/>
    <rect x="156" y="152" width="974" height="340" rx="18" fill="#eee6fb"/>
    <rect x="90" y="168" width="1020" height="342" rx="20" fill="#fffefa"/>
    <rect x="90" y="168" width="1020" height="342" fill="url(#field-grid)" clip-path="url(#field-clip)"/>
    <rect x="90" y="168" width="1020" height="342" rx="20" fill="none" stroke="#dedfd8" stroke-width="1.25"/>
    ${previewBrand}
    <g font-family="Noto Sans" fill="#252a2d">
      <text x="142" y="68" font-size="38" font-weight="700" letter-spacing="-1.8">playne<tspan fill="#7953b4">.</tspan></text>
      <text x="90" y="143" font-size="40" font-weight="700" letter-spacing="-1.3">${xml(data.gameName)}</text>
      <text x="148" y="${circle ? 402 : 384}" font-size="${fontSize}" font-weight="700" letter-spacing="-7">${xml(main)}</text>
      ${circle ? "" : `<text x="155" y="434" font-size="28" fill="#5f6b6e">${xml(detail)}</text>`}
      ${challengeArt(data.game)}
      <text x="90" y="572" font-size="40" font-weight="700" letter-spacing="-.7" fill="#137866">${prompt(data)}</text>
      <rect x="${maximum ? 548 : 635}" y="530" width="57" height="57" rx="16" fill="#eee6fb"/>
      <path d="M${maximum ? 567 : 654} 558h21m-9-9 9 9-9 9" stroke="#7953b4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
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
    CHALLENGE_PREVIEW_VERSION,
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
  const imageAlt = `${data.gameName}: ${challengeScore(data)}. ${prompt(data)}`;
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
    <meta property="og:image:alt" content="${xml(imageAlt)}"><meta name="twitter:image:alt" content="${xml(imageAlt)}">
    <meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${xml(data.imageUrl)}">
    <style>body{margin:0;background:#f7f7f2;color:#252a2d;font-family:Inter,system-ui,sans-serif}main{max-width:700px;margin:8vh auto;padding:32px}a{color:#137866}header{font-size:32px;font-weight:750}header a{text-decoration:none;color:inherit}.dot{color:#137866}article{background:#fffefa;border:1px solid #dedfd8;border-radius:24px;padding:clamp(24px,6vw,48px);margin-top:32px}.eyebrow{color:#5f6b6e}h1{font-size:clamp(30px,6vw,52px);line-height:1.12}.score{font-size:clamp(64px,13vw,104px);font-weight:750;line-height:1.15;margin:24px 0}.score span{font-size:28px;color:#5f6b6e}.cta{display:inline-block;border-radius:12px;background:#bea5f7;color:#17131e;text-decoration:none;padding:16px 22px;font-weight:700}.cta:focus-visible,a:focus-visible{outline:3px solid #137866;outline-offset:4px}p{line-height:1.6}footer{font-size:14px;color:#5f6b6e;margin-top:28px}@media(max-width:500px){main{margin:3vh auto;padding:20px}}</style>
  </head><body data-game="${data.game}" data-mode="${xml(data.mode)}"><script src="/api/challenges/analytics.js" defer></script><main><header><a href="/">playne<span class="dot">.</span></a></header><article>
    <p class="eyebrow">${xml(data.gameName)} · ${xml(dateText(data.day))}</p><h1>${prompt(data)}</h1>
    <p>${xml(data.nickname)}</p><p class="score">${xml(challengeScore(data))}</p><p>${xml(status)}</p>
    <a class="cta" href="${xml(playUrl)}">Принять вызов →</a><footer>Сыграй и сравни результат с другом</footer>
    </article></main></body></html>`;
}
