import {
  memo,
  useLayoutEffect,
  useMemo,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  FLOW_COLORS,
  flowFrontier,
  initialFlow,
  makeFlowPuzzle,
  type FlowEvent,
  type FlowPuzzle,
} from "./flow";
import { flowMotion, type FlowMotion, type FlowTrip } from "./flowPresentation";
import { flowGeometry } from "./flowGeometry";
import { flowHomeHop, flowJourneyHeading } from "./flowPaths";

/** Shared character: the same little ant appears in previews and carries cubes. */
function AntFigure({
  color,
  carrying = false,
}: {
  color: number;
  carrying?: boolean;
}) {
  const paint = FLOW_COLORS[color];
  return (
    <g
      fill="none"
      className="flow-ant-figure"
      style={{ "--ant-delay": `${-color * 0.7}s` } as CSSProperties}
    >
      <g
        className="flow-ant-legs"
        stroke={paint.dark}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={
            carrying
              ? "m25 41-11 2-3 6m15-2-9 7 1 5"
              : "m25 35-9-3-5 5m14 4-11 2-3 6m15-2-9 7 1 5"
          }
        />
        <path
          d={
            carrying
              ? "m39 41 11 2 3 6m-15-2 9 7-1 5"
              : "m39 35 9-3 5 5m-14 4 11 2 3 6m-15-2 9 7-1 5"
          }
        />
      </g>
      <ellipse
        cx="32"
        cy="48"
        rx="11"
        ry="10"
        fill={paint.hex}
        stroke={paint.dark}
        strokeWidth="1.3"
      />
      <path
        d="M24 49q8 5 16 0"
        stroke={paint.dark}
        strokeWidth="2"
        opacity=".25"
      />
      <ellipse
        cx="32"
        cy="37"
        rx="7"
        ry="9"
        fill={paint.hex}
        stroke={paint.dark}
        strokeWidth="1.3"
      />
      <g
        className="flow-ant-feelers"
        stroke={paint.dark}
        strokeWidth="2.3"
        strokeLinecap="round"
      >
        <path d="M24 14Q24 5 16 4m24 10Q40 5 48 4" />
        <circle cx="15" cy="4" r="2.6" fill={paint.hex} />
        <circle cx="49" cy="4" r="2.6" fill={paint.hex} />
      </g>
      <ellipse
        cx="32"
        cy="23"
        rx="16"
        ry="14"
        fill={paint.hex}
        stroke={paint.dark}
        strokeWidth="1.3"
      />
      <path
        d="M21 17q3-5 9-5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity=".5"
      />
      <g className="flow-ant-eyes">
        <ellipse cx="25.5" cy="22" rx="5.5" ry="6.5" fill="#fffef3" />
        <ellipse cx="38.5" cy="22" rx="5.5" ry="6.5" fill="#fffef3" />
        <ellipse cx="27" cy="23" rx="2.8" ry="4" fill="#26362e" />
        <ellipse cx="37" cy="23" rx="2.8" ry="4" fill="#26362e" />
        <circle cx="28" cy="21.5" r="1.1" fill="white" />
        <circle cx="38" cy="21.5" r="1.1" fill="white" />
      </g>
      <ellipse cx="20" cy="29" rx="3.2" ry="1.8" fill="#ea798b" opacity=".55" />
      <ellipse cx="44" cy="29" rx="3.2" ry="1.8" fill="#ea798b" opacity=".55" />
      <path
        d="M28 30q4 4 8 0"
        stroke={paint.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {carrying && (
        <g>
          <path
            d="M18 27Q12 15 25 10m21 17Q52 15 39 10"
            stroke={paint.dark}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect x="24" y="-4" width="16" height="15" rx="3" fill={paint.dark} />
          <rect x="24" y="-6" width="16" height="15" rx="3" fill={paint.hex} />
          <path
            d="M27-3h10"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity=".65"
          />
        </g>
      )}
    </g>
  );
}
export function FlowAnt({
  color = 0,
  size = 48,
}: {
  color?: number;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="32" cy="60" rx="20" ry="3" fill="#09152a" opacity=".15" />
      <AntFigure color={color} />
    </svg>
  );
}

export function FlowCrate({
  color,
  count,
  concealed = false,
  blank = false,
}: {
  color: number;
  count: number;
  concealed?: boolean;
  blank?: boolean;
}) {
  const paint = concealed
    ? { hex: "#9396a5", dark: "#505365", ink: "#fffefa" }
    : FLOW_COLORS[color];
  return (
    <svg
      className="flow-crate"
      viewBox="0 0 76 76"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="7" y="10" width="62" height="61" rx="11" fill={paint.dark} />
      <rect
        className="flow-crate-lid"
        x="7"
        y="5"
        width="62"
        height="61"
        rx="11"
        fill={paint.hex}
      />
      <path
        d="M18 9h40"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".48"
      />
      {!blank && (
        <text
          x="38"
          y="49"
          textAnchor="middle"
          fontSize="33"
          fontWeight="850"
          fill={paint.ink ?? "white"}
          stroke={paint.dark}
          strokeWidth="2.7"
          paintOrder="stroke"
          fontFamily="inherit"
        >
          {concealed ? "?" : count}
        </text>
      )}
    </svg>
  );
}

/** A top-down worker faces up; CSS turns its entire body along the path. */
function WalkingAnt({
  color,
  loaded = false,
}: {
  color: number;
  loaded?: boolean;
}) {
  const paint = FLOW_COLORS[color];
  const gloss = useId();
  return (
    <g
      className="flow-worker-body"
      stroke={paint.dark}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <radialGradient id={gloss} cx="30%" cy="20%" r="85%">
          <stop offset="0" stopColor="#fffdf3" stopOpacity=".7" />
          <stop offset=".3" stopColor={paint.hex} />
          <stop offset="1" stopColor={paint.dark} />
        </radialGradient>
      </defs>
      <ellipse
        cy="3"
        rx="12"
        ry="19"
        fill="#62482a"
        stroke="none"
        opacity=".12"
      />
      <g className="flow-worker-stride">
        <g fill="none" strokeWidth="2.3">
          <path
            className="flow-worker-legs-a"
            d="m-4-6-9-7-5 2m22 12 10-1 4 5m-22 4-8 5-1 6"
          />
          <path
            className="flow-worker-legs-b"
            d="m4-6 9-7 5 2m-22 12-10-1-4 5m22 4 8 5 1 6"
          />
          <path d="m-5-15-4-8-5-3m19 11 4-8 5-3" strokeWidth="1.8" />
        </g>
        <ellipse
          cy="10"
          rx="7.5"
          ry="10"
          fill={`url(#${gloss})`}
          strokeWidth="1.2"
        />
        <path d="M-5 13q5 3 10 0" fill="none" opacity=".35" />
        <ellipse
          cy="-1"
          rx="5"
          ry="7"
          fill={`url(#${gloss})`}
          strokeWidth="1.2"
        />
        <ellipse
          cy="-12"
          rx="8.5"
          ry="7.8"
          fill={`url(#${gloss})`}
          strokeWidth="1.2"
        />
        <path
          d="M-5-15q2-3 5-3"
          stroke="white"
          strokeWidth="1.8"
          opacity=".5"
          fill="none"
        />
        <ellipse
          cx="-4"
          cy="-15"
          rx="2.2"
          ry="2.8"
          fill="#fffef4"
          stroke="none"
        />
        <ellipse
          cx="4"
          cy="-15"
          rx="2.2"
          ry="2.8"
          fill="#fffef4"
          stroke="none"
        />
        <circle cx="-4" cy="-16" r="1.2" fill="#34352f" stroke="none" />
        <circle cx="4" cy="-16" r="1.2" fill="#34352f" stroke="none" />
        <g
          className={`flow-worker-cargo${loaded ? " is-carrying" : ""}`}
          stroke="none"
        >
          <path d="M-11-40 4-45 15-38 0-33Z" fill={paint.hex} />
          <path d="M-11-40 0-33 0-17-11-24Z" fill={paint.dark} />
          <path d="M0-33 15-38 15-22 0-17Z" fill={paint.hex} />
          <path d="M-11-40 4-45 15-38 0-33Z" fill="white" opacity=".2" />
          <path d="M-7-39H7" stroke="white" strokeWidth="1.6" opacity=".6" />
        </g>
      </g>
    </g>
  );
}

/** Each journey owns its mount clock so appending work never restarts its phase. */
const FlowAntJourney = memo(function FlowAntJourney({
  trip,
  epoch,
  speed,
  scale,
  pausedAt,
}: {
  trip: FlowTrip;
  epoch: number;
  speed: 1 | 2;
  scale: number;
  pausedAt?: number;
}) {
  const mountedAt = useRef(Math.max(0, performance.now() - epoch));
  const outboundFacing = useRef<SVGGElement>(null),
    inboundFacing = useRef<SVGGElement>(null);
  const headings = useMemo(
    () => flowJourneyHeading(trip, speed),
    [
      trip.outboundPath,
      trip.returnPath,
      trip.outbound,
      trip.carry,
      trip.pickupPause,
      speed,
    ],
  );
  const hop = flowHomeHop(trip.carry, speed);
  useLayoutEffect(() => {
    const now = pausedAt ?? Math.max(0, performance.now() - epoch);
    const animate = (
      element: SVGGElement | null,
      frames: typeof headings.outbound,
      duration: number,
      start: number,
    ) => {
      if (!element?.animate) return;
      const animation = element.animate(
        frames.map(({ offset, transform }) => ({ offset, transform })),
        { duration, delay: start - now, easing: "linear", fill: "both" },
      );
      // Cancellation is normal during pause, retiming and unmounting.
      void animation.finished.catch(() => {});
      void animation.ready.catch(() => {});
      if (pausedAt !== undefined) animation.pause();
      return animation;
    };
    const outbound = animate(
      outboundFacing.current,
      headings.outbound,
      trip.outbound + trip.pickupPause,
      trip.depart,
    );
    const inbound = animate(
      inboundFacing.current,
      headings.inbound,
      trip.carry,
      trip.returnAt,
    );
    return () => {
      outbound?.cancel();
      inbound?.cancel();
    };
  }, [
    headings,
    epoch,
    pausedAt,
    trip.depart,
    trip.returnAt,
    trip.outbound,
    trip.pickupPause,
    trip.carry,
  ]);
  return (
    <g data-ant-id={trip.id}>
      <g
        className="flow-walking-ant"
        aria-hidden="true"
        data-trip="outbound"
        data-packet={trip.packet}
        data-cell={trip.cell}
        style={
          {
            offsetPath: `path('${trip.outboundPath}')`,
            offsetRotate: "0deg",
            "--walk-delay": `${trip.depart - mountedAt.current}ms`,
            "--walk-duration": `${trip.outbound}ms`,
            "--pickup-start": `${trip.arrive - mountedAt.current}ms`,
            "--pickup-time": `${trip.pickupPause}ms`,
            "--cargo-delay": `${trip.at - mountedAt.current}ms`,
            "--stride-time": `${260 / speed}ms`,
            "--visible-duration": `${trip.outbound + trip.pickupPause}ms`,
            "--step-repeats": Math.ceil(
              (trip.outbound + trip.pickupPause) / (260 / speed),
            ),
          } as CSSProperties
        }
      >
        <g transform={`scale(${scale})`}>
          <g
            ref={outboundFacing}
            className="flow-worker-facing"
            style={{ transform: headings.outbound[0].transform }}
          >
            <WalkingAnt color={trip.color} />
          </g>
        </g>
      </g>
      <g
        className="flow-walking-ant is-loaded"
        aria-hidden="true"
        data-trip="return"
        data-packet={trip.packet}
        data-cell={trip.cell}
        style={
          {
            offsetPath: `path('${trip.returnPath}')`,
            offsetRotate: "0deg",
            "--walk-delay": `${trip.returnAt - mountedAt.current}ms`,
            "--walk-duration": `${trip.carry}ms`,
            "--home-delay": `${trip.deliveryAt - mountedAt.current - hop}ms`,
            "--home-time": `${hop}ms`,
            "--stride-time": `${260 / speed}ms`,
            "--visible-duration": `${trip.carry}ms`,
            "--step-repeats": Math.ceil(trip.carry / (260 / speed)),
          } as CSSProperties
        }
      >
        <g transform={`scale(${scale})`}>
          <g className="flow-worker-home">
            <ellipse
              className="flow-worker-ground-shadow"
              cy="4"
              rx="15"
              ry="7"
              fill="#493823"
              opacity=".18"
            />
            <g className="flow-worker-hop">
              <g
                ref={inboundFacing}
                className="flow-worker-facing"
                style={{ transform: headings.inbound[0].transform }}
              >
                <WalkingAnt color={trip.color} loaded />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
});

/** A light clock updates only the colony, not the full painted cube layer. */
const FlowAntTraffic = memo(function FlowAntTraffic({
  trips,
  epoch,
  speed,
  scale,
  pausedAt,
}: {
  trips: FlowTrip[];
  epoch?: number;
  speed: 1 | 2;
  scale: number;
  pausedAt?: number;
}) {
  const fallbackEpoch = useRef(performance.now() - (trips[0]?.renderAt ?? 0));
  const origin = epoch ?? fallbackEpoch.current;
  const [, tick] = useState(0);
  const now = pausedAt ?? Math.max(0, performance.now() - origin);
  const pending = trips.some((trip) => trip.deliveryAt > now);
  useEffect(() => {
    if (!pending || pausedAt !== undefined) return;
    const timer = setInterval(() => tick((value) => value + 1), 80);
    return () => clearInterval(timer);
  }, [pending, origin, pausedAt]);
  return (
    <g className="flow-ant-traffic" aria-hidden="true">
      {trips
        .filter((trip) => trip.depart <= now + 200 && trip.deliveryAt > now)
        .map((trip) => (
          <FlowAntJourney
            key={trip.id}
            trip={trip}
            epoch={origin}
            speed={speed}
            scale={scale}
            pausedAt={pausedAt}
          />
        ))}
    </g>
  );
});

export const FlowScene = memo(function FlowScene({
  puzzle,
  cells,
  events = [],
  moving = false,
  preview = false,
  label,
  speed = 1,
  highlightColor,
  motion,
  revealHidden = false,
  epoch,
  pausedAt,
}: {
  puzzle: FlowPuzzle;
  cells: number[];
  events?: FlowEvent[];
  moving?: boolean;
  preview?: boolean;
  label?: string;
  speed?: 1 | 2;
  highlightColor?: number | null;
  motion?: FlowMotion;
  revealHidden?: boolean;
  /** performance.now() origin of the current animation session. */
  epoch?: number;
  pausedAt?: number;
}) {
  const geometry = flowGeometry(puzzle);
  const { step, size, startX, startY, bottom, homeY, viewBox } = geometry;
  const concealedCells = new Set(
    revealHidden ? [] : (puzzle.hiddenCells ?? []),
  );
  const frontier = new Set(flowFrontier(puzzle, cells));
  const timing = motion ?? flowMotion(events, speed, puzzle);
  const pickups = new Map(
    moving ? timing.trips.map((trip) => [trip.cell, trip]) : [],
  );
  return (
    <svg
      className={`flow-scene${preview ? " flow-scene-preview" : ""}`}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio={
        geometry.reference && !preview && !revealHidden
          ? "none"
          : "xMidYMid meet"
      }
      role="img"
      aria-label={
        label ??
        (preview
          ? "Муравьи собирают цветную пиксельную конструкцию"
          : `${puzzle.name}. Кубиков осталось: ${cells.filter((c) => c >= 0).length}. Доступны кубики на открытых краях картины.`)
      }
    >
      <rect
        x={geometry.frameX}
        y={geometry.frameY + 4}
        width={geometry.frameWidth}
        height={geometry.frameHeight}
        rx="17"
        fill="#bd9569"
        opacity=".25"
        transform="translate(0 5)"
      />
      <rect
        x={geometry.frameX}
        y={geometry.frameY}
        width={geometry.frameWidth}
        height={geometry.frameHeight}
        rx="17"
        fill={geometry.reference ? "#e7c792" : "#fff6e0"}
        stroke={geometry.reference ? "#d4b27e" : undefined}
        strokeWidth={geometry.reference ? 1.5 : undefined}
      />
      {geometry.reference && (
        <rect
          x={geometry.frameX + 16}
          y={geometry.frameY + 16}
          width={geometry.frameWidth - 32}
          height={geometry.frameHeight - 32}
          rx="14"
          fill="#fff6e0"
          stroke="#fff9e9"
          strokeWidth="2"
        />
      )}
      {puzzle.cells.map((color, i) => {
        if (color < 0 || cells[i] < 0) return null;
        const x = startX + (i % puzzle.width) * step,
          y = startY + Math.floor(i / puzzle.width) * step;
        const pickup = pickups.get(i);
        const concealed = concealedCells.has(i) && !frontier.has(i);
        const paint = concealed
          ? { hex: "#9698a4", dark: "#5f6272" }
          : FLOW_COLORS[color];
        return (
          <g
            key={i}
            className={`flow-cube${pickup !== undefined ? " is-lifting" : ""}`}
            style={
              pickup !== undefined
                ? ({
                    "--pickup-delay": `${pickup.at - pickup.renderAt}ms`,
                  } as CSSProperties)
                : undefined
            }
            data-cell={i}
            data-concealed={concealed || undefined}
          >
            <rect
              x={x}
              y={y + step * (2.5 / 24)}
              width={size}
              height={size}
              rx={step * (4.5 / 24)}
              fill={paint.dark}
            />
            <rect
              x={x}
              y={y}
              width={size}
              height={size}
              rx={step * (4.5 / 24)}
              fill={paint.hex}
            />
            <path
              d={`M${x + step * 0.21} ${y + step * 0.125}h${size - step * 0.42}`}
              stroke="white"
              strokeWidth={Math.max(0.65, step / 16)}
              opacity=".45"
              strokeLinecap="round"
            />
            {concealed && (
              <text
                x={x + size / 2}
                y={y + size * 0.78}
                textAnchor="middle"
                fill="#fffefa"
                fontSize={step * 0.78}
                fontWeight="850"
                aria-hidden="true"
              >
                ?
              </text>
            )}
            {highlightColor === color && frontier.has(i) && (
              <rect
                className="flow-target-cube"
                x={x - 1}
                y={y - 1}
                width={size + 2}
                height={size + 2}
                rx="5"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
              />
            )}
          </g>
        );
      })}
      <g
        aria-hidden="true"
        className="flow-anthill"
        transform={
          geometry.reference
            ? `translate(270 ${homeY}) scale(1.35) translate(-270 ${-(bottom + 66)})`
            : undefined
        }
      >
        <ellipse
          cx="270"
          cy={bottom + 69}
          rx="30"
          ry="13"
          fill="#d4a66e"
          opacity=".35"
        />
        <ellipse cx="270" cy={bottom + 65} rx="27" ry="11" fill="#75654d" />
        <ellipse cx="270" cy={bottom + 63} rx="22" ry="8" fill="#3b3b37" />
        <g transform={`translate(308 ${bottom + 73}) rotate(24)`}>
          <ellipse rx="26" ry="11" cy="3" fill="#92989c" />
          <ellipse
            rx="26"
            ry="11"
            fill="#d6dce0"
            stroke="#b4bdc3"
            strokeWidth="2"
          />
          <path
            d="M-16-3H16M-18 2H18M-10 6H10"
            stroke="#a4afb7"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      </g>
      {moving && (
        <FlowAntTraffic
          trips={timing.trips}
          epoch={epoch}
          speed={speed}
          pausedAt={pausedAt}
          scale={geometry.workerScale}
        />
      )}
    </svg>
  );
});
const cover = makeFlowPuzzle("level", 5);
export default function FlowPreview() {
  return (
    <div className="flow-cover" aria-hidden="true">
      <div className="flow-cover-spark">✦</div>
      <FlowScene puzzle={cover} cells={initialFlow(cover).cells} preview />
      <div className="flow-cover-ants">
        <FlowAnt color={1} size={50} />
        <FlowAnt color={2} size={60} />
        <FlowAnt color={0} size={50} />
      </div>
    </div>
  );
}
