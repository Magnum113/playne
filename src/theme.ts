import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "playne:theme",
  EVENT = "playne:theme-change";
const snapshot = (): Theme =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  return () => window.removeEventListener(EVENT, notify);
};

export function applyTheme(theme: Theme) {
  const previous = snapshot();
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f7f7f2" : "#151719");
  if (previous !== theme && typeof window !== "undefined")
    window.dispatchEvent(new Event(EVENT));
}
let listening = false;
export function initTheme() {
  let theme: Theme = "light";
  try {
    if (localStorage.getItem(KEY) === "dark") theme = "dark";
  } catch {
    /* Light is also usable without storage. */
  }
  applyTheme(theme);
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) applyTheme(e.newValue === "dark" ? "dark" : "light");
    });
    listening = true;
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light");
  function toggleTheme() {
    const next = snapshot() === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* The current page still updates. */
    }
  }
  return { theme, toggleTheme };
}
