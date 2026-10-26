// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CircleGame from "../src/CircleGame";
import { CIRCLE_BEST_KEY } from "../src/circle";

const access = vi.hoisted(() => ({
  user: { id: "test" } as { id: string } | null,
  ready: true,
  loading: false,
  blocked: false,
  resume: false,
}));
const ranked = vi.hoisted(() => ({ begin: vi.fn(), submit: vi.fn() }));
vi.mock("../src/account", () => ({
  useGuestTrial: () => access,
  GuestTrialPrompt: () => null,
  GuestSavedNotice: () => null,
  useRankedRun: () => ranked,
  AccountNav: () => null,
  SaveResult: () => null,
}));

let root: Root;
let container: HTMLDivElement;
let board: SVGSVGElement;
let rect: DOMRect;
let pointerType: "mouse" | "touch";
function event(type: string, x = 0, y = 0, id = 1) {
  act(() => {
    board.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: id,
        pointerType,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: rect.left + (x * rect.width) / 600,
        clientY: rect.top + (y * rect.height) / 600,
      }),
    );
  });
}
function arc(turns = 1, shift = false) {
  event("pointerdown", 470, 300);
  for (let i = 1; i <= 120; i++) {
    if (shift && i === 100) rect = new DOMRect(25, 108, 540, 540);
    const angle = (i / 120) * Math.PI * 2 * turns;
    event(
      "pointermove",
      300 + 170 * Math.cos(angle),
      300 + 170 * Math.sin(angle),
    );
  }
}
function status() {
  return container.querySelector("#circle-status")!.textContent;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  access.user = { id: "test" };
  ranked.begin.mockReset();
  ranked.submit.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<CircleGame />));
  board = container.querySelector(".circle-board")!;
  rect = new DOMRect(20, 100, 600, 600);
  pointerType = "touch";
  vi.spyOn(board, "getBoundingClientRect").mockImplementation(() => rect);
  // Synthetic test events have no real browser pointer to capture.
  board.setPointerCapture = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("circle pointer endings", () => {
  it("lets a guest retry an invalid stroke but blocks a second scored circle", () => {
    access.user = null;
    act(() => root.render(<CircleGame />));
    arc(0.5);
    event("pointerup", 130, 300);
    expect(ranked.submit).not.toHaveBeenCalled();
    arc();
    event("pointerup", 470, 300);
    expect(ranked.submit).toHaveBeenCalledTimes(1);
    expect(
      [...container.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Ещё раз"),
      ),
    ).toBe(false);
    arc();
    event("pointerup", 470, 300);
    expect(ranked.submit).toHaveBeenCalledTimes(1);
  });
  it("keeps a scored guest circle when Escape is pressed before the server acknowledgement", () => {
    access.user = null;
    act(() => root.render(<CircleGame />));
    arc();
    event("pointerup", 470, 300);
    act(() =>
      board.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(status()).toContain("Точность 100,0%");
    arc();
    event("pointerup", 470, 300);
    expect(ranked.submit).toHaveBeenCalledTimes(1);
  });
  it("scores a mouse stroke on ordinary release", () => {
    pointerType = "mouse";
    arc();
    event("pointerup", 470, 300);
    event("lostpointercapture");
    expect(status()).toContain("Точность 100,0%");
    expect(ranked.submit).toHaveBeenCalledTimes(1);
  });
  it.each(["pointercancel", "lostpointercapture"])(
    "scores a closed stroke on %s without using its missing endpoint or submitting twice",
    (type) => {
      arc();
      event(type);
      event("lostpointercapture");
      event("pointerup", 470, 300);
      expect(status()).toContain("Точность 100,0%");
      expect(ranked.submit).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(CIRCLE_BEST_KEY)).toBe("100");
    },
  );
  it.each(["pointercancel", "lostpointercapture"])(
    "rejects an unfinished stroke on %s",
    (type) => {
      arc(0.5);
      event(type);
      expect(status()).toContain("Линия прервалась");
      expect(ranked.submit).not.toHaveBeenCalled();
      expect(localStorage.getItem(CIRCLE_BEST_KEY)).toBeNull();
    },
  );
  it("ignores cancellation and capture loss from another pointer", () => {
    arc();
    event("pointercancel", 0, 0, 2);
    event("lostpointercapture", 0, 0, 2);
    expect(status()).toContain("Продолжай линию");
    event("pointerup", 470, 300);
    expect(status()).toContain("Точность 100,0%");
    expect(ranked.submit).toHaveBeenCalledTimes(1);
  });
  it("keeps SVG coordinates valid when the board moves or resizes mid-stroke", () => {
    arc(1, true);
    event("pointerup", 470, 300);
    expect(status()).toContain("Точность 100,0%");
    expect(ranked.submit).toHaveBeenCalledTimes(1);
  });
  it("still rejects a stroke outside the field even when it has already made a circle", () => {
    arc();
    event("pointermove", 610, 300);
    event("pointercancel");
    expect(status()).toContain("Круг вышел за поле");
    expect(ranked.submit).not.toHaveBeenCalled();
  });
});
