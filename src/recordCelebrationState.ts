export const RECORD_CELEBRATION_KEY = "playne:record-celebration:v1";
export const RECORD_CELEBRATION_EVENT = "playne:record-celebration";
export const RECORD_CELEBRATION_TTL = 24 * 60 * 60 * 1000;

const recordGames = [
  "naglaz",
  "circle",
  "colorfle",
  "geo",
  "pressure",
  "line",
  "flash",
  "rotate",
  "slide",
  "dispatch",
] as const;
export type RecordGame = (typeof recordGames)[number];
export type PersonalRecord = {
  id: string;
  game: RecordGame;
  mode: string;
  score: number;
  completedAt: number;
  ownerId: string | null;
};
export type RecordReceipt = {
  improved: boolean;
  completedAt: string;
  ownerId: string | null;
};
type Stored = { pending: PersonalRecord | null; seen: string[] };
let fallback: Stored = { pending: null, seen: [] };
const validId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
const modes = [
  "classic",
  "timed",
  "moving",
  "moving-timed",
  "landmarks",
  "landmarks-timed",
  "practice",
];

function validRecord(value: any): value is PersonalRecord {
  return (
    !!value &&
    validId(value.id) &&
    recordGames.includes(value.game) &&
    modes.includes(value.mode) &&
    Number.isFinite(value.score) &&
    value.score > 0 &&
    (value.game === "pressure"
      ? Number.isSafeInteger(value.score)
      : value.score <= (value.game === "circle" ? 100 : 500)) &&
    Number.isFinite(value.completedAt) &&
    (value.ownerId === null || validId(value.ownerId))
  );
}
function read(storage?: Storage): Stored {
  let saved: string | null;
  try {
    const source =
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage);
    if (!source) return fallback;
    saved = source.getItem(RECORD_CELEBRATION_KEY);
  } catch {
    return fallback;
  }
  try {
    const value = JSON.parse(saved ?? "null");
    return {
      pending: validRecord(value?.pending) ? value.pending : null,
      seen: Array.isArray(value?.seen)
        ? value.seen.filter(validId).slice(-100)
        : [],
    };
  } catch {
    return { pending: null, seen: [] };
  }
}
function write(value: Stored, storage?: Storage) {
  fallback = value;
  try {
    (
      storage ??
      (typeof localStorage === "undefined" ? undefined : localStorage)
    )?.setItem(RECORD_CELEBRATION_KEY, JSON.stringify(value));
  } catch {
    /* Cosmetic feedback must never interrupt saving a game. */
  }
}

// Only server-verified completed results call this, never account/history reads.
export function rememberPersonalRecord(
  run: { id: string; game: string; mode?: string },
  score: number,
  receipt: RecordReceipt,
  storage?: Storage,
  now = Date.now(),
) {
  if (!receipt || typeof receipt.improved !== "boolean") return;
  const state = read(storage);
  if (!receipt.improved) {
    // A guest claim may discover an even better result on the account.
    if (state.pending?.id === run.id)
      write({ ...state, pending: null }, storage);
    return;
  }
  const entry = {
    id: run.id,
    game: run.game as RecordGame,
    mode: run.mode ?? "classic",
    score,
    completedAt: Date.parse(receipt.completedAt),
    ownerId: receipt.ownerId,
  };
  if (
    !validRecord(entry) ||
    entry.mode === "practice" ||
    entry.completedAt > now + 60_000 ||
    now - entry.completedAt > RECORD_CELEBRATION_TTL ||
    state.seen.includes(entry.id)
  )
    return;
  if (state.pending && state.pending.completedAt > entry.completedAt) return;
  write({ ...state, pending: entry }, storage);
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(RECORD_CELEBRATION_EVENT));
}

export function takePersonalRecord(
  ownerId: string | null,
  storage?: Storage,
  now = Date.now(),
): PersonalRecord | null {
  const state = read(storage),
    entry = state.pending;
  if (!entry || entry.ownerId !== ownerId) return null;
  write(
    {
      pending: null,
      seen: [...state.seen.filter((id) => id !== entry.id), entry.id].slice(
        -100,
      ),
    },
    storage,
  );
  return now - entry.completedAt <= RECORD_CELEBRATION_TTL &&
    entry.completedAt <= now + 60_000 &&
    !state.seen.includes(entry.id)
    ? entry
    : null;
}

const names: Record<RecordGame, string> = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
  pressure: "Жми",
  line: "Одной линией",
  flash: "Вспышка",
  rotate: "Поворот",
  slide: "Передвинь",
  dispatch: "Диспетчер",
};
export function personalRecordLabel(record: PersonalRecord) {
  const mode =
    record.game === "geo"
      ? record.mode.startsWith("landmarks")
        ? " · достопримечательности"
        : record.mode.startsWith("moving")
          ? " · с перемещением"
          : ""
      : "";
  const timed = record.mode.includes("timed") ? " · на время" : "";
  return `${names[record.game]}${mode}${timed}`;
}
export function personalRecordScore(record: PersonalRecord) {
  const score = record.score.toLocaleString("ru-RU", {
    maximumFractionDigits: record.game === "circle" ? 1 : 0,
  });
  if (record.game === "circle") return `${score}%`;
  if (record.game !== "pressure") return `${score} / 500`;
  const n = record.score % 100;
  return `${score} ${n >= 11 && n <= 14 ? "очков" : n % 10 === 1 ? "очко" : n % 10 >= 2 && n % 10 <= 4 ? "очка" : "очков"}`;
}
export function personalRecordHref(record: PersonalRecord) {
  const route = ["flash", "rotate", "slide", "dispatch"].includes(record.game)
    ? `brain/${record.game}`
    : record.game === "line"
      ? "one-line"
      : record.game;
  return `/${route}/${record.mode === "classic" ? "" : `?mode=${encodeURIComponent(record.mode)}`}`;
}
