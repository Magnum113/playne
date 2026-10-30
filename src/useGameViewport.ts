import { useEffect, useLayoutEffect, type RefObject } from "react";

type Bounds = { top: number; bottom: number };
const inset = 16;

/** Keep the whole play region visible when it fits; otherwise show its start. */
export function gameViewportDelta(bounds: Bounds, top: number, height: number) {
  const start = top + inset;
  const end = top + height - inset;
  if (bounds.bottom - bounds.top > end - start || bounds.top < start)
    return bounds.top - start;
  return Math.max(0, bounds.bottom - end);
}

export function fitGameViewport(region: Element | null, endSelector?: string) {
  if (!region || document.querySelector("dialog[open]")) return;
  const rect = region.getBoundingClientRect();
  const last = endSelector ? region.querySelector(endSelector) : null;
  const bottom = last?.getBoundingClientRect().bottom ?? rect.bottom;
  if (bottom <= rect.top) return;
  const viewport = window.visualViewport;
  const delta = gameViewportDelta(
    { top: rect.top, bottom },
    viewport?.offsetTop ?? 0,
    viewport?.height ?? window.innerHeight,
  );
  if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
}

const useGameLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Run on explicit game transitions, never on input, timer ticks or scrolling. */
export function useGameViewport<T extends Element>(
  region: RefObject<T | null>,
  transition: string | number | null,
  endSelector?: string,
) {
  useGameLayoutEffect(() => {
    if (transition !== null) fitGameViewport(region.current, endSelector);
  }, [region, transition, endSelector]);
}
