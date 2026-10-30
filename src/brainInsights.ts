import type { BrainGameId, BrainMode } from "./brainContent";

export const BRAIN_INSIGHT_MIN_PREVIOUS = 3;
export type BrainInsightMetricKind =
  | "flash_recovery"
  | "rotate_accuracy"
  | "slide_extra_moves"
  | "dispatch_delivery";
export type BrainInsightMetric = {
  kind: BrainInsightMetricKind;
  label: string;
  /** Ratios use 0..1; slide uses total extra moves across the five boards. */
  current: number;
  baseline?: number;
  numerator: number;
  denominator: number;
  hints?: number;
};
export type BrainInsightResult = {
  status: "ready" | "insufficient" | "assisted" | "replay" | "unavailable";
  game: BrainGameId;
  mode: BrainMode | null;
  difficulty: number | null;
  metric: BrainInsightMetric | null;
  sample: { previous: number; required: number; missing: number };
  fact: string;
  nextStep: string;
  comparisonNote: string;
};

export const insightNumber = (number: number) =>
  number.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
export const insightPercent = (ratio: number) =>
  `${insightNumber(ratio * 100)}%`;
export function insightParties(count: number) {
  const last = count % 10,
    teen = count % 100;
  return last === 1 && teen !== 11
    ? "партия"
    : last >= 2 && last <= 4 && !(teen >= 12 && teen <= 14)
      ? "партии"
      : "партий";
}

export function currentInsightFact(metric: BrainInsightMetric): string {
  if (metric.kind === "flash_recovery")
    return `Восстановлено ${metric.numerator} из ${metric.denominator} клеток — ${insightPercent(metric.current)}.`;
  if (metric.kind === "rotate_accuracy")
    return `Верно определено ${metric.numerator} из ${metric.denominator} фигур.`;
  if (metric.kind === "dispatch_delivery")
    return `На свои станции приехало ${metric.numerator} из ${metric.denominator} поездов — ${insightPercent(metric.current)}.`;
  return `На пяти полях — ${insightNumber(metric.current)} лишних ходов относительно кратчайших маршрутов.`;
}

export function nextInsightTarget(
  metric: BrainInsightMetric,
  assisted = false,
): string {
  if (metric.kind === "slide_extra_moves")
    return assisted
      ? "Попробуй пройти партию на этой сложности без подсказок."
      : metric.current > 0
        ? "Попробуй убрать один лишний ход без подсказок."
        : "Попробуй повторить кратчайшие маршруты без подсказок.";
  if (metric.current >= 1)
    return "Попробуй повторить этот результат на той же сложности.";
  if (metric.kind === "flash_recovery")
    return "В следующей партии попробуй восстановить на одну клетку больше.";
  if (metric.kind === "rotate_accuracy")
    return "В следующей партии попробуй определить ещё одну фигуру верно.";
  return "В следующей волне попробуй доставить ещё один поезд на свою станцию.";
}
