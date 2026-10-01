import { useTheme } from "./theme";

export function DestroyWebsiteLink({ badge = false }: { badge?: boolean }) {
  return (
    <a
      className={badge ? "destroy-badge" : "destroy-link"}
      href="https://destroy.spritefusion.com/?from=badge&url=https%3A%2F%2Fplayne.ru%2F%3Fv%3D4134b86"
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
      <img src="/art/playne-logo.png?v=2" width="64" height="64" alt="" />
      <span>
        playne<span className="brand-dot">.</span>
      </span>
    </a>
  );
}
