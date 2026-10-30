import { useEffect, useRef } from "react";
import "./card-motion.css";

export const CARD_PREVIEW_DURATION = 2700;
const CARD_SELECTOR = ".game-card, .brain-card";

/** One finite preview at a time. Touch cards play once when visible. */
export function attachCardMotion(root: HTMLElement): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const touch = window.matchMedia("(hover: none)");
  const cards = [...root.querySelectorAll<HTMLElement>(CARD_SELECTOR)];
  const visible = new Set<HTMLElement>();
  const played = new Set<HTMLElement>();
  const queue: HTMLElement[] = [];
  let current: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const stop = () => {
    clearTimeout(timer);
    current?.classList.remove("is-preview-playing");
    current = null;
  };
  const play = (card: HTMLElement) => {
    if (disposed || reduced.matches || document.hidden || current) return;
    current = card;
    played.add(card);
    card.classList.add("is-preview-playing");
    timer = setTimeout(() => {
      stop();
      next();
    }, CARD_PREVIEW_DURATION);
  };
  const next = () => {
    if (current || !touch.matches || reduced.matches || document.hidden) return;
    while (queue.length) {
      const card = queue.shift()!;
      if (!visible.has(card) || played.has(card)) continue;
      play(card);
      return;
    }
  };
  const request = (event: Event) => {
    if (touch.matches || reduced.matches || document.hidden) return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(CARD_SELECTOR)
        : null;
    if (!target || !root.contains(target) || target === current) return;
    const related = (event as MouseEvent | FocusEvent).relatedTarget;
    if (related instanceof Node && target.contains(related)) return;
    // A new intentional focus/hover takes over from the previous preview.
    stop();
    play(target);
  };
  const observer =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const card = entry.target as HTMLElement;
              if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
                visible.add(card);
                if (!played.has(card) && !queue.includes(card))
                  queue.push(card);
              } else {
                visible.delete(card);
                if (card === current) stop();
              }
            }
            next();
          },
          { threshold: [0, 0.35] },
        )
      : null;
  cards.forEach((card) => observer?.observe(card));
  const preferencesChanged = () => {
    stop();
    if (!reduced.matches) next();
  };
  const visibilityChanged = () => {
    if (document.hidden) stop();
    else next();
  };
  root.addEventListener("pointerover", request);
  root.addEventListener("focusin", request);
  document.addEventListener("visibilitychange", visibilityChanged);
  reduced.addEventListener("change", preferencesChanged);
  touch.addEventListener("change", preferencesChanged);
  return () => {
    disposed = true;
    stop();
    observer?.disconnect();
    root.removeEventListener("pointerover", request);
    root.removeEventListener("focusin", request);
    document.removeEventListener("visibilitychange", visibilityChanged);
    reduced.removeEventListener("change", preferencesChanged);
    touch.removeEventListener("change", preferencesChanged);
  };
}

export function useCardMotion<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(
    () => (ref.current ? attachCardMotion(ref.current) : undefined),
    [],
  );
  return ref;
}

export default useCardMotion;
