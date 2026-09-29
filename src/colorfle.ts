export const COLORFLE_KEY = "playne:colorfle:v1";
export const COLOR_WEIGHTS = [0.5, 0.3, 0.2] as const;
export const MAX_COLOR_TRIES = 6;
export const PALETTE = [
  { name: "Коралл", hex: "#e65e73", ink: "#201a20" },
  { name: "Янтарь", hex: "#e9a844", ink: "#201a20" },
  { name: "Лимон", hex: "#efdc66", ink: "#201a20" },
  { name: "Зелёный", hex: "#73b67c", ink: "#201a20" },
  { name: "Бирюза", hex: "#52bdb3", ink: "#201a20" },
  { name: "Синий", hex: "#558ddd", ink: "#151b29" },
  { name: "Сирень", hex: "#ac86d0", ink: "#201a20" },
  { name: "Сливочный", hex: "#f3ebdf", ink: "#201a20" },
  { name: "Графит", hex: "#343b50", ink: "#ffffff" },
] as const;
export type Recipe = [number, number, number];
export type Draft = [number | null, number | null, number | null];
export type ColorHint = "exact" | "present" | "absent";
export const HINT_LABELS: Record<ColorHint, string> = {
  exact: "На месте",
  present: "Другая доля",
  absent: "Нет в смеси",
};
export type ColorStats = { played: number; wins: number; best: number | null };
export type ColorSession = {
  version: 1;
  secret: Recipe;
  guesses: Recipe[];
  draft: Draft;
  active: number;
  started: boolean;
  stats: ColorStats;
};
export function validRecipe(value: unknown): value is Recipe {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    new Set(value).size === 3 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n < PALETTE.length)
  );
}
export function mixture(recipe: Recipe): string {
  const rgb = [0, 2, 4].map((offset) =>
    Math.round(
      recipe.reduce(
        (sum, id, slot) =>
          sum +
          parseInt(PALETTE[id].hex.slice(1 + offset, 3 + offset), 16) *
            COLOR_WEIGHTS[slot],
        0,
      ),
    ),
  );
  return `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
export function colorHints(guess: Recipe, secret: Recipe): ColorHint[] {
  return guess.map((id, slot) =>
    id === secret[slot] ? "exact" : secret.includes(id) ? "present" : "absent",
  );
}
export function colorWon(guess: Recipe, secret: Recipe): boolean {
  return guess.every((id, slot) => id === secret[slot]);
}
export function colorOutcome(state: ColorSession): "playing" | "won" | "lost" {
  return state.guesses.some((g) => colorWon(g, state.secret))
    ? "won"
    : state.guesses.length >= MAX_COLOR_TRIES
      ? "lost"
      : "playing";
}
// An explicitly game-specific RGB similarity, not a physical paint simulation.
// A near match never rounds to 100 unless the full recipe is correct.
export function colorSimilarity(guess: Recipe, secret: Recipe): number {
  if (colorWon(guess, secret)) return 100;
  const a = mixture(guess),
    b = mixture(secret);
  const distance = Math.sqrt(
    [1, 3, 5].reduce(
      (sum, offset) =>
        sum +
        (parseInt(a.slice(offset, offset + 2), 16) -
          parseInt(b.slice(offset, offset + 2), 16)) **
          2,
      0,
    ),
  );
  return Math.min(99.9, Math.round(1000 * Math.exp(-distance / 180)) / 10);
}
export const ALL_RECIPES: Recipe[] = [];
for (let a = 0; a < PALETTE.length; a++)
  for (let b = 0; b < PALETTE.length; b++)
    for (let c = 0; c < PALETTE.length; c++) {
      if (a !== b && a !== c && b !== c) ALL_RECIPES.push([a, b, c]);
    }
const counts = new Map<string, number>();
for (const recipe of ALL_RECIPES)
  counts.set(mixture(recipe), (counts.get(mixture(recipe)) ?? 0) + 1);
// Never ask the player to distinguish recipes that render as the very same RGB.
export const PLAYABLE_RECIPES = ALL_RECIPES.filter(
  (r) => counts.get(mixture(r)) === 1,
);
export function newColorSession(
  previous?: ColorSession,
  random = Math.random,
): ColorSession {
  const choices = previous
    ? PLAYABLE_RECIPES.filter((r) => !colorWon(r, previous.secret))
    : PLAYABLE_RECIPES;
  const sample = random();
  const index = Math.min(
    choices.length - 1,
    Math.max(
      0,
      Math.floor((Number.isFinite(sample) ? sample : 0) * choices.length),
    ),
  );
  return {
    version: 1,
    secret: [...choices[index]],
    guesses: [],
    draft: [null, null, null],
    active: 0,
    started: previous?.started ?? false,
    stats: previous
      ? { ...previous.stats }
      : { played: 0, wins: 0, best: null },
  };
}
export type ColorAction =
  | { type: "start" }
  | { type: "slot"; slot: number }
  | { type: "choose"; color: number }
  | { type: "clear" }
  | { type: "remove" }
  | { type: "reuse"; recipe: Recipe }
  | { type: "submit" }
  | { type: "new"; session: ColorSession };
export function colorReducer(
  state: ColorSession,
  action: ColorAction,
): ColorSession {
  if (action.type === "new")
    return colorOutcome(state) === "playing" ? state : action.session;
  if (action.type === "start") return { ...state, started: true };
  if (!state.started || colorOutcome(state) !== "playing") return state;
  if (action.type === "slot")
    return Number.isInteger(action.slot) && action.slot >= 0 && action.slot < 3
      ? { ...state, active: action.slot }
      : state;
  if (action.type === "clear")
    return { ...state, draft: [null, null, null], active: 0 };
  if (action.type === "remove") {
    const draft = [...state.draft] as Draft;
    draft[state.active] = null;
    return { ...state, draft };
  }
  if (action.type === "reuse")
    return validRecipe(action.recipe)
      ? { ...state, draft: [...action.recipe], active: 0 }
      : state;
  if (action.type === "choose") {
    if (
      !Number.isInteger(action.color) ||
      action.color < 0 ||
      action.color >= PALETTE.length
    )
      return state;
    const draft = [...state.draft] as Draft;
    const existing = draft.indexOf(action.color);
    if (existing >= 0 && existing !== state.active)
      draft[existing] = draft[state.active];
    draft[state.active] = action.color;
    const empty = [1, 2, 0]
      .map((n) => (state.active + n) % 3)
      .find((slot) => draft[slot] === null);
    return { ...state, draft, active: empty ?? state.active };
  }
  if (action.type === "submit") {
    if (
      !validRecipe(state.draft) ||
      state.guesses.some((g) => colorWon(g, state.draft as Recipe))
    )
      return state;
    const guess = [...state.draft] as Recipe;
    const guesses = [...state.guesses, guess];
    const won = colorWon(guess, state.secret);
    const finished = won || guesses.length === MAX_COLOR_TRIES;
    const stats = finished
      ? {
          played: state.stats.played + 1,
          wins: state.stats.wins + Number(won),
          best: won
            ? Math.min(state.stats.best ?? 6, guesses.length)
            : state.stats.best,
        }
      : state.stats;
    // Keep confirmed positions, so feedback immediately helps the next attempt.
    const draft = guess.map((id, slot) =>
      id === state.secret[slot] ? id : null,
    ) as Draft;
    return {
      ...state,
      guesses,
      draft,
      active: Math.max(0, draft.indexOf(null)),
      stats,
    };
  }
  return state;
}
export function parseColorSession(raw: string | null): ColorSession | null {
  try {
    const s = JSON.parse(raw ?? "null");
    if (
      !s ||
      s.version !== 1 ||
      !validRecipe(s.secret) ||
      !Array.isArray(s.guesses) ||
      s.guesses.length > 6 ||
      !s.guesses.every(validRecipe)
    )
      return null;
    if (
      new Set(s.guesses.map((g: Recipe) => g.join(","))).size !==
        s.guesses.length ||
      s.guesses.slice(0, -1).some((g: Recipe) => colorWon(g, s.secret))
    )
      return null;
    if (
      !Array.isArray(s.draft) ||
      s.draft.length !== 3 ||
      s.draft.some(
        (n: unknown) =>
          n !== null &&
          (!Number.isInteger(n) ||
            Number(n) < 0 ||
            Number(n) >= PALETTE.length),
      )
    )
      return null;
    const filled = s.draft.filter((n: unknown) => n !== null);
    if (
      new Set(filled).size !== filled.length ||
      !Number.isInteger(s.active) ||
      s.active < 0 ||
      s.active > 2 ||
      typeof s.started !== "boolean" ||
      (!s.started && s.guesses.length)
    )
      return null;
    if (
      !s.stats ||
      !Number.isSafeInteger(s.stats.played) ||
      s.stats.played < 0 ||
      !Number.isSafeInteger(s.stats.wins) ||
      s.stats.wins < 0 ||
      s.stats.wins > s.stats.played
    )
      return null;
    if (
      s.stats.best !== null &&
      (!Number.isInteger(s.stats.best) || s.stats.best < 1 || s.stats.best > 6)
    )
      return null;
    if ((s.stats.wins === 0) !== (s.stats.best === null)) return null;
    return {
      version: 1,
      secret: [...s.secret] as Recipe,
      guesses: s.guesses.map((g: Recipe) => [...g]),
      draft: [...s.draft] as Draft,
      active: s.active,
      started: s.started,
      stats: { played: s.stats.played, wins: s.stats.wins, best: s.stats.best },
    };
  } catch {
    return null;
  }
}
export function loadColorSession(): ColorSession {
  try {
    return (
      parseColorSession(localStorage.getItem(COLORFLE_KEY)) ?? newColorSession()
    );
  } catch {
    return newColorSession();
  }
}
export function saveColorSession(state: ColorSession): void {
  try {
    localStorage.setItem(COLORFLE_KEY, JSON.stringify(state));
  } catch {
    /* The session continues in memory. */
  }
}
export function colorShareText(state: ColorSession): string {
  const outcome = colorOutcome(state);
  const marks = { exact: "🟩", present: "🟨", absent: "⬜" };
  return `Оттенок · Playne\n${outcome === "won" ? `Собрал за ${state.guesses.length} из 6` : "6 попыток — цвет оказался хитрее"}\n\n${state.guesses
    .map((g) =>
      colorHints(g, state.secret)
        .map((h) => marks[h])
        .join(""),
    )
    .join("\n")}\n\nhttps://playne.ru/colorfle/`;
}
