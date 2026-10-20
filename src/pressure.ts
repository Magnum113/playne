// Shared deterministic rules: the browser and API replay the same input trace.
export const PRESSURE_LEVELS = 30;
export type PressKind =
  "count" | "wait" | "window" | "hold" | "release" | "double";
export type PressEvent = { type: "down" | "up"; at: number };
export type PressLevel = {
  id: string;
  family: string;
  kind: PressKind;
  prompt: string;
  explanation: string;
  duration: number;
  count: number;
  from: number;
  to: number;
  display?: string;
  revealAt?: number;
  signal?: string;
};
export type PressTrace = { events: PressEvent[]; elapsed: number };
export type PressVerdict = {
  status: "playing" | "success" | "failure";
  reason?: string;
};
const num = (n: number) =>
  n === 1 ? "1 раз" : n < 5 ? `${n} раза` : `${n} раз`;
const pick = <T>(a: T[], r: () => number) =>
  a[Math.floor(r() * a.length) % a.length];
const integer = (a: number, b: number, r: () => number) =>
  a + Math.floor(r() * (b - a + 1));
const shuffled = <T>(a: T[], r: () => number) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
export const PRESSURE_FAMILIES = [
  "tap",
  "restraint",
  "sum",
  "subtract",
  "multiply",
  "parity",
  "comparison",
  "equation",
  "symbols",
  "letters",
  "memory",
  "delay",
  "window",
  "hold",
  "release",
  "signal",
  "double",
  "negation",
  "digits",
  "word",
] as const;
export type PressFamily = (typeof PRESSURE_FAMILIES)[number];
export function makePressLevel(
  family: PressFamily,
  index: number,
  r = Math.random,
): PressLevel {
  const hard = index >= 12;
  let p: PressLevel = {
    id: "",
    family,
    kind: "count",
    prompt: "",
    explanation: "",
    duration: hard ? 6500 : 8000,
    count: 1,
    from: 0,
    to: 0,
  };
  const count = (
    n: number,
    prompt: string,
    explanation = `Нужно было нажать ${num(n)}.`,
  ) => {
    p.count = n;
    p.prompt = prompt;
    p.explanation = explanation;
    if (!n) {
      p.kind = "wait";
      p.duration = 4000;
    }
  };
  switch (family) {
    case "tap": {
      const n = integer(1, 5, r);
      count(n, `Нажми ровно ${num(n)}.`);
      break;
    }
    case "restraint":
      count(
        0,
        pick(
          [
            "Не нажимай. Просто дождись конца.",
            "Самое сложное — ничего не делать. Не нажимай.",
            "Пропусти этот уровень: не трогай кнопку.",
          ],
          r,
        ),
        "Нажимать не нужно. Нужно было дождаться конца таймера.",
      );
      break;
    case "sum": {
      const a = integer(1, 4, r),
        b = integer(1, 4, r);
      count(
        a + b,
        `Нажми столько раз: ${a} + ${b}.`,
        `${a} + ${b} = ${a + b}. Нужно было нажать ${a + b} раз.`,
      );
      break;
    }
    case "subtract": {
      const a = integer(5, 9, r),
        b = integer(1, 4, r);
      count(
        a - b,
        `Нажми столько раз: ${a} − ${b}.`,
        `${a} − ${b} = ${a - b}. Нужно было нажать ${a - b} раз.`,
      );
      break;
    }
    case "multiply": {
      const a = integer(2, 3, r),
        b = integer(2, 3, r);
      count(
        a * b,
        `Нажми столько раз: ${a} × ${b}.`,
        `${a} × ${b} = ${a * b}. Нужно было нажать ${a * b} раз.`,
      );
      break;
    }
    case "parity": {
      const n = integer(11, 49, r),
        even = r() < 0.5;
      const yes = n % 2 === (even ? 0 : 1);
      count(
        yes ? 1 : 0,
        `Нажми один раз, если число ${even ? "чётное" : "нечётное"}. Иначе не нажимай.`,
        `${n} — ${n % 2 ? "нечётное" : "чётное"} число. ${yes ? "Нужно было нажать один раз." : "Нажимать не нужно."}`,
      );
      p.display = String(n);
      break;
    }
    case "comparison": {
      const a = integer(2, 9, r),
        b = integer(2, 9, r);
      count(
        a > b ? 1 : 0,
        "Нажми один раз, если слева больше. Иначе не нажимай.",
        `${a} ${a > b ? ">" : "≤"} ${b}. ${a > b ? "Нужно было нажать один раз." : "Нажимать не нужно."}`,
      );
      p.display = `${a} · ${b}`;
      break;
    }
    case "equation": {
      const a = integer(1, 4, r),
        b = integer(1, 4, r),
        c = a + b + (r() < 0.5 ? 0 : 1);
      count(
        c === a + b ? 1 : 0,
        "Нажми один раз, только если равенство верное.",
        `${a} + ${b} = ${a + b}. ${c === a + b ? "Равенство верное: одно нажатие." : "Равенство неверное: без нажатий."}`,
      );
      p.display = `${a} + ${b} = ${c}`;
      break;
    }
    case "symbols": {
      const target = pick(["●", "▲", "■"], r),
        n = integer(2, 5, r);
      const others = ["●", "▲", "■"].filter((x) => x !== target);
      p.display = shuffled(
        [
          ...Array(n).fill(target),
          ...Array.from({ length: integer(2, 4, r) }, () => pick(others, r)),
        ],
        r,
      ).join(" ");
      count(
        n,
        `Нажми по одному разу за каждый ${target}.`,
        `В строке ${n} знаков ${target}. Нужно было нажать ${n} раз.`,
      );
      break;
    }
    case "letters": {
      const word = pick(
        [
          "МОЛОКО",
          "БАНАН",
          "АНАНАС",
          "МАКАРОНЫ",
          "КОКОС",
          "САХАР",
          "БАРАБАН",
          "ОБОРОТ",
        ],
        r,
      );
      const letter = pick([...new Set([...word])], r),
        n = [...word].filter((x) => x === letter).length;
      count(
        n,
        `Нажми по одному разу за каждую букву «${letter}».`,
        `В слове «${word}» буква «${letter}» встречается ${n} раз.`,
      );
      p.display = word;
      break;
    }
    case "memory": {
      const n = integer(2, 5, r);
      count(n, "Запомни точки. Когда они исчезнут, нажми столько же раз.");
      p.display = Array(n).fill("●").join(" ");
      p.revealAt = 1800;
      p.from = 1800;
      p.duration = 8500;
      p.explanation = `Было ${n} точек. Нажимать нужно после их исчезновения, ${n} раз.`;
      break;
    }
    case "delay": {
      const n = integer(2, 3, r);
      p.kind = "window";
      p.from = n * 1000;
      p.to = 7000;
      p.duration = 7000;
      p.prompt = `Подожди ${n} секунды от начала уровня. Потом нажми один раз.`;
      p.explanation = `Нужно было подождать ${n} секунды и нажать один раз.`;
      break;
    }
    case "window": {
      const n = integer(2, 4, r);
      p.kind = "window";
      p.from = n * 1000;
      p.to = (n + 1) * 1000;
      p.duration = (n + 2) * 1000;
      p.prompt = `Нажми один раз между ${n} и ${n + 1} секундами.`;
      p.explanation = `Нажатие засчитывается от ${n} до ${n + 1} секунды по счётчику «Прошло».`;
      break;
    }
    case "hold": {
      const n = integer(1, 3, r);
      p.kind = "hold";
      p.from = n * 1000 - 300;
      p.to = n * 1000 + 400;
      p.duration = 8000;
      p.prompt = `Зажми на ${n} ${n === 1 ? "секунду" : "секунды"}, затем отпусти.`;
      p.explanation = `Нужно было удерживать примерно ${n} ${n === 1 ? "секунду" : "секунды"} и отпустить. Допуск: −0,3 / +0,4 секунды.`;
      break;
    }
    case "release":
      p.kind = "release";
      p.from = integer(18, 30, r) * 100;
      p.to = p.from + 1200;
      p.duration = 8500;
      p.prompt = "Зажми. Отпусти, когда появится «ОТПУСТИ».";
      p.explanation =
        "Нужно было зажать кнопку, дождаться надписи «ОТПУСТИ» и отпустить в течение 1,2 секунды.";
      break;
    case "signal":
      p.kind = "window";
      p.from = integer(25, 40, r) * 100;
      p.to = p.from + 1400;
      p.duration = p.to + 800;
      p.prompt = "Нажми один раз, когда появится «ЖМИ». Не раньше.";
      p.signal = "ЖМИ";
      p.explanation =
        "Нужно было дождаться надписи «ЖМИ» и нажать, пока она видна.";
      break;
    case "double":
      p.kind = "double";
      p.count = 2;
      p.to = 600;
      p.prompt = "Нажми дважды с паузой не больше 0,6 секунды.";
      p.explanation =
        "Нужны два нажатия подряд, между ними не больше 0,6 секунды.";
      break;
    case "negation":
      count(
        1,
        pick(
          [
            "Не оставляй кнопку без нажатия. Нажми один раз.",
            "Не нажать — ошибка. Нужно одно нажатие.",
            "Нажми не дважды, а один раз.",
          ],
          r,
        ),
      );
      break;
    case "digits": {
      const n = integer(1000, 99999, r);
      count(
        String(n).length,
        "Нажми столько раз, сколько цифр в числе.",
        `В числе ${n} — ${String(n).length} цифр.`,
      );
      p.display = String(n);
      break;
    }
    case "word": {
      const yes = r() < 0.5;
      p.display = yes ? "ЖМИ" : "ЖДИ";
      count(
        yes ? 1 : 0,
        "Читай слово: «ЖМИ» — одно нажатие. «ЖДИ» — ни одного.",
        `Было написано «${p.display}». ${yes ? "Нужно одно нажатие." : "Нажимать не нужно."}`,
      );
      break;
    }
  }
  p.id = [family, p.count, p.from, p.to, p.display ?? "", p.prompt].join("|");
  return p;
}
export function makePressDeck(
  r = Math.random,
  recent: string[] = [],
): PressLevel[] {
  const deck: PressLevel[] = [];
  const append = (family: PressFamily) => {
    let p = makePressLevel(family, deck.length, r);
    for (
      let i = 0;
      i < 30 && (recent.includes(p.id) || deck.some((x) => x.id === p.id));
      i++
    )
      p = makePressLevel(family, deck.length, r);
    deck.push(p);
  };
  // The warm-up changes too; it teaches the input without a fixed sequence.
  for (const f of shuffled<PressFamily>(["tap", "sum", "restraint"], r))
    append(f);
  const pool = shuffled([...PRESSURE_FAMILIES], r);
  for (const f of pool)
    if (f !== deck.at(-1)?.family) append(f);
    else {
      const other = pool.find((x) => x !== f)!;
      append(other);
      append(f);
    }
  while (deck.length < PRESSURE_LEVELS) {
    const f = pick(
      [...PRESSURE_FAMILIES].filter((x) => x !== deck.at(-1)?.family),
      r,
    );
    append(f);
  }
  return deck.slice(0, PRESSURE_LEVELS);
}
export function judgePress(
  level: PressLevel,
  events: PressEvent[],
  elapsed: number,
): PressVerdict {
  const fail = (reason: string): PressVerdict => ({
    status: "failure",
    reason,
  });
  if (!Number.isFinite(elapsed) || elapsed < 0 || events.length > 40)
    return fail("Некорректная попытка.");
  let held: number | null = null,
    taps = 0,
    lastUp = -Infinity,
    lastAt = -1;
  for (const e of events) {
    if (
      !e ||
      !["down", "up"].includes(e.type) ||
      !Number.isFinite(e.at) ||
      e.at < lastAt ||
      e.at < 0 ||
      e.at > elapsed
    )
      return fail("Некорректная последовательность нажатий.");
    lastAt = e.at;
    if (e.at >= level.duration) return fail("Время вышло.");
    if (e.type === "down") {
      if (held !== null) return fail("Лишнее нажатие.");
      held = e.at;
      if (level.kind === "wait") return fail("Здесь нажимать не нужно.");
      if (e.at < level.from && !["hold", "release"].includes(level.kind))
        return fail("Слишком рано.");
      if (level.kind === "window" && e.at >= level.to)
        return fail("Нужный момент уже прошёл.");
      if (level.kind === "double" && taps === 1 && e.at - lastUp > level.to)
        return fail("Между нажатиями прошло больше 0,6 секунды.");
      if (taps >= level.count && !["hold", "release"].includes(level.kind))
        return fail("Одно нажатие оказалось лишним.");
    } else {
      if (held === null) return fail("Кнопка не была зажата.");
      const duration = e.at - held;
      held = null;
      taps++;
      lastUp = e.at;
      if (["hold", "release"].includes(level.kind)) {
        if (duration < level.from) return fail("Отпустил слишком рано.");
        if (duration > level.to) return fail("Отпустил слишком поздно.");
      }
    }
  }
  if (
    ["hold", "release"].includes(level.kind) &&
    held !== null &&
    elapsed - held > level.to
  )
    return fail("Кнопка зажата слишком долго.");
  if (
    held === null &&
    taps === level.count &&
    level.kind !== "wait" &&
    (elapsed - lastAt >= 400 || elapsed >= level.duration)
  )
    return { status: "success" };
  if (elapsed >= level.duration)
    return level.kind === "wait" && !events.length
      ? { status: "success" }
      : fail("Время вышло.");
  return { status: "playing" };
}
export function replayPressRun(levels: PressLevel[], traces: PressTrace[]) {
  if (
    !Array.isArray(traces) ||
    traces.length < 1 ||
    traces.length > PRESSURE_LEVELS
  )
    throw new Error("Некорректная попытка");
  let cleared = 0;
  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    if (
      !trace ||
      !Array.isArray(trace.events) ||
      trace.elapsed > levels[i].duration + 2000
    )
      throw new Error("Некорректное время уровня");
    const verdict = judgePress(levels[i], trace.events, trace.elapsed);
    if (verdict.status === "playing")
      throw new Error("Уровень ещё не закончен");
    if (verdict.status === "failure") {
      if (i !== traces.length - 1)
        throw new Error("Попытка продолжается после ошибки");
      return {
        score: cleared,
        cleared,
        total: PRESSURE_LEVELS,
        reason: verdict.reason,
      };
    }
    cleared++;
  }
  if (cleared !== PRESSURE_LEVELS) throw new Error("Попытка ещё не закончена");
  return { score: cleared, cleared, total: PRESSURE_LEVELS };
}
export const PRESSURE_KEY = "playne:pressure:v1";
export type PressStats = { best: number; played: number; recent: string[] };
export function readPressStats(): PressStats {
  try {
    const s = JSON.parse(localStorage.getItem(PRESSURE_KEY) ?? "null");
    return {
      best:
        Number.isInteger(s?.best) && s.best >= 0 && s.best <= PRESSURE_LEVELS
          ? s.best
          : 0,
      played: Number.isInteger(s?.played) && s.played >= 0 ? s.played : 0,
      recent: Array.isArray(s?.recent)
        ? s.recent.filter((x: unknown) => typeof x === "string").slice(0, 90)
        : [],
    };
  } catch {
    return { best: 0, played: 0, recent: [] };
  }
}
export function savePressStats(stats: PressStats) {
  try {
    localStorage.setItem(PRESSURE_KEY, JSON.stringify(stats));
  } catch {
    /* Keep the run playable without storage. */
  }
}
