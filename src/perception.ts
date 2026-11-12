/** Original Playne tasks. Coordinates are normalized so every screen has the same problem. */
export const PERCEPTION_VERSION = 1;
export const PERCEPTION_KINDS = ["count", "track", "angle", "tempo", "split"] as const;
export type PerceptionKind = (typeof PERCEPTION_KINDS)[number];
export type PerceptionTask =
  | { kind: "count"; dots: { x: number; y: number; r: number; phase: number }[]; durationMs: number; moving: boolean }
  | { kind: "track"; startX: number; travel: number; peak: number; flightMs: number; visibleFraction: number }
  | { kind: "angle"; target: number; initial: number }
  | { kind: "tempo"; bpm: number; cues: 4; beats: 8 }
  | { kind: "split"; fraction: number; label: string; fromRight: boolean };
export type PerceptionInput = { value?: number; taps?: number[]; skipped?: boolean };
export type PerceptionAnswer = { score: number; error: number; unit: string; guess: number | null; actual: number; elapsedMs?: number; skipped?: boolean };
export const perceptionNames: Record<PerceptionKind, string> = {
  count: "Счёт", track: "Траектория", angle: "Угол", tempo: "Ритм", split: "Доля",
};
export const perceptionRules: Record<PerceptionKind, string> = {
  count: "Посмотри на точки. Через две секунды они исчезнут — укажи, сколько их было.",
  track: "Шар исчезнет на полпути. Отметь на нижней линии, где он приземлится.",
  angle: "Поверни луч и выставь заданный угол против часовой стрелки от правого луча.",
  tempo: "Поймай ритм четырёх сигналов. Затем нажми ещё восемь раз в том же темпе.",
  split: "Отметь указанную долю отрезка. Обрати внимание, с какого края считать.",
};
export function perceptionDay(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now);
}
export function perceptionDayLabel(day: string) {
  return new Date(day + "T12:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}
export const perceptionBoardUrl = (day?: string) => `/leaderboard/?game=perception&mode=daily${day ? `&day=${encodeURIComponent(day)}` : ""}`;
function seeded(key: string) {
  let n = 2166136261;
  for (const char of key) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return () => {
    n += 0x6d2b79f5;
    let t = Math.imul(n ^ n >>> 15, 1 | n);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function createPerceptionTasks(day: string): PerceptionTask[] {
  const random = seeded(`playne-perception:${PERCEPTION_VERSION}:${day}`);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  // Jittered grid guarantees readable, non-overlapping dots even on a narrow phone.
  const positions = Array.from({ length: 120 }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) { const j = integer(0, i); [positions[i], positions[j]] = [positions[j], positions[i]]; }
  const dots = positions.slice(0, integer(42, 82)).map(i => ({
    x: .07 + (i % 12 + random() * .5) / 12 * .86,
    y: .07 + (Math.floor(i / 12) + random() * .5) / 10 * .86,
    r: .008 + random() * .002, phase: random() * Math.PI * 2,
  }));
  const rightward = random() > .5;
  const fractions = [[1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [4, 5], [3, 7], [5, 8], [2, 7], [5, 6], [3, 8]];
  const [a, b] = fractions[integer(0, fractions.length - 1)];
  return [
    { kind: "count", dots, durationMs: 2200, moving: new Date(day + "T12:00Z").getUTCDay() === 5 },
    { kind: "track", startX: rightward ? .08 : .92, travel: (rightward ? 1 : -1) * (.45 + random() * .4), peak: .35 + random() * .38, flightMs: integer(1700, 2300), visibleFraction: .45 },
    { kind: "angle", target: integer(12, 348), initial: integer(1, 359) },
    { kind: "tempo", bpm: integer(72, 124), cues: 4, beats: 8 },
    { kind: "split", fraction: a / b, label: `${a}/${b}`, fromRight: random() > .5 },
  ];
}
/** Only the started task is exposed, never the rest of the daily pack. */
export const publicPerceptionTask = (task: PerceptionTask): PerceptionTask => structuredClone(task);
export const perceptionMinimumMs = (task: PerceptionTask) => task.kind === "count" ? task.durationMs : task.kind === "track" ? task.flightMs * task.visibleFraction : task.kind === "tempo" ? 800 + 10.5 * 60000 / task.bpm : 0;
export function trackPoint(task: Extract<PerceptionTask, { kind: "track" }>, progress: number) {
  return { x: task.startX + task.travel * progress, y: .84 - task.peak * 4 * progress * (1 - progress) };
}
const points = (error: number, scale: number) => error < .000001 ? 100 : Math.min(99, Math.max(0, Math.round(100 * Math.exp(-error / scale))));
export function evaluatePerception(task: PerceptionTask, input: PerceptionInput): PerceptionAnswer {
  if (!input || typeof input !== "object") throw new Error("Некорректный ответ");
  if (input.skipped === true) return { score: 0, error: 0, unit: "", guess: null, actual: 0, skipped: true };
  if (task.kind === "tempo") {
    const taps = input.taps;
    const beat = 60000 / task.bpm;
    if (!Array.isArray(taps) || taps.length !== 8 || taps.some((tap, i) => !Number.isFinite(tap) || tap < 0 || (i > 0 && tap <= taps[i - 1]))) throw new Error("Нужно восемь нажатий по порядку");
    const timing = taps.reduce((sum, tap, i) => sum + Math.abs(tap - (800 + (task.cues + i) * beat)), 0) / taps.length;
    return { score: points(timing / beat, .42), error: Math.round(timing), unit: "мс", guess: Math.round(60000 / ((taps[7] - taps[0]) / 7)), actual: task.bpm };
  }
  const guess = input.value;
  if (typeof guess !== "number" || !Number.isFinite(guess)) throw new Error("Укажи свой ответ");
  if (task.kind === "count") {
    if (!Number.isInteger(guess) || guess < 1 || guess > 150) throw new Error("Введи число от 1 до 150");
    const actual = task.dots.length, error = Math.abs(guess - actual);
    return { score: points(error / actual, .23), error, unit: "точек", guess, actual };
  }
  if (task.kind === "angle") {
    if (guess < 0 || guess > 360) throw new Error("Угол вне диапазона");
    const delta = Math.abs(guess - task.target), error = Math.min(delta, 360 - delta);
    return { score: points(error, 24), error: Math.round(error * 10) / 10, unit: "°", guess, actual: task.target };
  }
  if (guess < 0 || guess > 1) throw new Error("Отметь точку на отрезке");
  const actual = task.kind === "track" ? task.startX + task.travel : task.fromRight ? 1 - task.fraction : task.fraction;
  const error = Math.abs(guess - actual);
  return { score: points(error, task.kind === "track" ? .12 : .14), error: Math.round(error * 1000) / 10, unit: "% длины", guess, actual };
}
