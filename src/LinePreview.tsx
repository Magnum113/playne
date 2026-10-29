import { LINE_INTRO_PATH, LINE_INTRO_PUZZLE } from "./line";

export default function LinePreview() {
  const p = LINE_INTRO_PUZZLE;
  return (
    <svg
      className="size-preview line-preview"
      viewBox="0 0 320 260"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="57"
        y="27"
        width="210"
        height="210"
        rx="20"
        fill="var(--panel)"
        stroke="var(--line-strong)"
      />
      {[1, 2].map((n) => (
        <g key={n} stroke="var(--line)">
          <path d={`M${57 + n * 70} 27v210`} />
          <path d={`M57 ${27 + n * 70}h210`} />
        </g>
      ))}
      <polyline
        points={LINE_INTRO_PATH.map(
          (c) => `${92 + (c % 3) * 70},${62 + Math.floor(c / 3) * 70}`,
        ).join(" ")}
        stroke="var(--mint)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {Object.entries(p.numbers).map(([cell, n]) => (
        <g key={cell}>
          <circle
            cx={92 + (Number(cell) % 3) * 70}
            cy={62 + Math.floor(Number(cell) / 3) * 70}
            r="18"
            fill="var(--panel)"
            stroke="var(--mint)"
            strokeWidth="2"
          />
          <text
            x={92 + (Number(cell) % 3) * 70}
            y={63 + Math.floor(Number(cell) / 3) * 70}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text)"
            fontFamily="inherit"
            fontWeight="700"
            fontSize="19"
          >
            {n}
          </text>
        </g>
      ))}
    </svg>
  );
}
