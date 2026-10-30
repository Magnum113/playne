import { GAME_NAMES, type GameId } from "./scoring";
import { geoModeName } from "../src/geo";
import { shadeModeName } from "../src/colorfle";
import { formatPressScore } from "../src/pressure";
import type { EmailPurpose } from "../src/emailConsent";
import { isBrainGame } from "./brain";

export type EmailVariant = "A" | "B" | "C";
export type RankEmailItem = {
  id: string;
  game: GameId;
  mode: string;
  oldPlace: number;
  newPlace: number;
  scoreUnits: number;
  opponentUnits: number;
};
export const EMAIL_EXPERIMENT = "rank-email-design-v1";
export {
  EMAIL_CONSENT_VERSION,
  LEGACY_EMAIL_CONSENT_VERSION,
} from "../src/emailConsent";
export const EMAIL_OPT_IN_LABEL = "Получать письма Playne";
export const emailEscape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function emailScore(game: GameId, units: number) {
  const score = units / 10;
  return game === "circle"
    ? `${score.toFixed(1).replace(".", ",")}%`
    : game === "pressure"
      ? formatPressScore(score)
      : `${Math.round(score)} / 500`;
}
export function emailBoardName(game: GameId, mode: string) {
  return (
    GAME_NAMES[game] +
    (game === "geo"
      ? ` · ${geoModeName(mode as any)}`
      : game === "colorfle"
        ? ` · ${shadeModeName(mode === "timed" ? "timed" : "classic")}`
        : game === "line" || isBrainGame(game)
          ? ` · ${mode === "practice" ? "Практика" : "Задача дня"}`
          : "")
  );
}
export function emailGamePath(game: GameId, mode: string) {
  return (
    `/${isBrainGame(game) ? "brain/" + game : game === "line" ? "one-line" : game}/` +
    ((game === "geo" ||
      game === "colorfle" ||
      game === "line" ||
      isBrainGame(game)) &&
    mode !== "classic"
      ? `?mode=${encodeURIComponent(mode)}`
      : "")
  );
}
const button = (text: string, href: string) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td bgcolor="#bea5f7" style="border-radius:12px;text-align:center"><a href="${emailEscape(href)}" style="display:block;padding:17px 20px;color:#17131e;text-decoration:none;font-size:17px;font-weight:700;line-height:24px">${emailEscape(text)}</a></td></tr></table>`;
function frame(
  origin: string,
  preheader: string,
  inner: string,
  footer: string,
  centered = false,
) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Playne</title><style>@media(max-width:620px){.outer{padding:12px!important}.content{padding:24px 20px!important}.title{font-size:30px!important;line-height:1.15!important}.position{font-size:52px!important}}@media(prefers-color-scheme:dark){.email-bg{background:#151719!important}.email-panel{background:#1d2125!important;color:#f2f3ef!important;border-color:#38434a!important}.email-footer{border-color:#38434a!important}.copy{color:#f2f3ef!important}.muted{color:#adb7bd!important}.tinted{background:#342c45!important}.tinted-mint{background:#163c35!important}.tinted .copy{color:#f2f3ef!important}.email-link{color:#61d7c1!important}.place-old{background:#163c35!important;color:#61d7c1!important;border-color:#386c61!important}.place-new{background:#342c45!important;color:#bea5f7!important;border-color:#74628d!important}.focus-place{color:#bea5f7!important}}</style></head><body class="email-bg" style="margin:0;background:#f7f7f2;color:#252a2d;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${emailEscape(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td class="outer" align="center" style="padding:32px 16px"><table class="email-panel" role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fffefa;border:1px solid #dedfd8;border-radius:24px"><tr><td class="content" style="padding:36px;text-align:${centered ? "center" : "left"}"><table role="presentation" cellspacing="0" cellpadding="0"${centered ? ' align="center"' : ""}><tr><td width="38"><img src="${emailEscape(origin)}/art/playne-apple-touch-icon.png" width="34" height="34" alt="" style="display:block;border:0"></td><td class="copy" style="font-size:30px;font-weight:700;letter-spacing:-1px">playne<span style="color:#7953b4">.</span></td></tr></table>${inner}<div style="border-top:1px solid #dedfd8;margin-top:32px;padding-top:20px;font-size:13px;line-height:1.7;color:#5f6b6e" class="email-footer muted">${footer}</div></td></tr></table></td></tr></table></body></html>`;
}
export function renderRankEmail(args: {
  origin: string;
  variant: EmailVariant;
  items: RankEmailItem[];
  playUrl: string;
  rankUrl: string;
  unsubscribeUrl: string;
}) {
  const { origin, variant, items, playUrl, rankUrl, unsubscribeUrl } = args;
  if (!items.length) throw new Error("Empty notification");
  const e = items[0],
    name = emailBoardName(e.game, e.mode);
  const subject = `Твой результат в «${GAME_NAMES[e.game]}» обошли`;
  const preheader = `Было ${e.oldPlace}-е место, стало ${e.newPlace}-е. Попробуешь вернуть позицию?`;
  const heading =
    e.newPlace > 10
      ? "Твой результат вышел из топ-10."
      : "Твой результат обошли.";
  const text = `В общем рейтинге «${GAME_NAMES[e.game]}» ты теперь на ${e.newPlace}-м месте вместо ${e.oldPlace}-го.`;
  const own = emailScore(e.game, e.scoreUnits),
    other = emailScore(e.game, e.opponentUnits);
  const intro = `<p class="muted" style="margin:32px 0 18px;color:#5f6b6e;font-size:12px;letter-spacing:1.5px;line-height:1.7">${emailEscape(name.toUpperCase())} · ОБЩИЙ РЕЙТИНГ</p><h1 class="title copy" style="font-size:38px;line-height:1.12;letter-spacing:-1.2px;margin:0 0 20px;color:#252a2d">${heading}</h1><p class="copy" style="font-size:17px;line-height:1.6;margin:0 0 24px;color:#252a2d">${emailEscape(text)}</p>`;
  const comparison = `<table class="tinted${variant === "C" ? " tinted-mint" : ""}" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${variant === "C" ? "#e1f3ec" : "#eee6fb"};border-radius:16px;margin:0 0 28px"><tr><td width="50%" style="padding:20px 12px;text-align:center"><span class="muted" style="font-size:13px;color:#5f6b6e">Твой рекорд</span><br><strong class="copy" style="display:inline-block;margin-top:8px;font-size:25px;color:#252a2d">${emailEscape(own)}</strong></td><td width="50%" style="padding:20px 12px;text-align:center"><span class="muted" style="font-size:13px;color:#5f6b6e">У соперника</span><br><strong class="copy" style="display:inline-block;margin-top:8px;font-size:25px;color:#252a2d">${emailEscape(other)}</strong></td></tr></table>`;
  let design: string;
  if (variant === "A") {
    design = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px"><tr><td width="43%" align="center" class="position" style="font-size:68px;color:#137866;font-weight:700"><span class="place-old" style="display:inline-block;border:1px solid #b8d2cb;border-radius:16px;background:#f3faf7;padding:12px 18px">${e.oldPlace}</span></td><td align="center" style="font-size:30px;color:#5f6b6e">→</td><td width="43%" align="center" class="position" style="font-size:68px;color:#7953b4;font-weight:700"><span class="place-new" style="display:inline-block;border:1px solid #d2c5e9;border-radius:16px;background:#f6f0fd;padding:12px 18px">${e.newPlace}</span></td></tr></table><p class="muted" style="text-align:center;font-size:13px;color:#5f6b6e;margin:0 0 28px">место в общем рейтинге</p>${comparison}`;
  } else if (variant === "B") {
    design = `<table width="100%" cellspacing="0" cellpadding="16" style="border:1px solid #dedfd8;border-radius:16px;margin:0 0 28px;text-align:left;font-size:16px"><caption class="muted" style="text-align:left;padding-bottom:12px;font-size:13px;color:#5f6b6e">Сравнение результатов</caption><thead><tr><th class="muted" scope="col" style="font-weight:400;color:#5f6b6e">Игрок</th><th class="muted" scope="col" style="font-weight:400;color:#5f6b6e;text-align:right">Результат</th></tr></thead><tbody><tr><td style="border-top:1px solid #dedfd8">Соперник</td><td style="border-top:1px solid #dedfd8;text-align:right;font-weight:700">${emailEscape(other)}</td></tr><tr class="tinted" style="background:#eee6fb"><td style="font-weight:700">Ты · ${e.newPlace}-е место</td><td style="text-align:right;font-weight:700">${emailEscape(own)}</td></tr></tbody></table>`;
  } else {
    design = `<p class="position focus-place" style="font-size:64px;line-height:1;margin:10px 0 12px;color:#7953b4;font-weight:700">${e.newPlace}<span class="muted" style="font-size:20px;color:#5f6b6e">-е место</span></p><p class="muted" style="margin:0 0 28px;font-size:14px;color:#5f6b6e">Раньше — ${e.oldPlace}-е</p>${comparison}`;
  }
  const more = items
    .slice(1, 3)
    .map(
      (i) =>
        `<p class="copy" style="margin:12px 0;font-size:15px;line-height:1.5">${emailEscape(emailBoardName(i.game, i.mode))}: ${i.oldPlace}-е → ${i.newPlace}-е место.</p>`,
    )
    .join("");
  const inner = `${intro}${design}${more ? `<p class="muted" style="font-size:13px;color:#5f6b6e;margin:0">Ещё изменения</p>${more}<br>` : ""}${button("Попробовать ещё раз", playUrl)}<p style="margin:20px 0 0;text-align:center;font-size:15px"><a class="email-link" href="${emailEscape(rankUrl)}" style="color:#137866;text-underline-offset:3px">Посмотреть рейтинг</a></p>`;
  const footer = `Ты получаешь письма Playne.<br><a class="email-link" href="${emailEscape(origin)}/account/#email-settings" style="color:#137866">Настроить письма</a> · <a class="email-link" href="${emailEscape(unsubscribeUrl)}" style="color:#137866">Отписаться</a>`;
  const plaintext = [
    subject,
    name,
    text,
    `Твой рекорд: ${own}. У соперника: ${other}.`,
    ...items
      .slice(1, 3)
      .map(
        (i) =>
          `${emailBoardName(i.game, i.mode)}: ${i.oldPlace}-е → ${i.newPlace}-е место.`,
      ),
    `Попробовать ещё раз: ${playUrl}`,
    `Рейтинг: ${rankUrl}`,
    `Ты получаешь письма Playne. Отписаться: ${unsubscribeUrl}`,
  ].join("\n\n");
  return {
    subject,
    html: frame(origin, preheader, inner, footer, variant === "C"),
    plaintext,
  };
}
export function renderVerificationEmail(
  origin: string,
  confirmUrl: string,
  purpose: EmailPurpose = "general",
) {
  const subject = "Подтверди подписку на письма Playne";
  const text =
    purpose === "general"
      ? "Подтверди адрес для писем Playne: новые игры, напоминания и результаты."
      : "Подтверди адрес для писем Playne о результатах в рейтинге.";
  return {
    subject,
    html: frame(
      origin,
      "Один шаг — и письма Playne будут подключены.",
      `<h1 class="title copy" style="margin:32px 0 20px;font-size:34px;line-height:1.15">Подтверди подписку.</h1><p class="copy" style="font-size:17px;line-height:1.6;margin:0 0 28px">${text}</p>${button("Подтвердить подписку", confirmUrl)}<p class="muted" style="font-size:14px;color:#5f6b6e;line-height:1.6;margin:24px 0 0">Ссылка действует 24 часа. Если ты не запрашивал подписку, просто не подтверждай её — уведомлений не будет.</p>`,
      `Playne · <a class="email-link" href="${emailEscape(origin)}/privacy/" style="color:#137866">Конфиденциальность</a>`,
    ),
    plaintext: `${text}\n\nПодтвердить подписку: ${confirmUrl}\n\nСсылка действует 24 часа. Если ты не запрашивал подписку, ничего делать не нужно.`,
  };
}

export function renderReminderEmail(
  origin: string,
  playUrl: string,
  unsubscribeUrl: string,
) {
  const subject = "Есть пара минут на игру?";
  const text =
    "В Playne готовы короткие игры и задачи дня. Выбери одну для небольшой разминки.";
  const footer = `Ты получаешь письма Playne.<br><a class="email-link" href="${emailEscape(origin)}/account/#email-settings">Настроить дни и время</a> · <a class="email-link" href="${emailEscape(unsubscribeUrl)}">Отписаться от всех писем</a>`;
  return {
    subject,
    html: frame(
      origin,
      text,
      `<h1 class="copy" style="font-size:32px;margin:28px 0 16px">${subject}</h1><p class="copy" style="line-height:1.6">${text}</p>${button("Выбрать игру", playUrl)}`,
      footer,
    ),
    plaintext: `${subject}\n\n${text}\n\nВыбрать игру: ${playUrl}\nДни и время: ${origin}/account/#email-settings\nОтписаться от всех писем: ${unsubscribeUrl}`,
  };
}
