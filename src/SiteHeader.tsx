import { useId } from "react";
import { useTheme } from "./theme";

function PlayneMark() {
  const gradientId = useId().replaceAll(":", "");
  return (
    <svg
      viewBox="0 0 1254 1254"
      width="64"
      height="64"
      aria-hidden="true"
      focusable="false"
      data-playne-mark="vector"
    >
      <defs>
        <linearGradient id={`${gradientId}-violet`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#c7adfa" />
          <stop offset="1" stopColor="#bda1f6" />
        </linearGradient>
        <linearGradient id={`${gradientId}-mint`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#61d6c1" />
          <stop offset="1" stopColor="#6adac2" />
        </linearGradient>
        <linearGradient id={`${gradientId}-peach`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f4b77e" />
          <stop offset="1" stopColor="#ecaa71" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId}-violet)`}
        fillRule="evenodd"
        d="M334 97H545C850 97 1078 295 1078 578S850 1059 490 1059V558C490 349 435 160 334 97ZM551 365C524 348 496 368 496 400V777C496 809 524 826 551 809L849 623C877 605 877 567 849 548Z"
      />
      <path
        fill={`url(#${gradientId}-mint)`}
        d="M232 97H334C435 160 490 349 490 558V1075C490 1176 411 1254 314 1254S137 1176 137 1075V194C137 138 174 97 232 97Z"
      />
      <rect
        x="881"
        y="1018"
        width="236"
        height="236"
        rx="82"
        fill={`url(#${gradientId}-peach)`}
      />
    </svg>
  );
}

export function DestroyWebsiteLink({ badge = false }: { badge?: boolean }) {
  return (
    <a
      className={badge ? "destroy-badge" : "destroy-link"}
      href="https://destroy.spritefusion.com/?from=badge&url=https%3A%2F%2Fplayne.ru%2Fdestroy.html%3Fv%3D1"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Разрушить сайт — Sprite Fusion, откроется в новой вкладке"
    >
      {badge ? (
        <img
          src="https://destroy.spritefusion.com/badge.svg"
          alt="Destroy this website"
          width="180"
          height="40"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <>
          Разрушить сайт <span aria-hidden="true">↗</span>
        </>
      )}
    </a>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={
        theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"
      }
      title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        {theme === "light" ? (
          <path
            d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
}

export function PlayneBrand({ large = false }: { large?: boolean }) {
  return (
    <a
      href="/"
      className={`playne-brand${large ? " playne-brand-large" : ""}`}
      aria-label="Playne — главная"
    >
      <PlayneMark />
      <span>
        playne<span className="brand-dot">.</span>
      </span>
    </a>
  );
}
