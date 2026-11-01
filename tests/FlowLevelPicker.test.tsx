// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowLevelPicker } from "../src/FlowLevelPicker";

let root: Root;
let box: HTMLDivElement;
const select = vi.fn();
const heading = () => box.querySelector("#flow-selection-title")?.textContent;
const arrow = (name: string) =>
  box.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const level = (number: number) =>
  [...box.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.getAttribute("aria-label")?.startsWith(`Уровень ${number}.`),
  )!;
const render = async (unlocked: number, records = {}) => {
  await act(async () => {
    root.render(
      <FlowLevelPicker
        unlocked={unlocked}
        totalStars={3}
        records={records}
        onSelect={select}
      />,
    );
  });
};
const click = async (button: HTMLButtonElement) =>
  act(async () => button.click());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(async () => {
  await act(async () => root.unmount());
  box.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Swarm level pages", () => {
  it("replaces chapter switches with bounded page navigation without starting a game", async () => {
    await render(1);
    expect(box.querySelector(".flow-chapters")).toBeNull();
    expect(heading()).toBe("Первый рейс");
    expect(arrow("Предыдущие уровни").disabled).toBe(true);
    expect(arrow("Следующие уровни").disabled).toBe(false);

    await click(arrow("Следующие уровни"));
    expect(heading()).toBe("Цветные маршруты");
    expect(arrow("Предыдущие уровни").disabled).toBe(false);
    await click(arrow("Следующие уровни"));
    expect(heading()).toBe("Мастера потока");
    expect(arrow("Следующие уровни").disabled).toBe(true);
    await click(arrow("Следующие уровни"));
    expect(heading()).toBe("Мастера потока");
    await click(arrow("Предыдущие уровни"));
    expect(heading()).toBe("Цветные маршруты");
    expect(select).not.toHaveBeenCalled();
  });

  it("starts only the selected unlocked level and keeps later levels locked", async () => {
    await render(2, { "level:1": { stars: 3 } });
    expect(level(1).disabled).toBe(false);
    expect(level(2).disabled).toBe(false);
    expect(level(3).disabled).toBe(true);
    await click(level(1));
    await click(level(2));
    await click(level(3));
    expect(select.mock.calls).toEqual([[1], [2]]);
  });

  it("opens the current chapter and follows late account progress before the player browses", async () => {
    await render(13);
    expect(heading()).toBe("Цветные маршруты");
    expect(level(13).disabled).toBe(false);
    await render(25);
    expect(heading()).toBe("Мастера потока");
    expect(level(25).disabled).toBe(false);
  });

  it("supports keyboard paging from the carousel without intercepting level button keys", async () => {
    await render(2);
    const pages = box.querySelector<HTMLElement>('[role="region"][aria-label="Уровни"]')!;
    const press = async (target: HTMLElement, key: string) => act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
    await press(pages, "End");
    expect(heading()).toBe("Мастера потока");
    await press(pages, "Home");
    expect(heading()).toBe("Первый рейс");
    await press(level(1), "ArrowRight");
    expect(heading()).toBe("Первый рейс");
    await press(pages, "ArrowRight");
    expect(heading()).toBe("Цветные маршруты");
    expect(select).not.toHaveBeenCalled();
  });

  it("keeps the player's chosen page when account progress updates", async () => {
    await render(1);
    await click(arrow("Следующие уровни"));
    expect(heading()).toBe("Цветные маршруты");
    await render(25);
    expect(heading()).toBe("Цветные маршруты");
    expect(select).not.toHaveBeenCalled();
  });
});
