import { afterEach, describe, expect, it, vi } from "vitest";
import { initTheme } from "../src/theme";

afterEach(() => vi.unstubAllGlobals());

function page(storageValue: string | null, unavailable = false) {
  const dataset: { theme?: string } = {};
  vi.stubGlobal("document", {
    documentElement: { dataset },
    querySelector: () => null,
  });
  vi.stubGlobal("localStorage", {
    getItem: () => {
      if (unavailable) throw new Error("Storage is unavailable");
      return storageValue;
    },
  });
  return dataset;
}

describe("Playne theme preference", () => {
  it("starts in light mode without a saved preference", () => {
    const dataset = page(null);
    initTheme();
    expect(dataset.theme).toBe("light");
  });
  it("restores an explicitly selected dark theme", () => {
    const dataset = page("dark");
    initTheme();
    expect(dataset.theme).toBe("dark");
  });
  it("keeps the page usable in light mode when storage is blocked", () => {
    const dataset = page(null, true);
    expect(initTheme).not.toThrow();
    expect(dataset.theme).toBe("light");
  });
});
