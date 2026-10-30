export type CategoryKind =
  | "size"
  | "circle"
  | "color"
  | "geo"
  | "landmark"
  | "line"
  | "memory"
  | "logic"
  | "reaction"
  | "space"
  | "planning"
  | "attention";

/** A decorative hint to the skill, always accompanied by a text label. */
export default function CategoryGlyph({ kind }: { kind: CategoryKind }) {
  return (
    <svg
      className={`category-glyph category-glyph-${kind}`}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "size" && (
        <>
          <path d="M4 20V10h5v10m6 0V4h5v16M3 20h18" />
          <path className="glyph-detail" d="M4 6h5m-2-2v4" />
        </>
      )}
      {kind === "circle" && (
        <>
          <circle className="glyph-detail" cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </>
      )}
      {kind === "color" && (
        <>
          <circle cx="9" cy="10" r="5" />
          <circle className="glyph-detail" cx="15" cy="14" r="5" />
        </>
      )}
      {kind === "geo" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18m-9-9c-5 5-5 13 0 18m0-18c5 5 5 13 0 18" />
        </>
      )}
      {kind === "landmark" && (
        <>
          <path d="m3 9 9-6 9 6H3Zm2 3v7m7-7v7m7-7v7M3 21h18" />
          <path className="glyph-detail" d="M3 9h18" />
        </>
      )}
      {kind === "line" && (
        <>
          <path className="glyph-detail" d="M4 5h16v7H4v7h16" />
          <circle cx="4" cy="5" r="2" fill="var(--panel)" />
          <circle cx="20" cy="19" r="2" fill="var(--panel)" />
        </>
      )}
      {kind === "memory" && (
        <>
          {[0, 1, 2, 3].map((n) => (
            <rect
              key={n}
              className="glyph-memory-cell"
              x={3 + (n % 2) * 10}
              y={3 + Math.floor(n / 2) * 10}
              width="7"
              height="7"
              rx="2"
            />
          ))}
        </>
      )}
      {(kind === "logic" || kind === "space") && (
        <g className="glyph-detail">
          <path d="M4 4h7v7h9v9H4V4Z" />
          <path d="M16 4h4v4" />
        </g>
      )}
      {kind === "reaction" && (
        <path className="glyph-detail" d="m14 2-10 12h7l-1 8L20 9h-7l1-7Z" />
      )}
      {kind === "planning" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M9 3v18m6-18v18M3 9h18m-18 6h18" />
          <path className="glyph-detail" d="M5 12h7" strokeWidth="3" />
        </>
      )}
      {kind === "attention" && (
        <>
          <path d="M3 6h7l10 12M3 18h7L20 6" />
          <path className="glyph-detail" d="M16 6h4v4m-4 8h4v-4" />
        </>
      )}
    </svg>
  );
}
