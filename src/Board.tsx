import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { GameObject } from "./data";
import Silhouette from "./Silhouette";
import { resultLayout } from "./resultLayout";
import { clamp, MAX_RATIO, meters, score, errorLabel } from "./game";

function labelLines(name: string) {
  const lines: string[] = [];
  for (const word of name.split(" ")) {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last] + " " + word).length <= 22)
      lines[last] += " " + word;
    else lines.push(word);
  }
  return lines;
}
export default function Board({
  reference,
  target,
  ratio,
  revealed,
  onChange,
  onRevealComplete,
}: {
  reference: GameObject;
  target: GameObject;
  ratio: number;
  revealed: boolean;
  onChange: (v: number) => void;
  onRevealComplete: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 600);
  const [revealProgress, setRevealProgress] = useState(0);
  useEffect(() => {
    if (!revealed) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealProgress(1);
      onRevealComplete();
      return;
    }
    let frame: number;
    const started = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - started) / 1150);
      setRevealProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(animate);
      else onRevealComplete();
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [revealed, onRevealComplete]);
  const progress = revealed ? revealProgress : 0;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const gesture = useRef<{
    mode: "move" | "scale";
    x: number;
    y: number;
    ratio: number;
    offset: { x: number; y: number };
  } | null>(null);
  useEffect(() => {
    const m = matchMedia("(max-width: 599px)");
    const update = () => setNarrow(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  const W = narrow ? 420 : 840,
    H = 390,
    horizontal = reference.axis === "x";
  const lane = W / 2 - 60;
  // Both dimensions share one ground line and two side-by-side lanes.
  // Reserve room for the largest allowed estimate without changing the scale
  // while the player resizes an object.
  const largestTargetScale = (reference.size * MAX_RATIO) / target.size;
  const initialK = Math.min(
    275 / reference.height,
    lane / reference.width,
    275 / (target.height * largestTargetScale),
    lane / (target.width * largestTargetScale),
  );
  const actual = target.size / reference.size;
  const result = resultLayout(reference, target, ratio, W);
  const k = initialK + (result.scale - initialK) * progress;
  const targetScale = (r: number) => ((reference.size * r) / target.size) * k;
  const s = targetScale(ratio),
    correct = targetScale(ratio + (actual - ratio) * progress);
  const baseY = 320;
  const originX = horizontal ? W * 0.52 : W * 0.72;
  const targetX = (scale: number) =>
    horizontal ? originX : originX - (target.width * scale) / 2;
  const safeOffset = {
    x: clamp(offset.x, 20 - targetX(s), W - 20 - targetX(s) - target.width * s),
    y: clamp(offset.y, 30 - (baseY - target.height * s), H - 30 - baseY),
  };
  const placedX = (scale: number) =>
    (targetX(scale) + safeOffset.x) * (1 - progress) +
    result.targetX * progress;
  const px = placedX(s) + (result.guessX - result.targetX) * progress,
    py = baseY - target.height * s + safeOffset.y * (1 - progress);
  const referenceCenter =
    W * 0.26 + (result.referenceCenter - W * 0.26) * progress;
  const referenceX = referenceCenter - (reference.width * k) / 2;
  const guess = reference.size * ratio;
  const points = score(guess, target.size);
  const point = (e: PointerEvent<SVGElement>) => {
    const ctm = svgRef.current?.getScreenCTM();
    return ctm
      ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
      : { x: 0, y: 0 };
  };
  function start(e: PointerEvent<SVGElement>, mode: "move" | "scale") {
    if (revealed || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = point(e);
    gesture.current = { mode, x: p.x, y: p.y, ratio, offset: safeOffset };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<SVGElement>) {
    const g = gesture.current;
    if (!g || revealed) return;
    const p = point(e);
    if (g.mode === "scale") {
      const d = horizontal ? p.x - g.x : g.y - p.y;
      onChange(clamp(g.ratio + d / (reference.size * k)));
    } else {
      const width = target.width * s,
        height = target.height * s;
      setOffset({
        x: clamp(
          g.offset.x + p.x - g.x,
          20 - targetX(s),
          W - 20 - targetX(s) - width,
        ),
        y: clamp(g.offset.y + p.y - g.y, 30 - (baseY - height), H - 30 - baseY),
      });
    }
  }
  function end() {
    gesture.current = null;
  }
  const handleX = px + target.width * s,
    handleY = py;
  const correctSilhouette = revealed && (
    <g
      className="correct-silhouette"
      color="var(--actual)"
      opacity={progress * 0.85}
    >
      <Silhouette
        object={target}
        scale={correct}
        x={placedX(correct)}
        y={baseY - target.height * correct + safeOffset.y * (1 - progress)}
      />
    </g>
  );
  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        className="board"
        viewBox={`0 0 ${W} ${H}`}
        aria-label={`Сравнение: ${reference.name} и ${target.name}`}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <defs>
          <pattern
            id="grid"
            width="35"
            height="35"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M35 0H0V35"
              fill="none"
              stroke="var(--grid)"
              strokeWidth=".65"
            />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />
        {!revealed && (
          <text x="24" y="29" className="board-caption">
            {horizontal ? "СРАВНИВАЕМ ДЛИНУ" : "СРАВНИВАЕМ ВЫСОТУ"}
          </text>
        )}
        <path
          d={`M20 ${baseY}H${W - 20}`}
          stroke="var(--line-strong)"
          strokeWidth="1"
          opacity=".5"
        />
        <g color="var(--mint)">
          <Silhouette
            object={reference}
            scale={k}
            x={referenceX}
            y={baseY - reference.height * k}
          />
        </g>
        {actual >= ratio && correctSilhouette}
        <g
          color="var(--purple)"
          className={revealed ? "" : "movable"}
          onPointerDown={(e) => start(e, "move")}
          onLostPointerCapture={end}
        >
          <Silhouette object={target} scale={s} x={px} y={py} opacity={1} />
          {!revealed && (
            <rect
              x={px - 8}
              y={py - 8}
              width={target.width * s + 16}
              height={target.height * s + 16}
              fill="transparent"
              stroke="var(--purple)"
              strokeOpacity=".3"
              strokeDasharray="3 5"
            />
          )}
        </g>
        {actual < ratio && correctSilhouette}
        {!revealed && (
          <g
            className="resize-handle"
            onPointerDown={(e) => start(e, "scale")}
            onLostPointerCapture={end}
            aria-label="Маркер изменения размера"
          >
            <circle
              cx={handleX}
              cy={handleY}
              r={narrow ? 32 : 23}
              fill="transparent"
            />
            <rect
              x={handleX - 10}
              y={handleY - 10}
              width="20"
              height="20"
              rx="5"
              fill="var(--purple)"
            />
            <path
              d={`m${handleX - 4} ${handleY + 4} 8-8m-6 0h6v6`}
              stroke="#151719"
              strokeWidth="1.5"
              fill="none"
            />
          </g>
        )}
        <path
          className="reference-guide"
          d={`M${referenceX + reference.width * k + 12} ${baseY - (horizontal ? reference.height : reference.size) * k}V${baseY}`}
          stroke="var(--mint)"
          strokeOpacity=".45"
          strokeDasharray="3 5"
          fill="none"
        />
        <text
          x={referenceCenter}
          y={baseY + 24}
          textAnchor="middle"
          className="object-name"
          fill="var(--mint)"
        >
          {labelLines(reference.name).map((line, i) => (
            <tspan key={i} x={referenceCenter} dy={i ? 16 : 0}>
              {line}
            </tspan>
          ))}
        </text>
        {revealed ? (
          <g
            className="comparison-guides"
            opacity={progress}
            pointerEvents="none"
          >
            {/* Each dimension stays outside the overlap, so thin silhouettes remain legible. */}
            <path
              data-guide="answer"
              d={
                horizontal
                  ? `M${placedX(correct)} ${baseY - target.height * correct - 6}v-6h${target.width * correct}v6`
                  : `M${placedX(correct) - 6} ${baseY - target.size * correct}h-6V${baseY}h6`
              }
              fill="none"
              stroke="var(--actual)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <path
              data-guide="guess"
              d={
                horizontal
                  ? `M${px} ${baseY + 4}v6h${target.width * s}v-6`
                  : `M${Math.max(px + s * target.width, placedX(correct) + correct * target.width) + 6} ${py + (target.height - target.size) * s}h6V${py + target.height * s}h-6`
              }
              fill="none"
              stroke="var(--purple)"
              strokeWidth="1.5"
            />
            <text
              x={result.targetX}
              y={baseY + 24}
              className="comparison-label"
              fill="var(--purple)"
            >
              Твой размер · {meters(guess)}
            </text>
            <text
              x={result.targetX}
              y={baseY + 46}
              className="comparison-label"
              fill="var(--actual)"
            >
              Правильный · {meters(target.size)}
            </text>
          </g>
        ) : (
          <text
            x={px + (target.width * s) / 2}
            y={py + target.height * s + 24}
            textAnchor="middle"
            className="object-name"
            fill="var(--purple)"
          >
            {labelLines(target.name).map((line, i) => (
              <tspan key={i} x={px + (target.width * s) / 2} dy={i ? 16 : 0}>
                {line}
              </tspan>
            ))}
          </text>
        )}
        {revealed && (
          <g
            className="board-result"
            opacity={Math.min(1, progress * 5)}
            aria-hidden="true"
            pointerEvents="none"
          >
            <rect
              x="15"
              y="14"
              width={narrow ? 216 : 238}
              height="139"
              rx="12"
              fill="var(--panel)"
              fillOpacity=".94"
            />
            <text
              x="29"
              y="69"
              fill="var(--purple)"
              fontSize="54"
              fontWeight="600"
              letterSpacing="-2"
            >
              {Math.round(points * progress)}
              <tspan fontSize="18" fill="var(--text)" letterSpacing="0">
                {" "}
                / 100
              </tspan>
            </text>
            <text x="29" y="95" className="result-measure" fill="var(--muted)">
              Твой размер:{" "}
              <tspan fill="var(--text)" fontWeight="600">
                {meters(guess)}
              </tspan>
            </text>
            <text x="29" y="117" className="result-measure" fill="var(--muted)">
              Правильный:{" "}
              <tspan fill="var(--text)" fontWeight="600">
                {meters(target.size)}
              </tspan>
            </text>
            <text x="29" y="139" className="result-error" fill="var(--muted)">
              {errorLabel(guess, target.size)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
