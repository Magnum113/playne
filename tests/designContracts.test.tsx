// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DesignNavigation from "../src/DesignNavigation";
import { ResultStatus, GuestTrialPanel } from "../src/ResultStatus";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Result presentation shared by games and catalog", () => {
  it("does not show success or retry actions while verification is pending", () => {
    for (const state of ["restoring", "checking", "saving"] as const) {
      act(() => root.render(<ResultStatus state={state} />));
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      expect(container.textContent).not.toContain(
        "Результат сохранён в рейтинг.",
      );
      expect(container.querySelector("button")).toBeNull();
    }
  });
  it("keeps the failure visible and calls the supplied retry without assuming success", () => {
    const retry = vi.fn();
    act(() =>
      root.render(
        <ResultStatus
          state="save-error"
          message="Нет соединения"
          onRetry={retry}
          ranking="/leaderboard/?game=naglaz"
        />,
      ),
    );
    act(() => container.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Нет соединения");
    expect(container.textContent).not.toContain(
      "Результат сохранён в рейтинг.",
    );
    expect(container.querySelector("a")!.getAttribute("href")).toBe(
      "/leaderboard/?game=naglaz",
    );
  });
  it("keeps private practice wording separate from public ranking", () => {
    act(() =>
      root.render(
        <GuestTrialPanel practice>
          <button>Войти</button>
        </GuestTrialPanel>,
      ),
    );
    expect(container.textContent).toContain("в личной истории");
    expect(container.textContent).not.toContain("в рейтинг");
  });
});

describe("Catalog navigation", () => {
  it("has labelled search and marks a location rather than pretending to be tabs", () => {
    act(() => root.render(<DesignNavigation />));
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.length).toBe(2);
    for (const input of inputs)
      expect(
        container.querySelector(`label[for="${CSS.escape(input.id)}"]`),
      ).not.toBeNull();
    expect(
      container
        .querySelector('[aria-current="location"]')
        ?.getAttribute("href"),
    ).toBe("#principles");
    expect(container.querySelector('[role="tab"]')).toBeNull();
  });
  it("closes mobile contents and transfers focus to the destination heading", () => {
    act(() =>
      root.render(
        <>
          <DesignNavigation />
          <h2 id="forms-title" tabIndex={-1}>
            Поля
          </h2>
        </>,
      ),
    );
    const contents = container.querySelector("details")!;
    contents.open = true;
    const anchor =
      contents.querySelector<HTMLAnchorElement>('a[href="#forms"]')!;
    act(() => anchor.click());
    expect(contents.open).toBe(false);
    expect(document.activeElement?.id).toBe("forms-title");
  });
});
