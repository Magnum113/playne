import React from "react";
import { memo, type CSSProperties } from "react";
import {
  FLOW_COLORS,
  flowFrontier,
  initialFlow,
  makeFlowPuzzle,
  type FlowEvent,
  type FlowPuzzle,
} from "./flow";
import { flowMotion } from "./flowPresentation";

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

export function FlowCrate({ color, count }: { color: number; count: number }) {
  const paint = FLOW_COLORS[color];
  return (
    <svg className="flow-crate" viewBox="0 0 76 76" aria-hidden="true">
      <rect x="7" y="10" width="62" height="61" rx="11" fill={paint.dark} />
      <rect x="7" y="5" width="62" height="61" rx="11" fill={paint.hex} />
      <path
        d="M18 9h40"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".48"
      />
      <text
        x="38"
        y="49"
        textAnchor="middle"
        fontSize="33"
        fontWeight="850"
        fill="white"
        stroke={paint.dark}
        strokeWidth="2.7"
        paintOrder="stroke"
        fontFamily="inherit"
      >
        {count}
      </text>
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
  return (
    <g
      className="flow-worker-body"
      stroke={paint.dark}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse
        cy="3"
        rx="12"
        ry="19"
        fill="#62482a"
        stroke="none"
        opacity=".12"
      />
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
      <ellipse cy="10" rx="7.5" ry="10" fill={paint.hex} strokeWidth="1.2" />
      <path d="M-5 13q5 3 10 0" fill="none" opacity=".35" />
      <ellipse cy="-1" rx="5" ry="7" fill={paint.hex} strokeWidth="1.2" />
      <ellipse cy="-12" rx="8.5" ry="7.8" fill={paint.hex} strokeWidth="1.2" />
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
      <ellipse cx="4" cy="-15" rx="2.2" ry="2.8" fill="#fffef4" stroke="none" />
      <circle cx="-4" cy="-16" r="1.2" fill="#34352f" stroke="none" />
      <circle cx="4" cy="-16" r="1.2" fill="#34352f" stroke="none" />
      {loaded && (
        <g stroke="none">
          <rect
            x="-11"
            y="-40"
            width="22"
            height="22"
            rx="4"
            fill={paint.dark}
          />
          <rect
            x="-11"
            y="-42"
            width="22"
            height="21"
            rx="4"
            fill={paint.hex}
          />
          <path d="M-7-39H7" stroke="white" strokeWidth="1.6" opacity=".6" />
        </g>
      )}
    </g>
  );
}

export const FlowScene = memo(function FlowScene({
  puzzle,
  cells,
  events = [],
  moving = false,
  preview = false,
  label,
  speed = 1,
  highlightColor,
}: {
  puzzle: FlowPuzzle;
  cells: number[];
  events?: FlowEvent[];
  moving?: boolean;
  preview?: boolean;
  label?: string;
  speed?: 1 | 2;
  highlightColor?: number | null;
}) {
  const step = 24,
    size = 23;
  const startX = (540 - puzzle.width * step) / 2,
    startY = 22;
  const bottom = startY + puzzle.height * step;
  const frontier = new Set(flowFrontier(puzzle, cells));
  const timing = flowMotion(events, speed, puzzle);
  return (
    <svg
      className={`flow-scene${preview ? " flow-scene-preview" : ""}`}
      viewBox={`0 0 540 ${bottom + 132}`}
      role="img"
      aria-label={
        label ??
        (preview
          ? "Муравьи собирают цветную пиксельную конструкцию"
          : `${puzzle.name}. Кубиков осталось: ${cells.filter((c) => c >= 0).length}. Доступны нижние кубики каждого столбца.`)
      }
    >
      <rect
        x={startX - 15}
        y={startY - 12}
        width={puzzle.width * step + 30}
        height={puzzle.height * step + 28}
        rx="17"
        fill="#bd9569"
        opacity=".25"
        transform="translate(0 5)"
      />
      <rect
        x={startX - 15}
        y={startY - 16}
        width={puzzle.width * step + 30}
        height={puzzle.height * step + 28}
        rx="17"
        fill="#fff6e0"
      />
      {puzzle.cells.map((color, i) => {
        if (color < 0 || cells[i] < 0) return null;
        const x = startX + (i % puzzle.width) * step,
          y = startY + Math.floor(i / puzzle.width) * step;
        const pickup = moving
          ? events.findIndex((event) => event.cell === i)
          : -1;
        const paint = FLOW_COLORS[color];
        return (
          <g
            key={i}
            className={`flow-cube${pickup >= 0 ? " is-lifting" : ""}`}
            style={
              pickup >= 0
                ? ({
                    "--pickup-delay": `${timing.pickups[pickup].at}ms`,
                  } as CSSProperties)
                : undefined
            }
            data-cell={i}
          >
            <rect
              x={x}
              y={y + 2.5}
              width={size}
              height={size}
              rx="4.5"
              fill={paint.dark}
            />
            <rect
              x={x}
              y={y}
              width={size}
              height={size}
              rx="4.5"
              fill={paint.hex}
            />
            <path
              d={`M${x + 5} ${y + 3}h${size - 10}`}
              stroke="white"
              strokeWidth="1.5"
              opacity=".45"
              strokeLinecap="round"
            />
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
      <g aria-hidden="true">
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
      {moving &&
        timing.trips.map((trip) => (
          <React.Fragment key={`${trip.packet}:${trip.cell}`}>
            <g
              className="flow-walking-ant"
              aria-hidden="true"
              data-trip="outbound"
              style={
                {
                  offsetPath: `path('${trip.outboundPath}')`,
                  "--walk-delay": `${trip.depart}ms`,
                  "--walk-duration": `${trip.outbound}ms`,
                  "--visible-duration": `${trip.outbound + trip.pickupPause}ms`,
                } as CSSProperties
              }
            >
              <g transform="scale(.72)">
                <WalkingAnt color={trip.color} />
              </g>
            </g>
            <g
              className="flow-walking-ant is-loaded"
              aria-hidden="true"
              data-trip="return"
              style={
                {
                  offsetPath: `path('${trip.returnPath}')`,
                  "--walk-delay": `${trip.returnAt}ms`,
                  "--walk-duration": `${trip.carry}ms`,
                  "--visible-duration": `${trip.carry}ms`,
                } as CSSProperties
              }
            >
              <g transform="scale(.72)">
                <WalkingAnt color={trip.color} loaded />
              </g>
            </g>
          </React.Fragment>
        ))}
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
