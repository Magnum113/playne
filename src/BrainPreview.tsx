import type { BrainGameId } from "./brainContent";

export default function BrainPreview({ game }: { game: BrainGameId }) {
  return (
    <svg
      className={`size-preview brain-preview brain-preview-${game}`}
      viewBox="0 0 420 260"
      fill="none"
      aria-hidden="true"
    >
      {game === "flash" && (
        <g>
          <rect
            x="99"
            y="18"
            width="222"
            height="222"
            rx="22"
            fill="var(--panel)"
            stroke="var(--line-strong)"
          />
          {Array.from({ length: 16 }, (_, i) => (
            <rect
              key={i}
              className={
                [1, 4, 6, 10, 15].includes(i)
                  ? "preview-memory-cell"
                  : undefined
              }
              style={{
                animationDelay: `${[1, 4, 6, 10, 15].indexOf(i) * 90}ms`,
              }}
              x={111 + (i % 4) * 51}
              y={30 + Math.floor(i / 4) * 51}
              width="45"
              height="45"
              rx="9"
              fill={
                [1, 4, 6, 10, 15].includes(i) ? "var(--mint)" : "var(--hover)"
              }
            />
          ))}
          <path
            d="m340 42 10-14m-8 37 18-1m-23 29 12 11"
            stroke="var(--mint)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      )}
      {game === "rotate" && (
        <g>
          {[0, 1].map((n) => (
            <g key={n} transform={`translate(${n ? 247 : 62} 61)`}>
              <rect
                x="-18"
                y="-24"
                width="143"
                height="169"
                rx="24"
                fill={n ? "var(--mint-tint)" : "var(--purple-tint)"}
              />
              <g className={n ? "preview-rotate-shape" : undefined}>
                {(n
                  ? [
                      [0, 0],
                      [1, 0],
                      [2, 0],
                      [0, 1],
                      [0, 2],
                    ]
                  : [
                      [0, 0],
                      [0, 1],
                      [0, 2],
                      [1, 2],
                      [2, 2],
                    ]
                ).map(([x, y], i) => (
                  <rect
                    key={i}
                    x={x * 35}
                    y={y * 35 + 10}
                    width="32"
                    height="32"
                    rx="5"
                    fill={n ? "var(--mint)" : "var(--purple)"}
                  />
                ))}
              </g>
            </g>
          ))}
          <path
            d="M192 122a19 19 0 0 1 36-3m0 0-1-12m1 12-12-2"
            stroke="var(--muted)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {game === "slide" && (
        <g>
          <rect
            x="99"
            y="18"
            width="222"
            height="222"
            rx="18"
            fill="var(--panel)"
            stroke="var(--line-strong)"
          />
          {[1, 2, 3, 4, 5].map((n) => (
            <g key={n} stroke="var(--line)">
              <path d={`M${99 + n * 37} 18v222`} />
              <path d={`M99 ${18 + n * 37}h222`} />
            </g>
          ))}
          <g className="preview-slide-exit">
            <rect
              x="103"
              y="96"
              width="66"
              height="29"
              rx="8"
              fill="var(--danger)"
            />
            <text
              x="136"
              y="116"
              textAnchor="middle"
              fontFamily="inherit"
              fontSize="17"
              fontWeight="700"
              fill="var(--panel)"
            >
              R
            </text>
          </g>
          <rect
            className="preview-slide-block"
            x="177"
            y="59"
            width="29"
            height="66"
            rx="8"
            fill="var(--purple)"
          />
          <rect
            x="251"
            y="22"
            width="29"
            height="66"
            rx="8"
            fill="var(--mint)"
          />
          <rect
            x="140"
            y="170"
            width="103"
            height="29"
            rx="8"
            fill="var(--orange)"
          />
          <path
            d="M326 111h30m-9-9 9 9-9 9"
            stroke="var(--danger)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {game === "dispatch" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M28 128h113m0 0h104m0 0 75-74h45m-120 74h120m-224 0 143 78h81"
            stroke="var(--line-strong)"
            strokeWidth="11"
          />
          <path
            d="M28 128h113m0 0h104m0 0 75-74h45m-120 74h120m-224 0 143 78h81"
            stroke="var(--panel)"
            strokeWidth="4"
            strokeDasharray="4 8"
          />
          <circle cx="141" cy="128" r="15" fill="var(--purple)" />
          <text
            x="141"
            y="133"
            textAnchor="middle"
            fill="var(--panel)"
            stroke="none"
            fontSize="14"
            fontWeight="700"
          >
            1
          </text>
          <circle cx="245" cy="128" r="15" fill="var(--mint)" />
          <text
            x="245"
            y="133"
            textAnchor="middle"
            fill="var(--panel)"
            stroke="none"
            fontSize="14"
            fontWeight="700"
          >
            2
          </text>
          <circle
            cx="365"
            cy="54"
            r="19"
            fill="var(--mint-tint)"
            stroke="var(--mint)"
            strokeWidth="2"
          />
          <rect
            x="346"
            y="109"
            width="38"
            height="38"
            rx="6"
            fill="var(--purple-tint)"
            stroke="var(--purple)"
            strokeWidth="2"
          />
          <path
            d="m365 187 22 37h-44z"
            fill="var(--orange-tint)"
            stroke="var(--orange)"
            strokeWidth="2"
          />
          {[
            ["A", 365, 59],
            ["B", 365, 133],
            ["C", 365, 216],
          ].map(([t, x, y]) => (
            <text
              key={t}
              x={x}
              y={y}
              fill="var(--text)"
              stroke="none"
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
            >
              {t}
            </text>
          ))}
          <g className="preview-dispatch-train">
            <rect
              x="58"
              y="111"
              width="43"
              height="34"
              rx="10"
              fill="var(--mint)"
            />
            <text
              x="79"
              y="134"
              textAnchor="middle"
              fill="var(--panel)"
              stroke="none"
              fontSize="18"
              fontWeight="700"
            >
              A
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
