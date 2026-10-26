import { GuestSavedNotice, GuestTrialPrompt, useGuestTrial } from "./account";
import { GameIntro } from "./GameIntro";
import { useRankedRun, SaveResult } from "./account";
import FooterLinks from "./FooterLinks";
import { CIRCLE_GOALS, reachGoal } from "./analytics";
import { createCircleTracker } from "./gameAnalytics";
import { useRef, useState, type PointerEvent } from "react";
import { GameHeader } from "./SiteHeader";
import {
  circlePercent,
  evaluateCircle,
  readCircleBest,
  saveCircleBest,
  type CirclePoint,
  type CircleResult,
} from "./circle";
import "./circle.css";

type Stroke = { id: number; points: CirclePoint[] };

export default function CircleGame() {
  const access = useGuestTrial("circle");
  const ranked = useRankedRun("circle");
  const [path, setPath] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<CircleResult | null>(null);
  const [best, setBest] = useState(readCircleBest);
  const [record, setRecord] = useState(false);
  const stroke = useRef<Stroke | null>(null);
  const board = useRef<SVGSVGElement>(null);
  const rules = useRef<HTMLDialogElement>(null);
  const [analytics] = useState(createCircleTracker);

  function clear() {
    analytics.finish({ valid: false, message: "" }, 0, "reset");
    stroke.current = null;
    setPath("");
    setDrawing(false);
    setResult(null);
    setRecord(false);
  }
  function cancel(
    message = "Линия прервалась. Попробуй ещё раз.",
    reason = "interrupted",
  ) {
    analytics.finish({ valid: false, message }, 0, reason);
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
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      stroke.current ||
      access.loading ||
      !access.ready ||
      access.blocked ||
      (!access.user && result?.valid)
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = point(event, rect);
    analytics.start(event.pointerType || "unknown");
    if (Math.hypot(start.x - 300, start.y - 300) < 40) {
      analytics.finish({ valid: false, message: "" }, 0, "start_near_center");
      clear();
      setResult({
        valid: false,
        message: "Начни подальше от точки и обведи её.",
      });
      return;
    }
    void ranked.begin();
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = { id: event.pointerId, points: [start] };
    setResult(null);
    setRecord(false);
    setDrawing(true);
    setPath(`M${start.x.toFixed(2)},${start.y.toFixed(2)}`);
  }
  function append(event: PointerEvent<SVGSVGElement>) {
    const current = stroke.current;
    if (!current || current.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Map into the current SVG coordinates even if scrolling or reflow moves it.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const batch = events.length ? events : [event];
    let fragment = "";
    for (const item of batch) {
      const next = point(item, rect);
      if (next.x < 2 || next.x > 598 || next.y < 2 || next.y > 598) {
        cancel("Круг вышел за поле. Попробуй чуть меньше.", "outside_board");
        return;
      }
      const last = current.points[current.points.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) < 0.8) continue;
      current.points.push(next);
      fragment += ` L${next.x.toFixed(2)},${next.y.toFixed(2)}`;
      // Bound memory for an indefinitely held pointer.
      if (current.points.length > 12000) {
        cancel("Слишком длинная линия. Начни заново.", "too_long");
        return;
      }
    }
    if (fragment) setPath((previous) => previous + fragment);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (stroke.current?.id !== event.pointerId) return;
    append(event);
    complete();
  }
  function interrupt(event: PointerEvent<SVGSVGElement>) {
    if (stroke.current?.id !== event.pointerId) return;
    // A cancelled event need not contain a usable endpoint. Judge the line
    // already drawn instead of discarding a completed circle.
    complete(true);
  }
  function complete(interrupted = false) {
    const current = stroke.current;
    if (!current) return;
    const normalized = current.points.map((p) => ({
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
    }));
    const next = evaluateCircle(normalized);
    if (interrupted && !next.valid) {
      cancel();
      return;
    }
    // Clear before capture is implicitly released, so a second ending event
    // cannot score or submit this attempt twice.
    stroke.current = null;
    setDrawing(false);
    setResult(next);
    const previous = Math.max(best, readCircleBest());
    analytics.finish(next, previous);
    if (next.valid) {
      ranked.submit(0, { points: normalized });
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
      <GameHeader />
      <main id="circle-main" className="circle-main game-start-main">
        <GameIntro
          title="Круг"
          eyebrow="ОДНА ЛИНИЯ. ИДЕАЛЬНЫЙ КРУГ."
          description="Обведи точку одним движением. Насколько ровно получится?"
          descriptionId="circle-instructions"
          record={{ value: best, unit: "%" }}
          onRules={() => {
            rules.current?.showModal();
            reachGoal(CIRCLE_GOALS.rulesOpen);
          }}
        />
        <GuestSavedNotice game="circle" />
        {!access.ready && !access.loading && (
          <p role="status">
            Не удалось проверить доступ.{" "}
            <button
              className="text-button"
              onClick={() => void access.refresh()}
            >
              Попробовать ещё раз
            </button>
          </p>
        )}
        {access.ready && !access.user && !success && (
          <p className="guest-trial-caption">
            {access.blocked
              ? "Первая попытка уже сыграна."
              : "Первая попытка — без входа. Дальше — бесплатно через Яндекс."}
          </p>
        )}
        {access.loading ? (
          <p role="status">Проверяем доступ…</p>
        ) : !access.ready ? null : access.blocked && !success ? (
          <GuestTrialPrompt game="circle" />
        ) : (
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
                onPointerCancel={interrupt}
                onLostPointerCapture={interrupt}
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
              {(access.user || !success) && (
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
              )}
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
                <span>Без таймера. Обведи точку одним движением.</span>
              )}
            </div>
          </section>
        )}
        <dialog
          ref={rules}
          className="color-rules-dialog"
          aria-labelledby="circle-rules-title"
        >
          <div className="dialog-top">
            <h2 id="circle-rules-title">Как играть в «Круг»</h2>
            <button
              className="close-button"
              aria-label="Закрыть правила"
              onClick={() => rules.current?.close()}
            >
              ×
            </button>
          </div>
          <p>
            Чем ровнее расстояние от линии до точки, тем выше результат. Круг
            нужно замкнуть: обведи точку один раз и отпусти. Размер круга и
            скорость рисования на оценку не влияют.
          </p>
          <p>
            Пунктир после попытки показывает идеальный круг твоего размера.
            Рекорд хранится в этом браузере.
          </p>
          <button className="primary" onClick={() => rules.current?.close()}>
            Понятно
          </button>
        </dialog>
        {success && <SaveResult run={ranked} game="circle" />}
      </main>
      <footer className="circle-footer">
        <span>Одна попытка — несколько секунд.</span>
        <a href="/naglaz/">Попробовать «На глаз» ↗</a>
        <FooterLinks />
      </footer>
    </div>
  );
}
