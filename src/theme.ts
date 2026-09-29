import { useState } from "react";

export type Theme = "light" | "dark";
const KEY = "playne:theme";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f7f7f2" : "#151719");
}

export function initTheme() {
  let theme: Theme = "light";
  try {
    if (localStorage.getItem(KEY) === "dark") theme = "dark";
  } catch {
    /* The light theme also works without browser storage. */
  }
  applyTheme(theme);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* Theme stays usable. */
    }
  }
  return { theme, toggleTheme };
}
