export const SHADE_KEY = "playne:ottenok:v2";
export const ROUND_COUNT = 5;
export type HSV = { h: number; s: number; v: number };
export type ShadeAnswer = { choice: HSV; score: number };
export type ShadeStats = { played: number; best: number };
export type ShadeSession = {
  version: 2;
  targets: HSV[];
  answers: ShadeAnswer[];
  round: number;
  draft: HSV;
  touched: boolean;
  started: boolean;
  stats: ShadeStats;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function validHSV(value: unknown): value is HSV {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return typeof c.h === "number" && Number.isInteger(c.h) && c.h >= 0 && c.h <= 359 &&
    typeof c.s === "number" && Number.isInteger(c.s) && c.s >= 0 && c.s <= 100 &&
    typeof c.v === "number" && Number.isInteger(c.v) && c.v >= 0 && c.v <= 100;
}
export function hsvToRgb(color: HSV): [number, number, number] {
  const h = color.h / 60;
  const s = color.s / 100;
  const v = color.v / 100;
  const chroma = v * s;
  const second = chroma * (1 - Math.abs((h % 2) - 1));
  const offset = v - chroma;
  const sections: [number, number, number][] = [
    [chroma, second, 0], [second, chroma, 0], [0, chroma, second],
    [0, second, chroma], [second, 0, chroma], [chroma, 0, second],
  ];
  return sections[Math.floor(h)].map((n) => Math.round((n + offset) * 255)) as [number, number, number];
}
export function hsvToHex(color: HSV): string {
  return `#${hsvToRgb(color).map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
// OKLab measures visual separation more naturally than raw RGB channels.
function oklab(color: HSV): [number, number, number] {
  const [r, g, b] = hsvToRgb(color).map((n) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function shadeScore(choice: HSV, target: HSV): number {
  const a = oklab(choice), b = oklab(target);
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  if (hsvToHex(choice) === hsvToHex(target)) return 100;
  return clamp(Math.round(100 * (1 - distance / 0.6)), 0, 99);
}
const initialDraft = (): HSV => ({ h: 180, s: 50, v: 75 });
export function randomTargets(random = Math.random): HSV[] {
  return Array.from({ length: ROUND_COUNT }, () => ({
    h: Math.floor(random() * 360) % 360,
    s: 45 + Math.floor(random() * 51) % 51,
    v: 45 + Math.floor(random() * 51) % 51,
  }));
}
export function newShadeSession(previous?: ShadeSession, random = Math.random): ShadeSession {
  const targets = randomTargets(random);
  if (previous && hsvToHex(targets[0]) === hsvToHex(previous.targets.at(-1)!))
    targets[0] = { ...targets[0], h: (targets[0].h + 90) % 360 };
  return { version: 2, targets, answers: [], round: 0, draft: initialDraft(), touched: false,
    started: previous?.started ?? false, stats: previous ? { ...previous.stats } : { played: 0, best: 0 } };
}
export const shadeTotal = (state: ShadeSession) => state.answers.reduce((sum, answer) => sum + answer.score, 0);
export const shadePhase = (state: ShadeSession): "welcome" | "picking" | "reveal" | "finished" =>
  !state.started ? "welcome" : state.answers.length === ROUND_COUNT ? "finished" :
  state.answers.length > state.round ? "reveal" : "picking";
export type ShadeAction =
  | { type: "start" }
  | { type: "pick"; color: HSV }
  | { type: "submit" }
  | { type: "next" }
  | { type: "new"; session: ShadeSession };
export function shadeReducer(state: ShadeSession, action: ShadeAction): ShadeSession {
  if (action.type === "start") return state.started ? state : { ...state, started: true };
  if (action.type === "new") return shadePhase(state) === "finished" ? action.session : state;
  if (shadePhase(state) === "picking") {
    if (action.type === "pick") {
      if (!validHSV(action.color)) return state;
      return { ...state, draft: action.color, touched: true };
    }
    if (action.type === "submit" && state.touched) {
      const answer = { choice: state.draft, score: shadeScore(state.draft, state.targets[state.round]) };
      const answers = [...state.answers, answer];
      const total = answers.reduce((sum, item) => sum + item.score, 0);
      return { ...state, answers, stats: answers.length === ROUND_COUNT
        ? { played: state.stats.played + 1, best: Math.max(state.stats.best, total) }
        : state.stats };
    }
  }
  if (action.type === "next" && shadePhase(state) === "reveal")
    return { ...state, round: state.round + 1, draft: initialDraft(), touched: false };
  return state;
}
export function parseShadeSession(raw: string | null): ShadeSession | null {
  try {
    const s = JSON.parse(raw ?? "null");
    if (!s || s.version !== 2 || !Array.isArray(s.targets) || s.targets.length !== ROUND_COUNT ||
      !s.targets.every(validHSV) || !Array.isArray(s.answers) || s.answers.length > ROUND_COUNT ||
      !s.answers.every((answer: ShadeAnswer, i: number) => validHSV(answer?.choice) &&
        Number.isInteger(answer.score) && answer.score === shadeScore(answer.choice, s.targets[i])) ||
      !Number.isInteger(s.round) || s.round < 0 || s.round >= ROUND_COUNT ||
      (s.answers.length !== s.round && s.answers.length !== s.round + 1 && s.answers.length !== ROUND_COUNT) ||
      (s.answers.length === ROUND_COUNT && s.round !== ROUND_COUNT - 1) ||
      !validHSV(s.draft) || typeof s.touched !== "boolean" || typeof s.started !== "boolean" ||
      (!s.started && (s.answers.length > 0 || s.round > 0)) ||
      !s.stats || !Number.isSafeInteger(s.stats.played) || s.stats.played < 0 ||
      !Number.isInteger(s.stats.best) || s.stats.best < 0 || s.stats.best > ROUND_COUNT * 100 ||
      (s.answers.length === ROUND_COUNT && s.stats.played < 1)) return null;
    return s as ShadeSession;
  } catch { return null; }
}
export function loadShadeSession(): ShadeSession {
  try { return parseShadeSession(localStorage.getItem(SHADE_KEY)) ?? newShadeSession(); }
  catch { return newShadeSession(); }
}
export function saveShadeSession(state: ShadeSession): void {
  try { localStorage.setItem(SHADE_KEY, JSON.stringify(state)); } catch { /* Play continues in memory. */ }
}
