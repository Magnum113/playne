// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachCardMotion, CARD_PREVIEW_DURATION } from "../src/useCardMotion";

let root: HTMLElement;
let cleanup: (() => void) | undefined;
let observe: IntersectionObserverCallback;
let reduced: MediaQueryList;
let touch: MediaQueryList;
function media(matches: boolean): MediaQueryList {
  return Object.assign(new EventTarget(), { matches }) as MediaQueryList;
}
function visible(...cards: HTMLElement[]) {
  observe(
    cards.map((target) => ({
      target,
      isIntersecting: true,
      intersectionRatio: 0.8,
      boundingClientRect: new DOMRect(),
      intersectionRect: new DOMRect(),
      rootBounds: null,
      time: 0,
    })) as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  );
}
function setMedia(query: MediaQueryList, matches: boolean) {
  Object.assign(query, { matches });
  query.dispatchEvent(new Event("change"));
}
function playing() {
  return [...root.querySelectorAll(".is-preview-playing")];
}
beforeEach(() => {
  vi.useFakeTimers();
  reduced = media(false);
  touch = media(false);
  vi.stubGlobal("matchMedia", (query: string) =>
    query.includes("reduced") ? reduced : touch,
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observe = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  root = document.createElement("main");
  root.innerHTML =
    '<a class="game-card" href="/circle/">Circle <span>Play</span></a><a class="brain-card" href="/brain/flash/">Memory</a>';
  document.body.append(root);
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("catalog preview motion", () => {
  it("plays touch previews once and serializes visible cards", () => {
    setMedia(touch, true);
    cleanup = attachCardMotion(root);
    const cards = [...root.children] as HTMLElement[];
    visible(...cards);
    expect(playing()).toEqual([cards[0]]);
    vi.advanceTimersByTime(CARD_PREVIEW_DURATION);
    expect(playing()).toEqual([cards[1]]);
    vi.advanceTimersByTime(CARD_PREVIEW_DURATION);
    expect(playing()).toEqual([]);
    visible(...cards);
    expect(playing()).toEqual([]);
  });
  it("keeps desktop cards still until pointer entry or keyboard focus", () => {
    cleanup = attachCardMotion(root);
    const cards = [...root.children] as HTMLElement[];
    visible(...cards);
    expect(playing()).toEqual([]);
    cards[0].dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(playing()).toEqual([cards[0]]);
    cards[1].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(playing()).toEqual([cards[1]]);
    vi.advanceTimersByTime(CARD_PREVIEW_DURATION);
    expect(playing()).toEqual([]);
  });
  it("does not restart when the pointer crosses children inside a card", () => {
    cleanup = attachCardMotion(root);
    const card = root.firstElementChild as HTMLElement;
    card.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    card.firstElementChild!.dispatchEvent(
      new MouseEvent("pointerover", { bubbles: true, relatedTarget: card }),
    );
    vi.advanceTimersByTime(CARD_PREVIEW_DURATION - 1000);
    expect(playing()).toEqual([]);
  });
  it("honors reduced motion immediately and never starts a disabled preview", () => {
    setMedia(touch, true);
    cleanup = attachCardMotion(root);
    visible(...([...root.children] as HTMLElement[]));
    expect(playing()).toHaveLength(1);
    setMedia(reduced, true);
    expect(playing()).toEqual([]);
    vi.advanceTimersByTime(CARD_PREVIEW_DURATION * 3);
    expect(playing()).toEqual([]);
    root.firstElementChild!.dispatchEvent(
      new FocusEvent("focusin", { bubbles: true }),
    );
    expect(playing()).toEqual([]);
  });
  it("cleans up playback and stops a hidden tab", () => {
    setMedia(touch, true);
    cleanup = attachCardMotion(root);
    visible(...([...root.children] as HTMLElement[]));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(playing()).toEqual([]);
    cleanup();
    vi.advanceTimersByTime(CARD_PREVIEW_DURATION * 3);
    expect(playing()).toEqual([]);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(playing()).toEqual([]);
  });
});
