// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { makePressLevel, appendPressBatch } from "../src/pressure";
const access = vi.hoisted(() => ({
  user: { id: "test" } as { id: string } | null,
  ready: true,
  loading: false,
  blocked: false,
  resume: false,
}));
const mocks = vi.hoisted(() => ({ begin: vi.fn(), submit: vi.fn() }));
vi.mock("../src/GameResult", () => ({
  SaveResult: () => <p>Результат сохранён в рейтинг.</p>,
}));
vi.mock("../src/account", () => ({
  useGuestTrial: () => access,
  GuestTrialPrompt: () => null,
  GuestSavedNotice: () => null,
  AccountNav: () => null,
  useRankedRun: () => ({ ...mocks, state: { status: "complete" } }),
  SaveResult: () => <p>Результат сохранён в рейтинг.</p>,
}));
import PressureGame from "../src/PressureGame";
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  access.user = { id: "test" };
  access.resume = false;
  mocks.submit.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function begin(family: Parameters<typeof makePressLevel>[0]) {
  const l = makePressLevel(family, 0, () => 0);
  mocks.begin.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    challenge: {
      rulesVersion: 2,
      seed: 17,
      recent: [],
      levels: Array(30).fill(l),
    },
  });
  await act(async () => root.render(<PressureGame />));
  const start = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Начать игру"),
  )!;
  await act(async () => start.click());
  await act(async () => vi.advanceTimersByTime(1950));
  return l;
}
function key(type: "keydown" | "keyup", repeat = false) {
  container
    .querySelector('[aria-label="Игровая кнопка"]')!
    .dispatchEvent(
      new KeyboardEvent(type, { key: " ", bubbles: true, repeat }),
    );
}
describe("Pressure input and completion lifecycle", () => {
  it("continues after level 30, improves an old record and saves immediately on the first later mistake", async () => {
    localStorage.setItem(
      "playne:pressure:v1",
      JSON.stringify({ best: 30, played: 1, recent: [] }),
    );
    const tap = await begin("tap");
    for (let i = 0; i < 30; i++) {
      act(() => {
        key("keydown");
        key("keyup");
      });
      await act(async () => vi.advanceTimersByTime(450));
      await act(async () => vi.advanceTimersByTime(750));
    }
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(container.textContent).toContain("УРОВЕНЬ 31");
    const continuation = appendPressBatch(17, Array(30).fill(tap));
    const l = continuation[0];
    if (l.kind === "wait")
      await act(async () => vi.advanceTimersByTime(l.duration));
    else if (["hold", "release"].includes(l.kind)) {
      act(() => key("keydown"));
      await act(async () => vi.advanceTimersByTime((l.from + l.to) / 2));
      act(() => key("keyup"));
    } else {
      await act(async () => vi.advanceTimersByTime(l.from + 100));
      for (let i = 0; i < l.count; i++) {
        act(() => {
          key("keydown");
          key("keyup");
        });
        await act(async () => vi.advanceTimersByTime(170));
      }
    }
    await act(async () => vi.advanceTimersByTime(450));
    await act(async () => vi.advanceTimersByTime(750));
    expect(container.textContent).toContain("УРОВЕНЬ 32");
    if (continuation[1].kind === "wait") act(() => key("keydown"));
    else
      await act(async () =>
        vi.advanceTimersByTime(continuation[1].duration + 50),
      );
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(600));
    expect(container.textContent).toContain("ПОПЫТКА ЗАВЕРШЕНА");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls[0][1].rounds).toHaveLength(32);
    expect(JSON.parse(localStorage.getItem("playne:pressure:v1")!).best).toBe(
      31,
    );
  });

  it("resumes a guest at the next level even when leaving during success feedback", async () => {
    access.user = null;
    await begin("tap");
    act(() => {
      key("keydown");
      key("keyup");
    });
    await act(async () => vi.advanceTimersByTime(450));
    const saved = JSON.parse(
      localStorage.getItem("playne:pressure-active:v1")!,
    );
    expect(saved.state.index).toBe(1);
    expect(saved.state.traces).toHaveLength(1);
    act(() => root.unmount());
    root = createRoot(container);
    access.resume = true;
    await act(async () => root.render(<PressureGame />));
    const resume = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Продолжить партию"),
    )!;
    await act(async () => resume.click());
    await act(async () => vi.advanceTimersByTime(1950));
    expect(container.textContent).toContain("УРОВЕНЬ 2");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("counts a keyboard press once, ignores auto-repeat, and advances after feedback", async () => {
    await begin("tap");
    act(() => {
      key("keydown");
      key("keydown", true);
      key("keyup");
    });
    await act(async () => vi.advanceTimersByTime(450));
    expect(container.textContent).toContain("Есть. Следующее правило");
    expect(mocks.submit).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(750));
    expect(container.textContent).toContain("УРОВЕНЬ 2");
  });
  it("times out, immediately queues a result and records the attempt without starting another game", async () => {
    const l = await begin("tap");
    await act(async () => vi.advanceTimersByTime(l.duration + 50));
    expect(container.textContent).toContain("Время вышло");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.submit.mock.calls[0][0]).toBe(0);
    expect(JSON.parse(localStorage.getItem("playne:pressure:v1")!).played).toBe(
      1,
    );
    expect(container.querySelector(".is-failure")).not.toBeNull();
    expect(container.querySelector(".pressure-result")).toBeNull();
    await act(async () => vi.advanceTimersByTime(600));
    expect(container.textContent).toContain("Результат сохранён в рейтинг");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      container.querySelector(".pressure-result"),
    );
  });
  it("does not mistake the finish countdown for a press on wait levels", async () => {
    const l = await begin("restraint");
    await act(async () => vi.advanceTimersByTime(l.duration + 50));
    expect(container.textContent).toContain("Есть. Следующее правило");
  });
  it("keeps playing after lost capture and another pointer's cancel, and receives release outside the button", async () => {
    await begin("tap");
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Игровая кнопка"]',
    )!;
    button.setPointerCapture = vi.fn();
    act(() =>
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
        }),
      ),
    );
    act(() => {
      button.dispatchEvent(
        new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 7 }),
      );
      button.dispatchEvent(
        new PointerEvent("pointercancel", { bubbles: true, pointerId: 99 }),
      );
    });
    expect(container.textContent).not.toContain("Продолжим?");
    act(() =>
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 })),
    );
    await act(async () => vi.advanceTimersByTime(450));
    expect(container.textContent).toContain("Есть. Следующее правило");
    await act(async () => vi.advanceTimersByTime(750));
    expect(container.textContent).toContain("УРОВЕНЬ 2");
  });
  it("receives keyboard release after focus moves outside the game button", async () => {
    await begin("hold");
    act(() => key("keydown"));
    await act(async () => vi.advanceTimersByTime(1000));
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: " " })));
    await act(async () => vi.advanceTimersByTime(450));
    expect(container.textContent).toContain("Есть. Следующее правило");
  });
  it("pauses only for cancellation of the active gesture or real window focus loss", async () => {
    await begin("hold");
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Игровая кнопка"]',
    )!;
    button.setPointerCapture = vi.fn();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => window.dispatchEvent(new FocusEvent("blur")));
    await act(async () => vi.advanceTimersByTime(100));
    expect(container.textContent).not.toContain("Продолжим?");
    act(() =>
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 7,
          isPrimary: true,
          button: 0,
        }),
      ),
    );
    act(() =>
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7 })),
    );
    expect(container.textContent).toContain("Продолжим?");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("shows sequence numbers in order before revealing the answer phase", async () => {
    await begin("sequence");
    expect(
      container.querySelector(".pressure-button-content")!.textContent,
    ).toBe("СМОТРИ");
    // This seeded level has known timed frames; sample the visible control at each boundary.
    const level = makePressLevel("sequence", 0, () => 0);
    await act(async () => vi.advanceTimersByTime(1450));
    expect(
      container.querySelector(".pressure-button-content")!.textContent,
    ).toBe(level.frames![0]);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(
      container.querySelector(".pressure-button-content")!.textContent,
    ).toBe(level.frames![1]);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(
      container.querySelector(".pressure-button-content")!.textContent,
    ).toBe(level.frames![2]);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(
      container.querySelector(".pressure-button-content")!.textContent,
    ).toBe("?");
  });
  it("pauses on blur, resets current-level input on resume, and keeps completed levels", async () => {
    await begin("hold");
    act(() => key("keydown"));
    await act(async () => vi.advanceTimersByTime(500));
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    act(() => window.dispatchEvent(new FocusEvent("blur")));
    await act(async () => vi.advanceTimersByTime(100));
    expect(container.textContent).toContain("Продолжим?");
    await act(async () => vi.advanceTimersByTime(20000));
    expect(mocks.submit).not.toHaveBeenCalled();
    const resume = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Продолжить"),
    )!;
    act(() => resume.click());
    act(() => key("keydown"));
    await act(async () => vi.advanceTimersByTime(1000));
    act(() => key("keyup"));
    await act(async () => vi.advanceTimersByTime(450));
    expect(container.textContent).toContain("Есть. Следующее правило");
  });
});
