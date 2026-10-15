export const SHADE_KEY = "playne:ottenok:v3";
export const LEGACY_SHADE_KEY = "playne:ottenok:v2";
export const SHADE_SCORE_VERSION = 2;
export const ROUND_COUNT = 5;
export const SHADE_TIME_LIMIT_MS = 30_000;
export type ShadeMode = "classic" | "timed";
export const validShadeMode = (v: unknown): v is ShadeMode =>
  v === "classic" || v === "timed";
export const shadeModeName = (mode: ShadeMode) =>
  mode === "timed" ? "На время" : "Без таймера";
export type HSV = { h: number; s: number; v: number };
export type ShadeAnswer = {
  choice: HSV;
  score: number;
  timedOut?: boolean;
  noChoice?: boolean;
};
export type ShadeStats = { played: number; best: number };
export type ShadeSession = {
  version: 2;
  scoringVersion?: number;
  rankedId?: string;
  mode?: ShadeMode;
  deadline?: number;
  previousBest?: number;
  modeStats?: Partial<Record<ShadeMode, ShadeStats>>;
  targets: HSV[];
  answers: ShadeAnswer[];
  round: number;
  draft: HSV;
  touched: boolean;
  started: boolean;
  stats: ShadeStats;
};
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
export function validHSV(value: unknown): value is HSV {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.h === "number" &&
    Number.isInteger(c.h) &&
    c.h >= 0 &&
    c.h <= 359 &&
    typeof c.s === "number" &&
    Number.isInteger(c.s) &&
    c.s >= 0 &&
    c.s <= 100 &&
    typeof c.v === "number" &&
    Number.isInteger(c.v) &&
    c.v >= 0 &&
    c.v <= 100
  );
}
export function hsvToRgb(color: HSV): [number, number, number] {
  const h = color.h / 60;
  const s = color.s / 100;
  const v = color.v / 100;
  const chroma = v * s;
  const second = chroma * (1 - Math.abs((h % 2) - 1));
  const offset = v - chroma;
  const sections: [number, number, number][] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  return sections[Math.floor(h)].map((n) => Math.round((n + offset) * 255)) as [
    number,
    number,
    number,
  ];
}
export function hsvToHex(color: HSV): string {
  return `#${hsvToRgb(color)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
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
function shadeDistance(choice: HSV, target: HSV): number {
  const a = oklab(choice),
    b = oklab(target);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
// Kept only to validate and migrate saves from the previous scale.
export function legacyShadeScore(choice: HSV, target: HSV): number {
  if (hsvToHex(choice) === hsvToHex(target)) return 100;
  return clamp(
    Math.round(100 * (1 - shadeDistance(choice, target) / 0.6)),
    0,
    99,
  );
}
export function shadeScore(choice: HSV, target: HSV): number {
  const a = hsvToRgb(choice),
    b = hsvToRgb(target);
  const maxChannelDifference = Math.max(
    ...a.map((channel, i) => Math.abs(channel - b[i])),
  );
  if (maxChannelDifference === 0) return 100;
  // A smooth falloff preserves useful feedback even for distant colors.
  // Reserve 95–99 for both perceptually close and nearly identical RGB colors.
  const upperLimit = maxChannelDifference <= 5 ? 99 : 94;
  return clamp(
    Math.round(100 * Math.exp(-shadeDistance(choice, target) / 0.12)),
    0,
    upperLimit,
  );
}
const initialDraft = (): HSV => ({ h: 180, s: 50, v: 75 });
// Six different lightness/saturation families across the full hue wheel, plus neutrals.
export const SHADE_COLORS: HSV[] = [
  ...Array.from({ length: 24 }, (_, i) =>
    [
      { s: 85, v: 95 },
      { s: 30, v: 98 },
      { s: 55, v: 80 },
      { s: 80, v: 55 },
      { s: 35, v: 60 },
      { s: 65, v: 35 },
    ].map((c) => ({ h: i * 15, ...c })),
  ).flat(),
  ...[22, 38, 54, 70, 86, 97].map((v) => ({ h: 0, s: 0, v })),
];
export function randomTargets(
  random = Math.random,
  recent: string[] = [],
): HSV[] {
  const excluded = new Set(recent);
  let available = SHADE_COLORS.filter((c) => !excluded.has(hsvToHex(c)));
  if (available.length < ROUND_COUNT) {
    const lastParty = new Set(recent.slice(0, ROUND_COUNT));
    available = SHADE_COLORS.filter((c) => !lastParty.has(hsvToHex(c)));
  }
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, ROUND_COUNT).map((c) => ({ ...c }));
}
export function newShadeSession(
  previous?: ShadeSession,
  random = Math.random,
  mode: ShadeMode = previous?.mode ?? "classic",
): ShadeSession {
  const targets = randomTargets(random, previous?.targets.map(hsvToHex));
  const modeStats = {
    ...previous?.modeStats,
    ...(previous ? { [previous.mode ?? "classic"]: previous.stats } : {}),
  };
  const stats = modeStats[mode] ?? { played: 0, best: 0 };
  return {
    version: 2,
    scoringVersion: SHADE_SCORE_VERSION,
    mode,
    modeStats,
    previousBest: stats.best,
    targets,
    answers: [],
    round: 0,
    draft: initialDraft(),
    touched: false,
    started: previous?.started ?? false,
    stats: { ...stats },
  };
}
export const shadeTotal = (state: ShadeSession) =>
  state.answers.reduce((sum, answer) => sum + answer.score, 0);
export const shadePhase = (
  state: ShadeSession,
): "welcome" | "picking" | "reveal" | "finished" =>
  !state.started
    ? "welcome"
    : state.answers.length === ROUND_COUNT
      ? "finished"
      : state.answers.length > state.round
        ? "reveal"
        : "picking";
export type ShadeAction =
  | { type: "mode"; mode: ShadeMode }
  | { type: "menu" }
  | { type: "deadline"; deadline: number }
  | {
      type: "verified";
      index: number;
      answer: { choice: HSV | null; score: number; timedOut?: boolean };
      id: string;
    }
  | { type: "ranked"; targets: HSV[]; id: string }
  | { type: "start" }
  | { type: "pick"; color: HSV }
  | { type: "submit"; expired?: boolean }
  | { type: "next" }
  | { type: "new"; session: ShadeSession };
export function shadeReducer(
  state: ShadeSession,
  action: ShadeAction,
): ShadeSession {
  if (action.type === "menu" && shadePhase(state) === "finished")
    return { ...newShadeSession(state), started: false };
  if (action.type === "mode" && !state.started)
    return newShadeSession(state, Math.random, action.mode);
  if (action.type === "deadline" && shadePhase(state) === "picking")
    return { ...state, deadline: action.deadline };
  if (
    action.type === "verified" &&
    state.rankedId === action.id &&
    state.answers[action.index]
  ) {
    const answers = state.answers.map((a, i) =>
      i === action.index
        ? {
            choice: action.answer.choice ?? a.choice,
            score: action.answer.score,
            timedOut: action.answer.timedOut,
            noChoice: action.answer.choice === null,
          }
        : a,
    );
    const best = Math.max(
      state.previousBest ?? state.stats.best,
      answers.reduce((s, a) => s + a.score, 0),
    );
    return {
      ...state,
      answers,
      stats:
        answers.length === ROUND_COUNT ? { ...state.stats, best } : state.stats,
    };
  }
  if (action.type === "ranked")
    return state.answers.length === 0 &&
      action.targets.length === 5 &&
      action.targets.every(validHSV)
      ? { ...state, targets: action.targets, rankedId: action.id }
      : state;
  if (action.type === "start")
    return state.started ? state : { ...state, started: true };
  if (action.type === "new")
    return shadePhase(state) === "finished" ? action.session : state;
  if (shadePhase(state) === "picking") {
    if (action.type === "pick") {
      if (!validHSV(action.color)) return state;
      return { ...state, draft: action.color, touched: true };
    }
    if (
      action.type === "submit" &&
      (state.touched || (action.expired && state.mode === "timed"))
    ) {
      const answer = {
        choice: state.draft,
        score: state.touched
          ? shadeScore(state.draft, state.targets[state.round])
          : 0,
        ...(action.expired ? { timedOut: true, noChoice: !state.touched } : {}),
      };
      const answers = [...state.answers, answer];
      const total = answers.reduce((sum, item) => sum + item.score, 0);
      return {
        ...state,
        answers,
        stats:
          answers.length === ROUND_COUNT
            ? {
                played: state.stats.played + 1,
                best: Math.max(state.stats.best, total),
              }
            : state.stats,
      };
    }
  }
  if (action.type === "next" && shadePhase(state) === "reveal")
    return {
      ...state,
      round: state.round + 1,
      draft: initialDraft(),
      touched: false,
      deadline: undefined,
    };
  return state;
}
export function parseShadeSession(raw: string | null): ShadeSession | null {
  try {
    const s = JSON.parse(raw ?? "null");
    if (
      !s ||
      s.version !== 2 ||
      !Array.isArray(s.targets) ||
      s.targets.length !== ROUND_COUNT ||
      !s.targets.every(validHSV) ||
      !Array.isArray(s.answers) ||
      s.answers.length > ROUND_COUNT ||
      !s.answers.every(
        (answer: ShadeAnswer, i: number) =>
          validHSV(answer?.choice) &&
          Number.isInteger(answer.score) &&
          (answer.score ===
            (answer.noChoice && s.mode === "timed"
              ? 0
              : shadeScore(answer.choice, s.targets[i])) ||
            (s.scoringVersion === undefined &&
              answer.score ===
                legacyShadeScore(answer.choice, s.targets[i]))) &&
          (answer.noChoice === undefined ||
            typeof answer.noChoice === "boolean") &&
          (answer.timedOut === undefined ||
            typeof answer.timedOut === "boolean"),
      ) ||
      !Number.isInteger(s.round) ||
      s.round < 0 ||
      s.round >= ROUND_COUNT ||
      (s.answers.length !== s.round &&
        s.answers.length !== s.round + 1 &&
        s.answers.length !== ROUND_COUNT) ||
      (s.answers.length === ROUND_COUNT && s.round !== ROUND_COUNT - 1) ||
      !validHSV(s.draft) ||
      typeof s.touched !== "boolean" ||
      typeof s.started !== "boolean" ||
      (!s.started && (s.answers.length > 0 || s.round > 0)) ||
      !s.stats ||
      !Number.isSafeInteger(s.stats.played) ||
      s.stats.played < 0 ||
      !Number.isInteger(s.stats.best) ||
      s.stats.best < 0 ||
      s.stats.best > ROUND_COUNT * 100 ||
      (s.answers.length === ROUND_COUNT && s.stats.played < 1)
    )
      return null;
    if (s.mode !== undefined && !validShadeMode(s.mode)) return null;
    if (s.deadline !== undefined && !Number.isFinite(s.deadline)) return null;
    if (
      s.previousBest !== undefined &&
      (!Number.isInteger(s.previousBest) ||
        s.previousBest < 0 ||
        s.previousBest > 500)
    )
      return null;
    if (
      s.modeStats !== undefined &&
      (typeof s.modeStats !== "object" ||
        !s.modeStats ||
        Object.values(s.modeStats).some(
          (stats: any) =>
            !stats ||
            !Number.isSafeInteger(stats.played) ||
            stats.played < 0 ||
            !Number.isInteger(stats.best) ||
            stats.best < 0 ||
            stats.best > 500,
        ))
    )
      return null;
    if (
      s.rankedId !== undefined &&
      (typeof s.rankedId !== "string" || !/^[0-9a-f-]{36}$/i.test(s.rankedId))
    )
      return null;
    if (
      s.scoringVersion !== undefined &&
      s.scoringVersion !== SHADE_SCORE_VERSION
    )
      return null;
    if (s.scoringVersion === undefined) {
      // Old party answers can be rescored exactly; an old best without its colors cannot.
      // Keep those previous records separately rather than mixing the two scales.
      s.answers = s.answers.map((answer: ShadeAnswer, i: number) => ({
        ...answer,
        score: answer.noChoice ? 0 : shadeScore(answer.choice, s.targets[i]),
      }));
      s.modeStats = Object.fromEntries(
        Object.entries(s.modeStats ?? {}).map(([mode, stats]: any) => [
          mode,
          { played: stats.played, best: 0 },
        ]),
      );
      s.stats = {
        played: s.stats.played,
        best: s.answers.length === ROUND_COUNT ? shadeTotal(s) : 0,
      };
      s.previousBest = 0;
      s.scoringVersion = SHADE_SCORE_VERSION;
    }
    return s as ShadeSession;
  } catch {
    return null;
  }
}
export function loadShadeSession(): ShadeSession {
  try {
    return (
      parseShadeSession(
        localStorage.getItem(SHADE_KEY) ??
          localStorage.getItem(LEGACY_SHADE_KEY),
      ) ?? newShadeSession()
    );
  } catch {
    return newShadeSession();
  }
}
export function saveShadeSession(state: ShadeSession): void {
  try {
    localStorage.setItem(SHADE_KEY, JSON.stringify(state));
  } catch {
    /* Play continues in memory. */
  }
}
