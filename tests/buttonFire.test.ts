// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class Preference extends EventTarget {
  matches = false;
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event("change")); }
}

let reduced: Preference, forced: Preference;
let intersection: (entries: Partial<IntersectionObserverEntry>[]) => void;
let resize: () => void, hidden = false;
let frames: Map<number, FrameRequestCallback>, nextFrame: number;
let context: Record<string, ReturnType<typeof vi.fn>>;
let button: HTMLButtonElement, canvas: HTMLCanvasElement, cleanup: (() => void) | undefined;
const see = (visible: boolean) => intersection([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
const tick = (ms: number) => {
  const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(ms));
};
const start = async () => { await vi.advanceTimersByTimeAsync(200); };

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  reduced = new Preference(); forced = new Preference(); hidden = false;
  frames = new Map(); nextFrame = 0;
  vi.stubGlobal("matchMedia", (query: string) => query.includes("reduced-motion") ? reduced : forced);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof intersection) { intersection = callback; } observe() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  context = Object.fromEntries(["setTransform", "clearRect", "save", "restore", "setLineDash", "beginPath", "moveTo", "lineTo", "arcTo", "stroke", "translate", "rotate", "drawImage"].map(name => [name, vi.fn()]));
  context.createImageData = vi.fn((width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
  context.putImageData = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  button = document.createElement("button"); canvas = document.createElement("canvas");
  button.append(canvas); document.body.append(button);
  Object.defineProperty(button, "offsetWidth", { value: 210 });
  Object.defineProperty(button, "offsetHeight", { value: 52 });
  button.style.border = "1px solid"; button.style.borderRadius = "12px";
});
afterEach(() => {
  cleanup?.(); cleanup = undefined; button.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("approved continuous button fire", () => {
  it("ignites clockwise only after appearing, then covers the entire outline", async () => {
    const { attachButtonFire } = await import("../src/buttonFire");
    cleanup = attachButtonFire(button, canvas);
    see(false); await vi.advanceTimersByTimeAsync(1000);
    expect(frames.size).toBe(0);
    expect(button.dataset.fireState).toBe("waiting");
    see(true); await start();
    expect(button.dataset.fireState).toBe("igniting");
    for (let ms = 100; ms <= 300; ms += 40) tick(ms);
    const field = context.putImageData.mock.lastCall![0] as ImageData;
    const alpha = (x: number, y: number) => field.data[(y * field.width + x) * 4 + 3];
    expect(alpha(120, 49)).toBeGreaterThan(0); // top, lit first
    expect(alpha(120, 103)).toBe(0); // bottom, not reached yet
    for (let ms = 340; ms <= 900; ms += 40) tick(ms);
    expect(button.dataset.fireState).toBe("burning");
    for (const [x, y] of [[120, 49], [231, 76], [120, 103], [19, 76]]) expect(alpha(x, y)).toBeGreaterThan(0);
    expect(alpha(120, 76)).toBe(0); // opaque face stays clear
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("preserves one contour during press and resize, using unscaled layout dimensions", async () => {
    const { attachButtonFire } = await import("../src/buttonFire");
    cleanup = attachButtonFire(button, canvas);
    const width = canvas.style.width, height = canvas.style.height;
    vi.spyOn(button, "getBoundingClientRect").mockImplementation(() => { throw new Error("Pressed bounds must not resize the flame"); });
    button.style.transform = "scale(0.96)";
    expect(() => resize()).not.toThrow();
    expect(canvas.parentElement).toBe(button);
    expect(canvas.style.width).toBe(width);
    expect(canvas.style.height).toBe(height);
    expect(canvas.style.left).toBe("-21px");
  });

  it("pauses offscreen and in a hidden tab, and resumes without a second ignition", async () => {
    const { attachButtonFire } = await import("../src/buttonFire");
    cleanup = attachButtonFire(button, canvas); see(true); await start();
    for (let ms = 0; ms <= 1600; ms += 40) tick(ms);
    see(false); expect(frames.size).toBe(0);
    see(true); expect(frames.size).toBe(1);
    expect(button.dataset.fireState).toBe("burning");
    hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
    hidden = false; document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(1);
    expect(button.dataset.fireState).toBe("burning");
  });

  it("uses a static alternative under reduced motion and forced colors", async () => {
    reduced.matches = true;
    const { attachButtonFire } = await import("../src/buttonFire");
    cleanup = attachButtonFire(button, canvas); see(true); await vi.advanceTimersByTimeAsync(1000);
    expect(frames.size).toBe(0);
    expect(button.dataset.fireState).toBe("reduced");
    reduced.change(false); await start(); expect(frames.size).toBe(1);
    forced.change(true); expect(frames.size).toBe(0);
    expect(button.dataset.fireState).toBe("reduced");
  });

  it("leaves sharing functional without animation support", async () => {
    const { attachButtonFire } = await import("../src/buttonFire");
    const activate = vi.fn(); button.onclick = activate;
    vi.stubGlobal("IntersectionObserver", undefined);
    cleanup = attachButtonFire(button, canvas);
    button.click(); expect(activate).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false); expect(frames.size).toBe(0);
  });

  it("cleans up timers, frames and visibility subscriptions on unmount", async () => {
    const { attachButtonFire } = await import("../src/buttonFire");
    cleanup = attachButtonFire(button, canvas); see(true); cleanup(); cleanup = undefined;
    await vi.advanceTimersByTimeAsync(1000);
    document.dispatchEvent(new Event("visibilitychange"));
    reduced.change(true); expect(frames.size).toBe(0);
    expect(button.dataset.fireState).toBeUndefined();
  });
});
