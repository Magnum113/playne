// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ReturnExamples from "../src/ReturnExamples";
import type { OverallBoard } from "../src/overall";

it("exercises real return components without loading or changing an account", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box);
  const board: OverallBoard = {
    game: "overall",
    period: "all",
    version: 3,
    page: 1,
    limit: 5,
    total: 0,
    entries: [],
    mine: null,
  };
  try {
    await act(async () => root.render(<ReturnExamples overall={board} />));
    expect(box.querySelector(".today-play-streak")?.textContent).toBe("3");
    expect(box.querySelectorAll(".top-five-list li")).toHaveLength(5);
    expect(box.querySelectorAll(".streak-rank-list li")).toHaveLength(5);
    expect(box.querySelector(".streak-personal-bottom")).toBeNull();
    const choose = async (name: string) => {
      const button = [...box.querySelectorAll("button")].find(
        (item) => item.textContent === name,
      )!;
      await act(async () => button.click());
    };
    await choose("Загрузка");
    expect(box.querySelector(".header-streak")?.textContent).toBe("—");
    expect(box.querySelectorAll(".play-choice")).toHaveLength(0);
    await choose("Ошибка");
    expect(
      box.querySelector(".header-streak")?.getAttribute("aria-label"),
    ).toContain("недоступна");
    await choose("Повторить");
    expect(box.querySelector(".today-play-streak")?.textContent).toBe("3");
    await choose("Новая серия");
    expect(box.querySelector(".header-streak")?.textContent).toBe("0");
    expect(
      box.querySelector(".header-streak")?.querySelector(".is-lit"),
    ).toBeNull();
    expect(box.querySelectorAll(".streak-rank-list li")).toHaveLength(0);
    const ids = [...box.querySelectorAll("[id]")].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    box.remove();
    vi.unstubAllGlobals();
  }
});
