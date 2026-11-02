// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { FlowSupply } from "../src/FlowSupply";
import { FLOW_COLORS, initialFlow, type FlowPuzzle } from "../src/flow";

it("promotes the same mystery packet node and centres remaining lanes without changing lane identity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const puzzle: FlowPuzzle = {
    version: 4,
    id: "queue:v4",
    name: "Queue",
    width: 1,
    height: 1,
    cells: [0],
    slots: 5,
    solution: [],
    lanes: [
      [
        { id: 0, color: 0, count: 1 },
        { id: 1, color: 1, count: 7, mystery: true },
      ],
      [{ id: 2, color: 2, count: 3 }],
    ],
  };
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box),
    supply = { current: null as HTMLDivElement | null },
    launch = vi.fn();
  const state = initialFlow(puzzle);
  const render = async () =>
    act(async () =>
      root.render(
        <FlowSupply
          puzzle={puzzle}
          state={{ ...state, lanes: [...state.lanes] }}
          freeSlots={5}
          exposedColors={new Set([0, 1, 2])}
          supply={supply}
          onButton={() => {}}
          onPreview={() => {}}
          onLaunch={launch}
        />,
      ),
    );
  try {
    await render();
    const secret = box.querySelector('[data-flow-packet="1"]')!;
    expect(secret.getAttribute("aria-label")).toBe("Скрытая команда");
    expect(secret.querySelector("text")?.textContent).toBe("?");
    expect(secret.innerHTML).not.toContain(FLOW_COLORS[1].hex);
    state.lanes[0] = 1;
    state.lanes[1] = 1;
    await render();
    expect(box.querySelector('[data-flow-packet="1"]')).toBe(secret);
    expect(secret.querySelector("text")?.textContent).toBe("7");
    expect(box.querySelectorAll(".flow-lane-live")).toHaveLength(1);
    expect(
      box.querySelector(".flow-lane-live")?.getAttribute("style"),
    ).toContain("--queue-column: 0");
    await act(async () => secret.querySelector("button")!.click());
    expect(launch).toHaveBeenCalledExactlyOnceWith(0);
  } finally {
    await act(async () => root.unmount());
    box.remove();
    vi.unstubAllGlobals();
  }
});
