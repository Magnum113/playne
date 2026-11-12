import { useRef, type PointerEvent } from "react";
import { PERCEPTION_COUNTDOWN_MS, trackPoint, type PerceptionTask, type PerceptionAnswer } from "./perception";

import { RHYTHM_CUE_START, RHYTHM_GUIDED_TAPS } from "./perceptionRhythm";

export default function PerceptionBoard({
  task, elapsed, value, locked, onChange, onCommit, onTap, result, guidedCount, solo, tapCount,
}: {
  task: PerceptionTask; elapsed: number; value: number | null; onChange: (value: number) => void;
  locked: boolean;
  onCommit: (value: number) => void;
  onTap: () => void;
  result?: PerceptionAnswer;
  guidedCount: number;
  solo: boolean;
  tapCount: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const editable = !result && !locked && (
    task.kind === "angle" || task.kind === "split" ||
    (task.kind === "track" && elapsed >= task.flightMs * task.visibleFraction)
  );
  function pointerValue(event: PointerEvent<SVGSVGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (task.kind === "angle") {
      if (Math.hypot(x - 300, y - 180) < 18) return null;
      return (Math.atan2(180 - y, x - 300) * 180 / Math.PI + 360) % 360;
    }
    return Math.max(0, Math.min(1, (x - 40) / 520));
  }
  function previewPointer(event: PointerEvent<SVGSVGElement>) {
    if (!editable || !event.isPrimary) return;
    const hoveringSplit = task.kind === "split" && event.pointerType === "mouse";
    if (!hoveringSplit && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = pointerValue(event);
    if (next !== null) onChange(next);
  }
  const tempoInteractive = task.kind === "tempo" && !result && !locked;
  const pos = (n: number) => 40 + n * 520;
  const ray = (angle: number, color: string, dashed = false) => <line x1="300" y1="180" x2={300 + 128 * Math.cos(angle * Math.PI / 180)} y2={180 - 128 * Math.sin(angle * Math.PI / 180)} stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={dashed ? "7 6" : undefined} />;
  const mark = (n: number, color: string, y: number, correct = false) => <g>
    <line x1={pos(n)} x2={pos(n)} y1={y - 34} y2={y + 18} stroke={color} strokeWidth="3" strokeDasharray={correct ? "5 4" : undefined} />
    <circle cx={pos(n)} cy={y} r="8" fill={color} stroke="var(--panel)" strokeWidth="3" />
  </g>;
  const countingDown = !result && elapsed < PERCEPTION_COUNTDOWN_MS;
  const dotTime = Math.max(0, elapsed - PERCEPTION_COUNTDOWN_MS);
  return <div className={`perception-board perception-board--${task.kind}${editable || tempoInteractive ? " is-interactive" : ""}`}>
    <svg ref={svg} viewBox="0 0 600 360" aria-hidden="true"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        if (tempoInteractive) { onTap(); return; }
        if (!editable) return;
        const next = pointerValue(event);
        if (next === null) return;
        if (task.kind === "track") onCommit(next);
        else {
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange(next);
        }
      }}
      onPointerEnter={previewPointer}
      onPointerMove={previewPointer}
      onPointerUp={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (!editable) return;
        const next = pointerValue(event) ?? value;
        if (next !== null) onCommit(next);
      }}>
      {task.kind === "count" && (countingDown
        ? <text x="300" y="195" className="perception-question">{Math.ceil((PERCEPTION_COUNTDOWN_MS - elapsed) / 650)}</text>
        : task.dots.map((dot, i) => <circle key={i}
          cx={pos(dot.x) + (task.moving && !result ? Math.sin(dotTime / 350 + dot.phase) * 5 : 0)}
          cy={35 + dot.y * 290 + (task.moving && !result ? Math.cos(dotTime / 400 + dot.phase) * 5 : 0)} r={dot.r * 600} fill="var(--purple)" />))}
      {task.kind === "track" && <>
        <line x1="40" y1="300" x2="560" y2="300" stroke="var(--line-strong)" strokeWidth="3" />
        {[0, 1].map(n => <line key={n} x1={pos(n)} x2={pos(n)} y1="290" y2="310" stroke="var(--line-strong)" strokeWidth="3" />)}
        {(result || elapsed < task.flightMs * task.visibleFraction) && (() => {
          const p = trackPoint(task, Math.min(elapsed / task.flightMs, task.visibleFraction));
          return <circle cx={pos(p.x)} cy={20 + p.y * 333} r="11" fill="var(--purple)" />;
        })()}
        {result && <path d={Array.from({ length: 31 }, (_, i) => { const p = trackPoint(task, i / 30); return `${i ? "L" : "M"}${pos(p.x)},${20 + p.y * 333}`; }).join(" ")} fill="none" stroke="var(--mint)" strokeWidth="2" strokeDasharray="6 5" />}
        {value !== null && mark(value, "var(--purple)", 300)}
        {result && !result.skipped && mark(result.actual, "var(--mint)", 300, true)}
        {!result && elapsed >= task.flightMs * task.visibleFraction && value === null && <text x="300" y="170" className="perception-board-text">Где приземлится шар?</text>}
      </>}
      {task.kind === "angle" && <>
        <circle cx="300" cy="180" r="128" fill="none" stroke="var(--line)" strokeWidth="2" />
        <line x1="300" y1="180" x2="448" y2="180" stroke="var(--line-strong)" strokeWidth="3" />
        <path d="M365 160A68 68 0 0 0 335 123m0 0 2 14m-2-14 14-2" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
        {ray(value ?? task.initial, "var(--purple)")}
        {result && !result.skipped && ray(result.actual, "var(--mint)", true)}
        <circle cx="300" cy="180" r="7" fill="var(--text)" />
      </>}
      {task.kind === "split" && <>
        <line x1="40" y1="190" x2="560" y2="190" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
        {value !== null && <rect
          className="perception-split-selection"
          x={pos(task.fromRight ? value : 0)}
          y="184"
          width={task.fromRight ? pos(1) - pos(value) : pos(value) - pos(0)}
          height="12"
          fill="var(--purple)"
          fillOpacity=".35"
        />}
        {[0, 1].map(n => <line key={n} x1={pos(n)} x2={pos(n)} y1="177" y2="203" stroke="var(--line-strong)" strokeWidth="3" />)}
        <text x={task.fromRight ? 560 : 40} y="240" textAnchor={task.fromRight ? "end" : "start"} className="perception-edge">{task.fromRight ? "← Отсюда" : "Отсюда →"}</text>
        {value !== null && mark(value, "var(--purple)", 190)}
        {result && !result.skipped && mark(result.actual, "var(--mint)", 190, true)}
      </>}
      {task.kind === "tempo" && (() => {
        const period = 60000 / task.bpm;
        const pulse = !solo && guidedCount < RHYTHM_GUIDED_TAPS && elapsed >= RHYTHM_CUE_START &&
          (elapsed - RHYTHM_CUE_START) % period < Math.min(180, period / 3);
        if (result) {
          if (!result.rhythm) return null;
          const { offsets } = result.rhythm;
          const scale = Math.max(150, ...offsets.map(Math.abs));
          return <>
            <text x="300" y="70" className="perception-board-text">Точность твоих нажатий</text>
            <text x="24" y="146" className="perception-edge">Раньше</text>
            <text x="24" y="254" className="perception-edge">Позже</text>
            <line x1="95" x2="555" y1="195" y2="195" stroke="var(--line-strong)" strokeWidth="2" />
            {offsets.map((offset, index) => {
              const x = 108 + index * 61;
              return <g key={index}>
                <line x1={x} x2={x} y1="184" y2="206" stroke="var(--mint)" strokeWidth="3" strokeDasharray="5 4" />
                <circle cx={x} cy={195 + offset / scale * 66} r="8" fill="var(--purple)" />
              </g>;
            })}
          </>;
        }
        return <>
          <circle cx="300" cy="155" r={pulse ? 58 : 47} fill={pulse ? "var(--mint)" : "var(--mint-tint)"} />
          <text x="300" y="170" className={`perception-beat${pulse ? " is-lit" : ""}`}>
            {solo ? tapCount : guidedCount}
          </text>
          <text x="300" y="245" className="perception-board-text">
            {solo ? "Продолжай без метронома" : "Нажимай в такт"}
          </text>
        </>;
      })()}
    </svg>
    {editable && <label className="sr-only">
      {task.kind === "angle" ? "Положение луча" : "Положение отметки"}
      <input type="range" min="0" max={task.kind === "angle" ? 360 : 1} step={task.kind === "angle" ? .25 : .002}
        value={value ?? (task.kind === "angle" ? task.initial : .5)} onChange={e => onChange(Number(e.target.value))}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(Number(event.currentTarget.value));
          }
        }} />
    </label>}
  </div>;
}
