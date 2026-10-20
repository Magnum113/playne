// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../src/SiteHeader";
import { applyTheme, initTheme } from "../src/theme";
import { ModeChoice, RoundDots } from "../src/ui";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  applyTheme("light");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("Shared interface behaviour", () => {
  it("keeps all theme switches in sync and preserves an explicit choice", () => {
    act(() =>
      root.render(
        <>
          <ThemeToggle />
          <ThemeToggle />
        </>,
      ),
    );
    const buttons = container.querySelectorAll("button");
    act(() => buttons[0].click());
    expect([...buttons].map((b) => b.getAttribute("aria-label"))).toEqual([
      "Включить светлую тему",
      "Включить светлую тему",
    ]);
    expect(localStorage.getItem("playne:theme")).toBe("dark");
    act(() => {
      applyTheme("light");
      initTheme();
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => buttons[1].click());
    expect(
      [...buttons].every(
        (b) => b.getAttribute("aria-label") === "Включить тёмную тему",
      ),
    ).toBe(true);
  });
  it("gives separate mode pickers independent radio groups and honours disabled state", () => {
    const onChange = vi.fn();
    const options = [
      { value: "classic", label: "Без таймера", description: "В своём темпе" },
      { value: "timed", label: "На время", description: "30 секунд" },
    ];
    act(() =>
      root.render(
        <>
          <ModeChoice value="classic" options={options} onChange={onChange} />
          <ModeChoice
            value="classic"
            options={options}
            onChange={onChange}
            disabled
          />
        </>,
      ),
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs[0].name).not.toBe(inputs[2].name);
    act(() => inputs[1].click());
    expect(onChange).toHaveBeenCalledWith("timed");
    expect(container.querySelectorAll("fieldset")[1].disabled).toBe(true);
  });
  it("uses the same progress states for every five-round game", () => {
    act(() => root.render(<RoundDots current={2} completed={2} />));
    expect(container.querySelectorAll("i")).toHaveLength(5);
    expect(container.querySelectorAll(".done")).toHaveLength(2);
    expect(container.querySelectorAll(".active.current")).toHaveLength(1);
  });
});
