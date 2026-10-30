export default function GeoPreview() {
  return (
    <svg
      className="size-preview geo-preview"
      viewBox="0 0 420 190"
      aria-hidden="true"
    >
      <rect
        x="50"
        y="28"
        width="320"
        height="137"
        rx="17"
        fill="var(--mint-tint)"
      />
      <path
        d="m57 111 49-18 21 13 30-16 18-43 38 13 16 36 40-13 15 24 38-13 39 22M114 29l13 43-17 28 15 33-4 31M202 32l-16 47 13 19-20 30 9 36M294 30l-13 26 16 30-14 35 15 42"
        stroke="var(--mint)"
        strokeOpacity=".3"
        strokeWidth="2"
        fill="none"
      />
      <path
        className="preview-geo-route"
        d="M129 115c23-1 30 30 58 25s38-35 80-37"
        fill="none"
        stroke="var(--purple)"
        strokeWidth="2.5"
        strokeDasharray="5 6"
        strokeLinecap="round"
      />
      <circle
        cx="125"
        cy="115"
        r="8"
        fill="var(--mint)"
        stroke="var(--panel)"
        strokeWidth="3"
      />
      <g className="preview-geo-pin">
        <path
          d="M286 52c-17 0-29 12-29 28 0 22 29 43 29 43s29-21 29-43c0-16-12-28-29-28Z"
          fill="var(--purple-soft)"
          stroke="var(--panel)"
          strokeWidth="3"
        />
        <circle cx="286" cy="80" r="10" fill="var(--panel)" />
      </g>
    </svg>
  );
}
