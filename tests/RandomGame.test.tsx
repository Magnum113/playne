// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RandomGame, { RANDOM_GAME_SHUFFLE_MS } from "../src/RandomGame";
import { chooseRandomGame, randomGameChoices } from "../src/randomGameCatalog";

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(props: Parameters<typeof RandomGame>[0] = {}) {
  root = createRoot(container);
  await act(async () => root!.render(<RandomGame {...props} />));
  return container.querySelector<HTMLButtonElement>("button")!;
}

describe("random game launch", () => {
  it("server-renders a native named button without browser APIs", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("sessionStorage", undefined);
    const html = renderToString(<RandomGame />);
    expect(html).toContain('type="button"');
    expect(html).toContain("Во что-нибудь!");
    expect(html).toContain("Открыть случайную игру");
  });

  it("opens exactly one known game after a short shuffle, despite rapid repeat clicks", async () => {
    const navigate = vi.fn();
    const button = await mount({ onNavigate: navigate });
    act(() => {
      button.click();
      button.click();
    });
    expect(button.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Выбираем");
    expect(navigate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/naglaz/");
    expect(sessionStorage.getItem("playne:random-game:last")).toBe("/naglaz/");
  });

  it("navigates immediately when reduced motion is requested", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const navigate = vi.fn();
    const button = await mount({ onNavigate: navigate });
    act(() => button.click());
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/naglaz/");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not immediately repeat the previous destination", async () => {
    sessionStorage.setItem("playne:random-game:last", "/naglaz/");
    const navigate = vi.fn();
    const button = await mount({ onNavigate: navigate });
    act(() => button.click());
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/circle/");
  });

  it("remains usable when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const navigate = vi.fn();
    const button = await mount({ onNavigate: navigate });
    act(() => button.click());
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/naglaz/");
  });

  it("cancels pending navigation if the component unmounts", async () => {
    const navigate = vi.fn();
    const button = await mount({ onNavigate: navigate });
    act(() => button.click());
    act(() => root!.unmount());
    root = undefined;
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reenables the launch control when restored by browser Back", async () => {
    const button = await mount({ onNavigate: vi.fn() });
    act(() => button.click());
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(button.disabled).toBe(true);
    act(() => window.dispatchEvent(new Event("pageshow")));
    expect(button.disabled).toBe(false);
  });

  it("the design-system demo can be replayed without navigation or changing saved picks", async () => {
    sessionStorage.setItem("playne:random-game:last", "/geo/");
    const navigate = vi.fn();
    const button = await mount({ demo: true, onNavigate: navigate });
    act(() => button.click());
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/naglaz/");
    expect(container.textContent).toContain("Выпала игра «На глаз»");
    act(() => button.click());
    act(() => vi.advanceTimersByTime(RANDOM_GAME_SHUFFLE_MS));
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/circle/");
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("playne:random-game:last")).toBe("/geo/");
  });
});

describe("random game catalog", () => {
  it("includes each public start route exactly once, including all four warmup games", () => {
    expect(randomGameChoices).toHaveLength(11);
    expect(new Set(randomGameChoices.map(({ href }) => href)).size).toBe(11);
    for (const game of ["flash", "rotate", "slide", "dispatch"])
      expect(randomGameChoices.some(({ href }) => href === `/brain/${game}/`)).toBe(true);
  });

  it("every choice is reachable and excludes the last pick", () => {
    const selected = randomGameChoices.map((_, index) =>
      chooseRandomGame(null, () => (index + .5) / randomGameChoices.length).href,
    );
    expect(selected).toEqual(randomGameChoices.map(({ href }) => href));
    for (const last of randomGameChoices)
      for (const draw of [0, .25, .5, .75, .999999])
        expect(chooseRandomGame(last.href, () => draw).href).not.toBe(last.href);
  });
});
