// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DispatchBoard, FlashBoard, SlideBoard } from "../src/BrainBoards";
import {
  makeBrainChallenge,
  type DispatchAction,
  type DispatchRound,
  type SlideMove,
  type SlideRound,
} from "../src/brain";

let box: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("brain board controls", () => {
  function SlideTrace({ puzzle }: { puzzle: SlideRound }) {
    const [moves, setMoves] = useState<SlideMove[]>([]);
    return (
      <>
        <SlideBoard round={puzzle} moves={moves} onChange={setMoves} />
        <output className="test-slide-trace">{JSON.stringify(moves)}</output>
        <button
          className="test-slide-undo"
          onClick={() => setMoves((current) => current.slice(0, -1))}
        >
          Отменить ход
        </button>
      </>
    );
  }
  const openParking: SlideRound = {
    kind: "slide",
    id: "fair-input",
    stage: 0,
    size: 6,
    parMoves: 1,
    cars: [
      { id: "R", x: 0, y: 2, length: 2, axis: "x" },
      { id: "A", x: 5, y: 4, length: 2, axis: "y" },
    ],
  };
  const trace = () =>
    JSON.parse(box.querySelector(".test-slide-trace")!.textContent!);
  async function arrow(carId: string, key: string) {
    const car = box.querySelector<HTMLButtonElement>(
      `[aria-label^="Машина ${carId}"]`,
    )!;
    await act(async () => {
      car.focus();
      car.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  it("counts three arrow presses as one car move and merges reversals to zero", async () => {
    await act(async () => root.render(<SlideTrace puzzle={openParking} />));
    for (let i = 0; i < 3; i++) await arrow("R", "ArrowRight");
    expect(trace()).toEqual([{ carId: "R", delta: 3 }]);
    await arrow("R", "ArrowLeft");
    expect(trace()).toEqual([{ carId: "R", delta: 2 }]);
    await arrow("R", "ArrowLeft");
    await arrow("R", "ArrowLeft");
    expect(trace()).toEqual([]);
    for (let i = 0; i < 3; i++) await arrow("R", "ArrowRight");
    await act(async () =>
      box.querySelector<HTMLButtonElement>(".test-slide-undo")!.click(),
    );
    expect(trace()).toEqual([]); // Undo removes the whole combined move.
  });

  it("keeps separate moves when another car moved between them", async () => {
    await act(async () => root.render(<SlideTrace puzzle={openParking} />));
    await arrow("R", "ArrowRight");
    await arrow("A", "ArrowUp");
    await arrow("R", "ArrowRight");
    expect(trace()).toEqual([
      { carId: "R", delta: 1 },
      { carId: "A", delta: -1 },
      { carId: "R", delta: 1 },
    ]);
    await arrow("R", "ArrowLeft");
    expect(trace()).toEqual([
      { carId: "R", delta: 1 },
      { carId: "A", delta: -1 },
    ]);
  });

  it("validates a colliding step before changing a combined move", async () => {
    const puzzle: SlideRound = {
      ...openParking,
      id: "blocked-input",
      cars: [
        openParking.cars[0],
        { id: "A", x: 3, y: 1, length: 2, axis: "y" },
      ],
    };
    await act(async () => root.render(<SlideTrace puzzle={puzzle} />));
    await arrow("R", "ArrowRight");
    expect(trace()).toEqual([{ carId: "R", delta: 1 }]);
    await arrow("R", "ArrowRight");
    expect(trace()).toEqual([{ carId: "R", delta: 1 }]);
    await arrow("R", "ArrowLeft");
    expect(trace()).toEqual([]);
  });

  it("keeps a memory answer free of hidden target clues and caps selections", async () => {
    const change = vi.fn();
    await act(async () =>
      root.render(
        <FlashBoard
          round={{
            kind: "flash",
            id: "f",
            stage: 0,
            rows: 3,
            cols: 3,
            count: 2,
            showMs: 2400,
            cells: [1, 7],
          }}
          phase="answer"
          selected={[0, 3]}
          onChange={change}
        />,
      ),
    );
    expect(box.querySelectorAll(".is-target")).toHaveLength(0);
    const buttons = box.querySelectorAll<HTMLButtonElement>("button");
    await act(async () => buttons[1].click());
    expect(change).toHaveBeenLastCalledWith([0, 3]);
    await act(async () => buttons[0].click());
    expect(change).toHaveBeenLastCalledWith([3]);
    expect(
      [...buttons].every(
        (b) => !b.getAttribute("aria-label")?.includes("верно"),
      ),
    ).toBe(true);
  });

  it("moves a selected car with the keyboard and rejects crossing occupied cells", async () => {
    const history: SlideMove[][] = [];
    const puzzle: SlideRound = {
      kind: "slide",
      id: "s",
      stage: 0,
      size: 6,
      parMoves: 2,
      cars: [
        { id: "R", x: 0, y: 2, length: 2, axis: "x" },
        { id: "A", x: 2, y: 1, length: 2, axis: "y" },
      ],
    };
    function Harness() {
      const [moves, setMoves] = useState<SlideMove[]>([]);
      return (
        <SlideBoard
          round={puzzle}
          moves={moves}
          onChange={(next) => {
            history.push(next);
            setMoves(next);
          }}
        />
      );
    }
    await act(async () => root.render(<Harness />));
    const red = box.querySelector<HTMLButtonElement>(
      '[aria-label^="Машина R"]',
    )!;
    await act(async () =>
      red.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(history).toHaveLength(0);
    const car = box.querySelector<HTMLButtonElement>(
      '[aria-label^="Машина A"]',
    )!;
    await act(async () => {
      car.focus();
      car.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    expect(history.at(-1)).toEqual([{ carId: "A", delta: -1 }]);
    await act(async () => {
      red.focus();
      red.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(history.at(-1)).toEqual([
      { carId: "A", delta: -1 },
      { carId: "R", delta: 1 },
    ]);
    expect(
      box
        .querySelector('[aria-label="Сдвинуть машину R вниз на клетку"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("records active railway switches at real elapsed time and stops after the wave", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const round = makeBrainChallenge("dispatch", 123)
      .rounds[0] as DispatchRound;
    const changes: DispatchAction[][] = [];
    function Harness() {
      const [actions, setActions] = useState<DispatchAction[]>([]);
      return (
        <DispatchBoard
          round={round}
          actions={actions}
          onChange={(next) => {
            changes.push(next);
            setActions(next);
          }}
          startedAt={99_000}
          serverOffset={0}
        />
      );
    }
    await act(async () => root.render(<Harness />));
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" })),
    );
    expect(changes).toHaveLength(0); // The first wave has only switch 2.
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" })),
    );
    expect(changes.at(-1)?.[0]).toMatchObject({ atMs: 1000, switch: 1 });
    vi.setSystemTime(99_500);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" })),
    );
    expect(changes.at(-1)?.map((action) => action.atMs)).toEqual([1000, 1000]);
    vi.setSystemTime(100_000 + round.durationMs);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" })),
    );
    expect(changes).toHaveLength(2);
  });

  it("ignores a second finger without cancelling the primary car drag", async () => {
    const changes = vi.fn();
    const round: SlideRound = {
      kind: "slide",
      id: "touch",
      stage: 0,
      size: 6,
      parMoves: 1,
      cars: [
        { id: "R", x: 0, y: 2, length: 2, axis: "x" },
        { id: "A", x: 5, y: 4, length: 2, axis: "y" },
      ],
    };
    await act(async () =>
      root.render(<SlideBoard round={round} moves={[]} onChange={changes} />),
    );
    vi.spyOn(
      box.querySelector(".brain-parking")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, 0, 360, 360));
    const red = box.querySelector<HTMLButtonElement>(
      '[aria-label^="Машина R"]',
    )!;
    const other = box.querySelector<HTMLButtonElement>(
      '[aria-label^="Машина A"]',
    )!;
    Object.defineProperty(red, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(other, "setPointerCapture", { value: vi.fn() });
    const event = (name: string, id: number, x: number, primary: boolean) =>
      new PointerEvent(name, {
        bubbles: true,
        pointerId: id,
        clientX: x,
        clientY: 140,
        button: 0,
        isPrimary: primary,
      });
    await act(async () => red.dispatchEvent(event("pointerdown", 1, 30, true)));
    await act(async () =>
      other.dispatchEvent(event("pointerdown", 2, 280, false)),
    );
    await act(async () =>
      other.dispatchEvent(event("pointerup", 2, 280, false)),
    );
    await act(async () =>
      red.dispatchEvent(event("pointercancel", 2, 280, false)),
    );
    await act(async () => red.dispatchEvent(event("pointermove", 1, 90, true)));
    await act(async () => red.dispatchEvent(event("pointerup", 1, 90, true)));
    expect(changes).toHaveBeenCalledExactlyOnceWith([{ carId: "R", delta: 1 }]);
    expect(other.setPointerCapture).not.toHaveBeenCalled();
  });
});
