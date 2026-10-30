import { useId } from "react";
import Silhouette from "./Silhouette";
import { objects } from "./data";

export function SizePreview() {
  return (
    <svg className="size-preview" viewBox="0 0 420 190" aria-hidden="true">
      <path d="M36 158H384" className="preview-ground" />
      <g style={{ color: "var(--mint)" }}>
        <Silhouette object={objects.eiffel} x={94} y={22} scale={136 / 330} />
      </g>
      <g className="preview-size-object" style={{ color: "var(--purple)" }}>
        <Silhouette object={objects.rocket} x={283} y={46} scale={112 / 70} />
      </g>
      <path
        d="m187 102 37 0m-8-8 8 8-8 8"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M269 34h37v136h-37Z"
        fill="none"
        stroke="var(--purple)"
        strokeDasharray="3 5"
        opacity=".45"
      />
      <rect
        x="296"
        y="25"
        width="23"
        height="23"
        rx="6"
        fill="var(--purple-soft)"
      />
      <path
        d="m303 41 9-9m-6 0h6v6"
        fill="none"
        stroke="#292133"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function CirclePreview() {
  return (
    <svg className="size-preview" viewBox="0 0 420 190" aria-hidden="true">
      <circle
        cx="210"
        cy="94"
        r="66"
        fill="none"
        stroke="var(--purple)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        opacity=".4"
      />
      <path
        className="preview-circle-line"
        pathLength="1"
        d="M275 94C280 128 250 163 213 164C174 165 143 136 142 97C139 63 164 26 205 25C243 24 276 51 276 91"
        fill="none"
        stroke="var(--mint)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="210" cy="94" r="12" fill="var(--purple-tint)" />
      <circle cx="210" cy="94" r="4" fill="var(--purple)" />
      <circle
        className="preview-circle-tip"
        cx="276"
        cy="91"
        r="5"
        fill="var(--mint)"
      />
    </svg>
  );
}

export function ColorPreview() {
  const id = useId();
  return (
    <svg className="size-preview" viewBox="0 0 420 190" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-shade`} x1="0" x2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#5400ff" />
        </linearGradient>
        <linearGradient id={`${id}-shade-dark`} x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
      </defs>
      <rect x="42" y="25" width="152" height="126" rx="15" fill="#7954c5" />
      <rect
        x="225"
        y="25"
        width="152"
        height="126"
        rx="15"
        fill={`url(#${id}-shade)`}
      />
      <rect
        x="225"
        y="25"
        width="152"
        height="126"
        rx="15"
        fill={`url(#${id}-shade-dark)`}
      />
      <circle
        className="preview-shade-picker"
        cx="312"
        cy="54"
        r="10"
        fill="#7954c5"
        stroke="white"
        strokeWidth="4"
      />
      <path
        d="M198 88h21m-8-8 8 8-8 8"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
