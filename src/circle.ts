export type CirclePoint = { x: number; y: number };
export type CircleResult =
  | { valid: true; score: number; radius: number }
  | { valid: false; message: string };

const CENTER = { x: 300, y: 300 };
export const CIRCLE_BEST_KEY = "playne:circle:v1";
const distance = (a: CirclePoint, b: CirclePoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

// Equal arc-length samples make the score independent of pointer event frequency
// and of how long the player pauses over a particular part of the circle.
export function evaluateCircle(points: readonly CirclePoint[]): CircleResult {
  const invalid = (message: string): CircleResult => ({
    valid: false,
    message,
  });
  if (
    points.length < 3 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return invalid("Нарисуй круг одним движением.");
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + distance(points[i], points[i - 1]));
  const length = lengths[lengths.length - 1];
  if (length < 200) return invalid("Нарисуй круг побольше.");
  const samples: CirclePoint[] = [];
  let segment = 1;
  for (let i = 0; i <= 360; i++) {
    const at = (length * i) / 360;
    while (segment < points.length - 1 && lengths[segment] < at) segment++;
    const span = lengths[segment] - lengths[segment - 1];
    const t = span > 0 ? (at - lengths[segment - 1]) / span : 0;
    const a = points[segment - 1],
      b = points[segment];
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  const radii = samples.map((p) => distance(p, CENTER));
  const radius = radii.reduce((a, b) => a + b, 0) / radii.length;
  if (radius < 45) return invalid("Нарисуй круг побольше.");
  if (Math.min(...radii) < 20)
    return invalid("Обведи точку, не проходя через неё.");
  let turn = 0,
    travel = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const delta =
      Math.atan2(b.y - 300, b.x - 300) - Math.atan2(a.y - 300, a.x - 300);
    const step = Math.atan2(Math.sin(delta), Math.cos(delta));
    turn += step;
    travel += Math.abs(step);
  }
  if (Math.abs(turn) > Math.PI * 2.3)
    return invalid("Одного оборота достаточно.");
  if (Math.abs(turn) < Math.PI * 1.8) return invalid("Обведи точку целиком.");
  const gap = distance(points[0], points[points.length - 1]);
  if (gap > radius * 0.3) return invalid("Замкни линию ближе к началу.");
  const backtracking = travel - Math.abs(turn);
  if (backtracking > 1) return invalid("Рисуй в одну сторону, без возвратов.");
  const deviation =
    Math.sqrt(
      radii.reduce((sum, r) => sum + (r - radius) ** 2, 0) / radii.length,
    ) / radius;
  const score =
    Math.round(
      1000 *
        Math.exp(-3 * deviation - (gap / radius) * 0.25 - backtracking * 0.2),
    ) / 10;
  return { valid: true, score: Math.min(100, Math.max(0, score)), radius };
}

export function readCircleBest(): number {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(CIRCLE_BEST_KEY) ?? "null",
    );
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
      ? value
      : 0;
  } catch {
    return 0;
  }
}

export function saveCircleBest(score: number): number {
  const previous = readCircleBest();
  if (!Number.isFinite(score) || score < 0 || score > 100) return previous;
  const best = Math.max(previous, score);
  try {
    localStorage.setItem(CIRCLE_BEST_KEY, JSON.stringify(best));
  } catch {
    /* Play remains available without storage. */
  }
  return best;
}

export const circlePercent = (score: number) =>
  `${score.toFixed(1).replace(".", ",")}%`;
