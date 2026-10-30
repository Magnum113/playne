// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RulesDialog } from "../src/RulesDialog";

let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Shared rules dialog", () => {
  it("connects a unique heading to each native dialog and retains game content", () => {
    act(() =>
      root.render(
        <>
          <RulesDialog dialogRef={createRef()} title="Круг">
            <p>Замкни линию.</p>
          </RulesDialog>
          <RulesDialog dialogRef={createRef()} title="Жми">
            <p>Прочитай правило.</p>
          </RulesDialog>
        </>,
      ),
    );
    const dialogs = [...box.querySelectorAll("dialog")];
    const ids = dialogs.map((dialog) => dialog.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    dialogs.forEach((dialog, index) => {
      expect(dialog.querySelector("h2")?.id).toBe(ids[index]);
      expect(
        dialog
          .querySelector(".dialog-top .close-button")
          ?.getAttribute("aria-label"),
      ).toBe("Закрыть правила");
    });
    expect(dialogs[0].textContent).toContain("Замкни линию.");
  });

  it("uses native close for both actions, retains close/cancel hooks, and only closes outside the panel", () => {
    const ref = createRef<HTMLDialogElement>(),
      onClose = vi.fn(),
      onCancel = vi.fn();
    act(() =>
      root.render(
        <RulesDialog
          dialogRef={ref}
          title="Как играть"
          onClose={onClose}
          onCancel={onCancel}
          actionLabel="Вернуться к игре"
        >
          <p>Правило</p>
        </RulesDialog>,
      ),
    );
    const dialog = ref.current!;
    const close = vi
      .spyOn(dialog, "close")
      .mockImplementation(() => dialog.dispatchEvent(new Event("close")));
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      left: 20,
      right: 220,
      top: 20,
      bottom: 220,
    } as DOMRect);
    act(() => box.querySelector<HTMLButtonElement>(".close-button")!.click());
    act(() =>
      box
        .querySelector<HTMLButtonElement>(".rules-dialog-actions button")!
        .click(),
    );
    expect(close).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() =>
      dialog.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 40, clientY: 40 }),
      ),
    );
    expect(close).toHaveBeenCalledTimes(2);
    act(() =>
      dialog.dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }),
      ),
    );
    expect(close).toHaveBeenCalledTimes(3);
  });
});
