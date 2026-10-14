export default function LandmarkPreview() {
  return (
    <svg
      className="size-preview landmark-preview"
      viewBox="0 0 420 190"
      aria-hidden="true"
    >
      <rect
        x="35"
        y="25"
        width="350"
        height="140"
        rx="20"
        fill="var(--purple-tint)"
      />
      <circle cx="334" cy="55" r="17" fill="var(--mint-tint)" />
      <path d="M57 153h307" stroke="var(--line)" strokeWidth="2" />
      <g fill="var(--mint)">
        <path
          d="M85 153h13l8-33h30l8 33h13l-27-100h-18Zm26-43 10-35 10 35Z"
          fillRule="evenodd"
        />
        <path d="M118 40h6v20h-6zM96 115h50v7H96zM91 135h60v7H91z" />
      </g>
      <g fill="var(--purple-soft)">
        <path d="M175 153V90h69v63h-20v-27a15 15 0 0 0-30 0v27Z" />
        <path d="M171 86h77v9h-77zM184 74h51v12h-51z" />
        <path d="M183 102h9v9h-9zM226 102h9v9h-9z" fill="var(--panel)" />
      </g>
      <g fill="var(--mint)">
        <path
          d="M278 153V98l31-19 31 19v55Zm12-10h11v-29h-11Zm25 0h11v-29h-11Z"
          fillRule="evenodd"
        />
        <path d="m265 99 44-30 44 30ZM275 75l34-25 34 25ZM293 51l16-21 16 21Z" />
      </g>
    </svg>
  );
}
