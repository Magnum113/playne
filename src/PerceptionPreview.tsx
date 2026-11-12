/** Original Playne artwork: count, angle, and rhythm from the daily five. */
export default function PerceptionPreview() {
  return (
    <svg className="size-preview perception-preview" viewBox="0 0 420 190" aria-hidden="true">
      <rect x="20" y="34" width="118" height="132" rx="20" fill="var(--mint-tint)" transform="rotate(-7 79 100)" />
      <g fill="var(--mint)">
        {[[48, 66], [77, 58], [106, 70], [43, 98], [74, 91], [104, 103], [54, 127], [86, 125]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" />)}
      </g>
      <rect x="148" y="18" width="124" height="148" rx="20" fill="var(--purple-tint)" />
      <path d="M171 133h76M184 133l43-80" stroke="var(--purple)" strokeWidth="5" strokeLinecap="round" />
      <path d="M215 133a31 31 0 0 0-16-27" fill="none" stroke="var(--purple)" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="227" cy="53" r="8" fill="var(--purple)" />
      <circle cx="184" cy="133" r="5" fill="var(--panel)" stroke="var(--purple)" strokeWidth="3" />
      <rect x="282" y="34" width="118" height="132" rx="20" fill="var(--orange-tint)" transform="rotate(7 341 100)" />
      <path d="M298 109h11l8-22 12 43 13-63 12 42h30" fill="none" stroke="var(--orange)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="var(--orange)">
        <circle cx="318" cy="148" r="3" />
        <circle cx="339" cy="148" r="3" />
        <circle cx="360" cy="148" r="3" />
      </g>
    </svg>
  );
}
