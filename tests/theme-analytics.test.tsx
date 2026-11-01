// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://playne.ru/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { initTheme, useTheme } from "../src/theme";
import { METRIKA_COUNTER_ID } from "../src/analytics";

function Toggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.documentElement.dataset.theme = "light";
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.ym;
});

describe("dark theme analytics", () => {
  it("counts explicit dark selections once, but not light selections or remounts", async () => {
    const ym = vi.fn();
    window.ym = ym;
    const box = document.createElement("div");
    const root = createRoot(box);
    try {
      await act(async () => root.render(<Toggle />));
      expect(ym).not.toHaveBeenCalled();
      await act(async () => box.querySelector("button")!.click());
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(localStorage.getItem("playne:theme")).toBe("dark");
      expect(ym.mock.calls).toEqual([
        [METRIKA_COUNTER_ID, "reachGoal", "playne_dark_theme_enabled", { source: "header", theme: "dark" }],
      ]);
      await act(async () => box.querySelector("button")!.click());
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(ym).toHaveBeenCalledTimes(1);
      await act(async () => root.render(<Toggle key="remount" />));
      expect(ym).toHaveBeenCalledTimes(1);
      await act(async () => box.querySelector("button")!.click());
      expect(ym).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("does not count saved theme restoration or a cross-tab storage change", () => {
    const ym = vi.fn();
    window.ym = ym;
    localStorage.setItem("playne:theme", "dark");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "playne:theme", newValue: "light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    window.dispatchEvent(new StorageEvent("storage", { key: "playne:theme", newValue: "dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(ym).not.toHaveBeenCalled();
  });

  it("still switches when storage and analytics are blocked", async () => {
    window.ym = () => { throw new Error("blocked tag"); };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked storage"); });
    const box = document.createElement("div");
    const root = createRoot(box);
    try {
      await act(async () => root.render(<Toggle />));
      await act(async () => box.querySelector("button")!.click());
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(box.textContent).toBe("dark");
    } finally {
      await act(async () => root.unmount());
    }
  });
});
