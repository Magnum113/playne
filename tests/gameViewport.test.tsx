// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  fitGameViewport,
  gameViewportDelta,
  useGameViewport,
} from "../src/useGameViewport";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [{ top: 100, bottom: 700 }, 0, 900, 0],
  [{ top: 300, bottom: 960 }, 0, 900, 76],
  [{ top: -20, bottom: 600 }, 0, 900, -36],
  [{ top: 180, bottom: 1400 }, 0, 900, 164],
  [{ top: 200, bottom: 780 }, 60, 700, 36],
])(
  "computes the smallest scroll that preserves the play area",
  (bounds, top, height, expected) => {
    expect(
      gameViewportDelta(
        bounds as { top: number; bottom: number },
        top as number,
        height as number,
      ),
    ).toBe(expected);
  },
);

it("fits the drawing and actions without scrolling to an email/account offer below them", () => {
  vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("visualViewport", null);
  const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  const section = document.createElement("section"),
    controls = document.createElement("div");
  controls.className = "controls";
  section.append(controls);
  document.body.append(section);
  vi.spyOn(section, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 300, 500, 1400),
  );
  vi.spyOn(controls, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 900, 500, 60),
  );
  fitGameViewport(section, ".controls");
  expect(scroll).toHaveBeenCalledWith({ top: 76, behavior: "instant" });
  const dialog = document.createElement("dialog");
  dialog.open = true;
  document.body.append(dialog);
  fitGameViewport(section, ".controls");
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("does not scroll on pointer/timer renders and repositions after an explicit next round", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("visualViewport", null);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 300, 500, 660),
  );
  const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  function Game({
    transition,
    tick,
  }: {
    transition: string | null;
    tick: number;
  }) {
    const ref = useRef<HTMLElement>(null);
    useGameViewport(ref, transition);
    return <section ref={ref}>{tick}</section>;
  }
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box);
  try {
    act(() => root.render(<Game transition="round:1" tick={0} />));
    act(() => root.render(<Game transition="round:1" tick={1} />));
    expect(scroll).toHaveBeenCalledTimes(1);
    act(() => root.render(<Game transition={null} tick={2} />));
    expect(scroll).toHaveBeenCalledTimes(1);
    act(() => root.render(<Game transition="round:2" tick={3} />));
    expect(scroll).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
  }
});
