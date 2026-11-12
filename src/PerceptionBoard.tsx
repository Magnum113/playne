import { useRef, type PointerEvent } from "react";
import { trackPoint, type PerceptionTask, type PerceptionAnswer } from "./perception";

export default function PerceptionBoard({ task, elapsed, value, onChange, result, taps = [] }: {
  task: PerceptionTask; elapsed: number; value: number | null; onChange: (value: number) => void;
  result?: PerceptionAnswer; taps?: number[];
}) {
  const svg = useRef<SVGSVGElement>(null);
  const editable = !result && ["track", "angle", "split"].includes(task.kind);
  const setPoint = (event: PointerEvent<SVGSVGElement>) => {
    if (!editable || !svg.current) return;
    if (task.kind === "track" && elapsed < task.flightMs * task.visibleFraction) return;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const { x, y } = point;
    if (task.kind === "angle") {
      if (Math.hypot(x - 300, y - 180) < 18) return;
      onChange((Math.atan2(180 - y, x - 300) * 180 / Math.PI + 360) % 360);
    } else onChange(Math.max(0, Math.min(1, (x - 40) / 520)));
  };
  const pos = (n: number) => 40 + n * 520;
  const ray = (angle: number, color: string, dashed = false) => <line x1="300" y1="180" x2={300 + 128 * Math.cos(angle * Math.PI / 180)} y2={180 - 128 * Math.sin(angle * Math.PI / 180)} stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={dashed ? "7 6" : undefined} />;
  const mark = (n: number, color: string, y: number, correct = false) => <g>
    <line x1={pos(n)} x2={pos(n)} y1={y - 34} y2={y + 18} stroke={color} strokeWidth="3" strokeDasharray={correct ? "5 4" : undefined} />
    <circle cx={pos(n)} cy={y} r="8" fill={color} stroke="var(--panel)" strokeWidth="3" />
  </g>;
  const countVisible = task.kind === "count" && (elapsed < task.durationMs || !!result);
  return <div className={`perception-board perception-board--${task.kind}${editable ? " is-interactive" : ""}`}>
    <svg ref={svg} viewBox="0 0 600 360" aria-hidden="true"
      onPointerDown={e => { if (editable) { e.currentTarget.setPointerCapture(e.pointerId); setPoint(e); } }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setPoint(e); }}
      onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>
      {task.kind === "count" && (countVisible ? task.dots.map((dot, i) => <circle key={i}
        cx={pos(dot.x) + (task.moving && !result ? Math.sin(elapsed / 350 + dot.phase) * 5 : 0)}
        cy={35 + dot.y * 290 + (task.moving && !result ? Math.cos(elapsed / 400 + dot.phase) * 5 : 0)} r={dot.r * 600} fill="var(--purple)" />)
        : <><circle cx="300" cy="154" r="42" fill="var(--purple-tint)" /><text x="300" y="169" className="perception-question">?</text><text x="300" y="234" className="perception-board-text">Сколько точек было?</text></>)}
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
        {[0, 1].map(n => <line key={n} x1={pos(n)} x2={pos(n)} y1="177" y2="203" stroke="var(--line-strong)" strokeWidth="3" />)}
        <text x={task.fromRight ? 560 : 40} y="240" textAnchor={task.fromRight ? "end" : "start"} className="perception-edge">{task.fromRight ? "← Отсюда" : "Отсюда →"}</text>
        {value !== null && mark(value, "var(--purple)", 190)}
        {result && !result.skipped && mark(result.actual, "var(--mint)", 190, true)}
      </>}
      {task.kind === "tempo" && (() => {
        const beat = 60000 / task.bpm;
        const cue = Math.floor((elapsed - 800) / beat);
        const pulse = elapsed >= 800 && cue < 4 && (elapsed - 800) % beat < 180;
        return <>
          {result ? <>
            <text x="300" y="70" className="perception-board-text">Точность твоих нажатий</text>
            {Array.from({ length: 8 }, (_, i) => <g key={i}>
              <line x1={70 + i * 65} x2={70 + i * 65} y1="150" y2="230" stroke="var(--mint)" strokeWidth="3" strokeDasharray="5 4" />
              {taps[i] !== undefined && <circle cx={70 + i * 65 + Math.max(-28, Math.min(28, (taps[i] - (800 + (4 + i) * beat)) / beat * 65))} cy="190" r="8" fill="var(--purple)" />}
            </g>)}
          </> : <>
            <circle cx="300" cy="155" r={pulse ? 58 : 47} fill={pulse ? "var(--mint)" : "var(--mint-tint)"} />
            <text x="300" y="170" className={`perception-beat${pulse ? " is-lit" : ""}`}>{elapsed < 800 ? "·" : cue < 4 ? cue + 1 : taps.length}</text>
            <text x="300" y="245" className="perception-board-text">{cue < 4 ? "Поймай ритм" : "Теперь продолжай сам"}</text>
          </>}
        </>;
      })()}
    </svg>
    {editable && task.kind !== "count" && task.kind !== "tempo" && <label className="sr-only">
      {task.kind === "angle" ? "Положение луча" : "Положение отметки"}
      <input type="range" min="0" max={task.kind === "angle" ? 360 : 1} step={task.kind === "angle" ? .25 : .002}
        value={value ?? (task.kind === "angle" ? task.initial : .5)} onChange={e => onChange(Number(e.target.value))} />
    </label>}
  </div>;
}
