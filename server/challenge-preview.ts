import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { PublicChallenge } from "../src/challenges";

// The production build embeds these bytes. Source-mode tests load the same files.
declare const __PLAYNE_PREVIEW_WASM_B64__: string | undefined;
declare const __PLAYNE_PREVIEW_FONT_B64__: string | undefined;
declare const __PLAYNE_PREVIEW_BOLD_B64__: string | undefined;
const xml = (value: unknown) => String(value).replace(/[&<>"']/g, (letter) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[letter]!);
const scoreText = (score: number) => String(score).replace(".", ",");
const dateText = (day: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(`${day}T12:00:00Z`));
const prompt = (data: PublicChallenge) => data.score >= data.maxScore ? "Сможешь повторить?" : "Побьёшь мой результат?";

export function challengeSvg(data: PublicChallenge) {
  const nickname = [...data.nickname];
  const displayName = nickname.length > 32 ? `${nickname.slice(0, 31).join("")}…` : data.nickname;
  const fraction = Math.max(0, Math.min(1, data.score / data.maxScore));
  const circumference = 2 * Math.PI * 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#f7f7f2"/>
    <rect x="24" y="24" width="1152" height="582" rx="28" fill="#fffefa" stroke="#dedfd8" stroke-width="2"/>
    <g font-family="Noto Sans" fill="#252a2d">
      <text x="72" y="92" font-size="40" font-weight="700">playne<tspan fill="#137866">.</tspan></text>
      <text x="1128" y="86" text-anchor="end" font-size="23" fill="#5f6b6e">${xml(dateText(data.day))}</text>
      <text x="72" y="173" font-size="46" font-weight="700">${xml(data.gameName)}</text>
      <text x="64" y="367" font-size="${Number.isInteger(data.score) ? 190 : 164}" font-weight="700">${xml(scoreText(data.score))}</text>
      <text x="650" y="351" font-size="45" fill="#5f6b6e">/ 500</text>
      <circle cx="1007" cy="281" r="92" fill="none" stroke="#e1f3ec" stroke-width="18"/>
      <circle cx="1007" cy="281" r="92" fill="none" stroke="#137866" stroke-width="18" stroke-dasharray="${fraction * circumference} ${circumference}" transform="rotate(-90 1007 281)"/>
      <text x="1007" y="294" text-anchor="middle" font-size="36" fill="#137866">${Math.round(fraction * 100)}%</text>
      <text x="72" y="433" font-size="28" fill="#5f6b6e">${xml(displayName)}</text>
      <path d="M72 472H1128" stroke="#dedfd8" stroke-width="2"/>
      <rect x="72" y="502" width="570" height="65" rx="16" fill="#bea5f7"/>
      <text x="100" y="546" font-size="29" font-weight="700">${prompt(data)}</text>
      <text x="1128" y="546" text-anchor="end" font-size="25" fill="#5f6b6e">playne.ru</text>
    </g>
  </svg>`;
}

let renderer: Promise<typeof import("@resvg/resvg-wasm")> | undefined;
let fonts: Uint8Array[];
async function initializedRenderer() {
  if (!renderer) renderer = (async () => {
    const module = await import("@resvg/resvg-wasm");
    const require = createRequire(`${process.cwd()}/package.json`);
    const wasm = typeof __PLAYNE_PREVIEW_WASM_B64__ === "undefined"
      ? readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))
      : Buffer.from(__PLAYNE_PREVIEW_WASM_B64__, "base64");
    const regular = typeof __PLAYNE_PREVIEW_FONT_B64__ === "undefined"
      ? readFileSync(`${process.cwd()}/server/assets/NotoSans-Regular.ttf`)
      : Buffer.from(__PLAYNE_PREVIEW_FONT_B64__, "base64");
    const bold = typeof __PLAYNE_PREVIEW_BOLD_B64__ === "undefined"
      ? readFileSync(`${process.cwd()}/server/assets/NotoSans-Bold.ttf`)
      : Buffer.from(__PLAYNE_PREVIEW_BOLD_B64__, "base64");
    fonts = [regular, bold];
    await module.initWasm(wasm);
    return module;
  })();
  return renderer;
}

const cache = new Map<string, Buffer>();
export async function renderChallengePng(data: PublicChallenge): Promise<Buffer> {
  const key = JSON.stringify([data.token, data.game, data.nickname, data.day, data.score]);
  const cached = cache.get(key);
  if (cached) return cached;
  const { Resvg } = await initializedRenderer();
  const svg = new Resvg(challengeSvg(data), { font: { fontBuffers: fonts, defaultFontFamily: "Noto Sans" } });
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
  const title = `${data.nickname}: ${scoreText(data.score)} / 500 · ${data.gameName}`;
  const description = `${prompt(data)} ${data.gameName}, ${dateText(data.day)}. Сыграй те же пять раундов на Playne.`;
  const status = data.isTodayDaily
    ? "Сегодняшняя задача дня. В зачёт идёт твоя первая попытка."
    : "Те же пять заданий в отдельном вызове. Результат не меняет рейтинг.";
  const playUrl = `/` + (data.game === "line" ? "one-line/" : `brain/${data.game}/`) + `?challenge=${encodeURIComponent(data.token)}`;
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
    <p>${xml(data.nickname)}</p><p class="score">${xml(scoreText(data.score))} <span>/ 500</span></p><p>${xml(status)}</p>
    <a class="cta" href="${xml(playUrl)}">Принять вызов →</a><footer>Пять раундов · результат можно сравнить с другом</footer>
    </article></main></body></html>`;
}
