export default function StreakFlame({
  active = true,
  animated = false,
}: {
  active?: boolean;
  animated?: boolean;
}) {
  return (
    <svg
      className={`streak-flame${active ? " is-lit" : ""}${animated ? " is-animated" : ""}`}
      viewBox="0 0 48 56"
      fill="none"
      aria-hidden="true"
    >
      <g className="streak-flame-body">
        <path
          d="M26 2c2 11-8 14-6 24 3-2 6-6 7-11 9 7 17 16 17 25 0 11-8 16-20 16S4 49 4 39c0-11 7-17 12-24-1 7 1 9 3 10C15 15 23 10 26 2Z"
          fill="currentColor"
        />
        <path
          className="streak-flame-core"
          d="M25 30c0 7-6 8-6 14 0 3 2 6 6 6s7-3 7-7c0-5-3-9-7-13Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
