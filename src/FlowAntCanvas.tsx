import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FlowTrip } from "./flowPresentation";
import {
  flowAntPose,
  flowPrepareJourney,
  type FlowJourneyShape,
} from "./flowAntPose";
import { flowWorkerAtlas, drawFlowWorker } from "./flowWorkerSprites";
const shapes = new WeakMap<
  FlowTrip,
  { speed: 1 | 2; shape: FlowJourneyShape }
>();
/** One transparent, high-DPI moving layer. The board remains crisp SVG. */
export function FlowAntCanvas({
  trips,
  epoch,
  speed,
  scale,
  pausedAt,
  viewBox,
  fallback,
}: {
  trips: FlowTrip[];
  epoch: number;
  speed: 1 | 2;
  scale: number;
  pausedAt?: number;
  viewBox: { x: number; y: number; width: number; height: number };
  fallback: ReactNode;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    [available, setAvailable] = useState(() => typeof Path2D !== "undefined");
  const bounds = useRef({
    x: viewBox.x - 64,
    y: viewBox.y - 64,
    right: viewBox.x + viewBox.width + 64,
    bottom: viewBox.y + viewBox.height + 64,
  });
  for (const trip of trips)
    for (const p of [...trip.outboundPoints, ...trip.returnPoints]) {
      bounds.current.x = Math.min(bounds.current.x, p.x - 64);
      bounds.current.y = Math.min(bounds.current.y, p.y - 64);
      bounds.current.right = Math.max(bounds.current.right, p.x + 64);
      bounds.current.bottom = Math.max(bounds.current.bottom, p.y + 64);
    }
  const b = bounds.current,
    x = b.x,
    y = b.y,
    width = b.right - x,
    height = b.bottom - y;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      if (typeof Path2D !== "undefined")
        ctx = canvas.getContext("2d", { alpha: true });
    } catch {
      /* Preserve SVG support in older embedded browsers. */
    }
    if (!ctx) {
      setAvailable(false);
      return;
    }
    const context = ctx;
    setAvailable(true);
    let raf = 0,
      disposed = false,
      density = 2;
    const size = () => {
      const rect = canvas.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr)),
        h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      density = Math.max(
        1,
        Math.min(4, Math.ceil(Math.max(w / width, h / height) * scale)),
      );
    };
    const draw = () => {
      if (disposed) return;
      raf = 0;
      const now = pausedAt ?? Math.max(0, performance.now() - epoch);
      context.setTransform(
        canvas.width / width,
        0,
        0,
        canvas.height / height,
        (-x * canvas.width) / width,
        (-y * canvas.height) / height,
      );
      context.clearRect(x, y, width, height);
      let pending = false;
      for (const trip of trips) {
        if (trip.deliveryAt <= now) continue;
        pending = true;
        if (trip.depart > now) continue;
        let saved = shapes.get(trip);
        if (!saved || saved.speed !== speed) {
          saved = { speed, shape: flowPrepareJourney(trip, speed) };
          shapes.set(trip, saved);
        }
        const pose = flowAntPose(trip, saved.shape, now, speed);
        if (!pose) continue;
        const atlas = flowWorkerAtlas(trip.color, density);
        context.save();
        context.translate(pose.x, pose.y);
        context.scale(scale, scale);
        if (pose.loaded) {
          context.save();
          context.globalAlpha = pose.shadowAlpha;
          context.scale(pose.shadowScale, pose.shadowScale);
          context.fillStyle = "#493823";
          context.beginPath();
          context.ellipse(0, 4, 15, 7, 0, 0, Math.PI * 2);
          context.fill();
          context.restore();
        }
        context.translate(0, pose.hopY);
        context.scale(pose.scaleX, pose.scaleY);
        context.globalAlpha = pose.alpha;
        context.rotate((pose.angle * Math.PI) / 180);
        if (!pose.loaded) {
          context.save();
          context.globalAlpha *= 0.12;
          context.fillStyle = "#62482a";
          context.beginPath();
          context.ellipse(0, 3, 12, 19, 0, 0, Math.PI * 2);
          context.fill();
          context.restore();
        }
        drawFlowWorker(context, atlas, pose.stride, pose.cargo);
        context.restore();
      }
      if (pending && pausedAt === undefined && !document.hidden)
        raf = requestAnimationFrame(draw);
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            size();
            if (!raf) draw();
          });
    observer?.observe(canvas);
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) draw();
    };
    document.addEventListener("visibilitychange", visibility);
    size();
    draw();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [trips, epoch, speed, scale, pausedAt, x, y, width, height]);
  return (
    <>
      {!available && fallback}
      {available && (
        <foreignObject
          className="flow-ant-canvas-layer"
          aria-hidden="true"
          x={x}
          y={y}
          width={width}
          height={height}
          style={{ pointerEvents: "none" }}
        >
          <canvas
            ref={ref}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
        </foreignObject>
      )}
    </>
  );
}
