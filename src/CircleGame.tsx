import { useRef, useState, type PointerEvent } from "react";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import {
  circlePercent,
  evaluateCircle,
  readCircleBest,
  saveCircleBest,
  type CirclePoint,
  type CircleResult,
} from "./circle";
import "./circle.css";

type Stroke = { id: number; points: CirclePoint[]; rect: DOMRect };

export default function CircleGame() {
  const [path, setPath] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<CircleResult | null>(null);
  const [best, setBest] = useState(readCircleBest);
  const [record, setRecord] = useState(false);
  const stroke = useRef<Stroke | null>(null);
  const board = useRef<SVGSVGElement>(null);

  function clear() {
    stroke.current = null;
    setPath("");
    setDrawing(false);
    setResult(null);
    setRecord(false);
  }
  function cancel(message = "Линия прервалась. Попробуй ещё раз.") {
    stroke.current = null;
    setDrawing(false);
    setResult({ valid: false, message });
  }
  function point(
    event: { clientX: number; clientY: number },
    rect: DOMRect,
  ): CirclePoint {
    return {
      x: ((event.clientX - rect.left) * 600) / rect.width,
      y: ((event.clientY - rect.top) * 600) / rect.height,
    };
  }
  function begin(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary || event.button !== 0 || stroke.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = point(event, rect);
    if (Math.hypot(start.x - 300, start.y - 300) < 40) {
      clear();
      setResult({
        valid: false,
        message: "Начни подальше от точки и обведи её.",
      });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = { id: event.pointerId, points: [start], rect };
    setResult(null);
    setRecord(false);
    setDrawing(true);
    setPath(`M${start.x.toFixed(2)},${start.y.toFixed(2)}`);
  }
  function append(event: PointerEvent<SVGSVGElement>) {
    const current = stroke.current;
    if (!current || current.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      Math.abs(rect.width - current.rect.width) > 1 ||
      Math.abs(rect.top - current.rect.top) > 2
    ) {
      cancel();
      return;
    }
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const batch = events.length ? events : [event];
    let fragment = "";
    for (const item of batch) {
      const next = point(item, rect);
      if (next.x < 2 || next.x > 598 || next.y < 2 || next.y > 598) {
        cancel("Круг вышел за поле. Попробуй чуть меньше.");
        return;
      }
      const last = current.points[current.points.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) < 0.8) continue;
      current.points.push(next);
      fragment += ` L${next.x.toFixed(2)},${next.y.toFixed(2)}`;
      // Bound memory for an indefinitely held pointer.
      if (current.points.length > 12000) {
        cancel("Слишком длинная линия. Начни заново.");
        return;
      }
    }
    if (fragment) setPath((previous) => previous + fragment);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (stroke.current?.id !== event.pointerId) return;
    append(event);
    const current = stroke.current;
    if (!current) return;
    stroke.current = null;
    setDrawing(false);
    const next = evaluateCircle(current.points);
    setResult(next);
    if (next.valid) {
      const previous = Math.max(best, readCircleBest());
      setRecord(next.score > previous);
      setBest(Math.max(previous, saveCircleBest(next.score)));
    }
  }
  const success = result?.valid ? result : null;
  const message = drawing
    ? "Продолжай линию и вернись к началу."
    : result && !result.valid
      ? result.message
      : success
        ? record
          ? "Новый рекорд!"
          : success.score >= 95
            ? "Отличный круг."
            : "Ещё один круг?"
        : "Зажми мышь или веди пальцем по полю.";

  return (
    <div className="app circle-app">
      <a className="skip-link" href="#circle-main">
        Перейти к игре
      </a>
      <header className="header">
        <PlayneBrand />
        <nav className="game-header-actions" aria-label="Навигация">
          <a className="back-to-hub" href="/">
            ← Все игры
          </a>
          <ThemeToggle />
        </nav>
      </header>
      <main id="circle-main" className="circle-main">
        <div className="circle-heading">
          <div>
            <p className="eyebrow">ОДНА ЛИНИЯ. ИДЕАЛЬНЫЙ КРУГ.</p>
            <h1>
              Круг<span className="brand-dot">.</span>
            </h1>
            <p id="circle-instructions">
              Обведи точку одним движением. Насколько ровно получится?
            </p>
          </div>
          <div className="circle-best">
            <span>Твой рекорд</span>
            <strong>{best > 0 ? circlePercent(best) : "—"}</strong>
          </div>
        </div>
        <section className="circle-play" aria-label="Нарисовать круг">
          <div
            className={`circle-surface${drawing ? " is-drawing" : ""}${success ? " has-result" : ""}`}
          >
            <svg
              ref={board}
              className="circle-board"
              viewBox="0 0 600 600"
              role="img"
              tabIndex={0}
              aria-label="Поле для рисования круга вокруг центральной точки"
              aria-describedby="circle-instructions circle-status"
              onPointerDown={begin}
              onPointerMove={append}
              onPointerUp={finish}
              onPointerCancel={() => {
                if (stroke.current) cancel();
              }}
              onLostPointerCapture={() => {
                if (stroke.current) cancel();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") clear();
              }}
            >
              {success && (
                <circle
                  className="circle-guide"
                  cx="300"
                  cy="300"
                  r={success.radius}
                />
              )}
              {!success && (
                <>
                  <circle
                    className="circle-center-ring"
                    cx="300"
                    cy="300"
                    r="12"
                  />
                  <circle className="circle-center" cx="300" cy="300" r="4" />
                </>
              )}
              {path && (
                <path
                  className={`circle-stroke${result && !result.valid ? " invalid" : ""}`}
                  d={path}
                />
              )}
              {success && (
                <g className="circle-score" aria-hidden="true">
                  <text
                    x="300"
                    y="300"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    fontSize={Math.min(72, success.radius * 0.5)}
                  >
                    {circlePercent(success.score)}
                  </text>
                  <text
                    className="circle-score-caption"
                    x="300"
                    y={300 + Math.min(72, success.radius * 0.5) * 0.8}
                    textAnchor="middle"
                    fontSize={Math.min(18, success.radius * 0.18)}
                  >
                    точность
                  </text>
                </g>
              )}
            </svg>
            {!drawing && !path && !result && (
              <div className="circle-prompt" aria-hidden="true">
                <span>Начни с любой стороны</span>
                <span>и замкни круг вокруг точки</span>
              </div>
            )}
            <span className="circle-field-label" aria-hidden="true">
              {drawing
                ? "РИСУЕМ"
                : success
                  ? "ТВОЙ КРУГ"
                  : "БЕЗ ЛИНЕЙКИ И ЦИРКУЛЯ"}
            </span>
          </div>
          <div className="circle-feedback">
            <div
              className={`circle-status${record ? " is-record" : ""}`}
              id="circle-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {success && (
                <span className="sr-only">
                  Точность {circlePercent(success.score)}.{" "}
                </span>
              )}
              {message}
            </div>
            <button
              className="primary circle-retry"
              onClick={() => {
                clear();
                board.current?.focus({ preventScroll: true });
              }}
              disabled={drawing}
            >
              Ещё раз <span aria-hidden="true">↻</span>
            </button>
          </div>
          <div className="circle-legend" aria-hidden="true">
            {success ? (
              <>
                <span>
                  <i /> Твоя линия
                </span>
                <span>
                  <i className="ideal" /> Идеальный круг
                </span>
              </>
            ) : (
              <span>Без таймера. Попыток сколько угодно.</span>
            )}
          </div>
        </section>
        <details className="circle-rules">
          <summary>Как считается точность?</summary>
          <p>
            Чем ровнее расстояние от линии до точки, тем выше результат. Круг
            нужно замкнуть: обведи точку один раз и отпусти. Размер круга и
            скорость рисования на оценку не влияют.
          </p>
          <p>
            Пунктир после попытки показывает идеальный круг твоего размера.
            Рекорд хранится в этом браузере.
          </p>
        </details>
      </main>
      <footer className="circle-footer">
        <span>Одна попытка — несколько секунд.</span>
        <a href="/naglaz/">Попробовать «На глаз» ↗</a>
      </footer>
    </div>
  );
}
