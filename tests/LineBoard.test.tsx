// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LineBoard from "../src/LineBoard";
import { LINE_INTRO_PATH, LINE_INTRO_PUZZLE, linePathState, type LinePuzzle } from "../src/line";

let root: Root;
let container: HTMLDivElement;
let board: HTMLDivElement;
let path: number[];
let replacePath: (next: number[]) => void;
const changed = vi.fn();
const completed = vi.fn();
const message = vi.fn();
const rect = new DOMRect(20, 30, 300, 300);

function mount(puzzle = LINE_INTRO_PUZZLE, initial: number[] = [], disabled = false) {
  function Harness() {
    const [value, setValue] = useState(initial);
    path = value;
    replacePath = setValue;
    return <LineBoard puzzle={puzzle} path={value} disabled={disabled} onMessage={message}
      onPathChange={(next) => {
        changed(next);
        setValue(next);
        if (linePathState(puzzle, next).complete) completed(next);
      }} />;
  }
  act(() => root.render(<Harness />));
  board = container.querySelector<HTMLDivElement>(".line-board")!;
  vi.spyOn(board, "getBoundingClientRect").mockReturnValue(rect);
  board.setPointerCapture = vi.fn();
}

function cell(index: number) {
  return container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!;
}

function pointer(type: string, index: number, options: PointerEventInit = {}) {
  act(() => board.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: rect.left + (index % 3 + .5) * 100,
    clientY: rect.top + (Math.floor(index / 3) + .5) * 100,
    ...options,
  })));
}

function keyboard(key: string) {
  const target = document.activeElement as HTMLButtonElement;
  act(() => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    // happy-dom does not synthesize the native button click made by Enter/Space.
    // Reproduce that browser default only when the handler did not cancel it.
    if ((key === "Enter" || key === " ") && !event.defaultPrevented && !target.disabled)
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  changed.mockClear(); completed.mockClear(); message.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("one-line board keyboard", () => {
  it("has one tab stop and moves focus with arrows without drawing or wrapping rows", () => {
    mount();
    expect([...container.querySelectorAll("button")].filter((button) => button.tabIndex === 0)).toEqual([cell(0)]);
    act(() => cell(0).focus());
    keyboard("ArrowRight"); keyboard("ArrowRight");
    expect(document.activeElement).toBe(cell(2));
    keyboard("ArrowRight");
    expect(document.activeElement).toBe(cell(2));
    keyboard("ArrowDown");
    expect(document.activeElement).toBe(cell(5));
    keyboard("ArrowUp"); keyboard("ArrowLeft");
    expect(document.activeElement).toBe(cell(1));
    expect(path).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("draws through native Enter/Space activation, rejects jumps and undoes with Backspace", () => {
    mount();
    act(() => cell(0).focus()); keyboard("Enter");
    keyboard("ArrowRight"); keyboard(" ");
    expect(path).toEqual([0, 1]);
    expect(cell(1).getAttribute("aria-pressed")).toBe("true");
    keyboard("ArrowDown"); keyboard("ArrowRight"); keyboard("Enter");
    expect(path).toEqual([0, 1]);
    expect(message).toHaveBeenCalledWith(expect.any(String));
    keyboard("Backspace");
    expect(path).toEqual([0]);
    keyboard("Backspace"); keyboard("Backspace");
    expect(path).toEqual([]);
  });
});

describe("one-line board pointer input", () => {
  it("interpolates skipped cells in straight fast drags and stops before an early finish", () => {
    mount();
    pointer("pointerdown", 0); pointer("pointermove", 2);
    expect(path).toEqual([0, 1, 2]);
    pointer("pointermove", 8);
    expect(path).toEqual([0, 1, 2, 5]);
    expect(completed).not.toHaveBeenCalled();
  });

  it("does not cross a wall during interpolation", () => {
    mount({ ...LINE_INTRO_PUZZLE, walls: [[1, 2]] });
    pointer("pointerdown", 0); pointer("pointermove", 2);
    expect(path).toEqual([0, 1]);
    expect(completed).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".line-wall")).toHaveLength(1);
  });

  it("ignores diagonals, invalid starts and non-primary/right-button input", () => {
    mount();
    pointer("pointerdown", 1); pointer("pointerup", 1);
    expect(path).toEqual([]);
    pointer("pointerdown", 0, { isPrimary: false, pointerId: 2 });
    pointer("pointerdown", 0, { button: 2 });
    expect(path).toEqual([]);
    pointer("pointerdown", 0); pointer("pointermove", 4);
    expect(path).toEqual([0]);
    pointer("pointermove", 1);
    expect(path).toEqual([0, 1]);
  });

  it("retracts along a drag and lets pointer clicks continue without duplicate native clicks", () => {
    mount();
    pointer("pointerdown", 0); pointer("pointermove", 2); pointer("pointermove", 0);
    expect(path).toEqual([0]);
    pointer("pointerup", 0);
    pointer("pointerdown", 1); pointer("pointerup", 1);
    act(() => cell(1).dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(path).toEqual([0, 1]);
    pointer("pointerdown", 0); pointer("pointerup", 0);
    expect(path).toEqual([0]);
  });

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "ignores %s from an unrelated pointer while a drag is active", (ending) => {
      mount();
      pointer("pointerdown", 0, { pointerType: "touch" });
      pointer(ending, 0, { pointerId: 2, isPrimary: false, pointerType: "touch" });
      pointer("pointermove", 2, { pointerType: "touch" });
      expect(path).toEqual([0, 1, 2]);
    },
  );

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "stops the matching drag on %s without changing the path", (ending) => {
      mount();
      pointer("pointerdown", 0); pointer(ending, 0); pointer("pointermove", 2);
      expect(path).toEqual([0]);
    },
  );

  it("uses restored/hinted parent state instead of the earlier pointer tip", () => {
    mount();
    pointer("pointerdown", 0); pointer("pointerup", 0);
    act(() => replacePath([0, 1, 2]));
    pointer("pointerdown", 5); pointer("pointerup", 5);
    expect(path).toEqual([0, 1, 2, 5]);
  });

  it("announces completion only after all cells and checkpoints have been traversed", () => {
    mount();
    for (let i = 0; i < LINE_INTRO_PATH.length - 1; i++) {
      pointer("pointerdown", LINE_INTRO_PATH[i]); pointer("pointerup", LINE_INTRO_PATH[i]);
      expect(completed).not.toHaveBeenCalled();
    }
    pointer("pointerdown", LINE_INTRO_PATH.at(-1)!); pointer("pointerup", LINE_INTRO_PATH.at(-1)!);
    expect(completed).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledWith([...LINE_INTRO_PATH]);
  });

  it("ignores pointer and keyboard activation while disabled", () => {
    mount(LINE_INTRO_PUZZLE, [], true);
    pointer("pointerdown", 0); pointer("pointermove", 2);
    act(() => cell(0).dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(path).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });
});
