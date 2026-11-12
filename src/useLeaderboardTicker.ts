import { useEffect, useRef, useState, type TransitionEvent } from "react";

export function useLeaderboardTicker(
  count: number,
  signature: string,
  paused: boolean,
  layoutQuery?: string,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);
  const [position, setPosition] = useState({ index: 0, snap: true });
  const running = available && !paused;

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const layout = layoutQuery ? window.matchMedia?.(layoutQuery) : undefined;
    let visible = false;
    const update = () =>
      setAvailable(visible && !document.hidden && !reduced?.matches && (layout?.matches ?? !layoutQuery));
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    if (viewport.current) observer?.observe(viewport.current);
    reduced?.addEventListener("change", update);
    layout?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer?.disconnect();
      reduced?.removeEventListener("change", update);
      layout?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [layoutQuery]);

  useEffect(() => { setPosition({ index: 0, snap: true }); }, [signature]);
  useEffect(() => {
    if (!running && count && position.index >= count) setPosition({ index: 0, snap: true });
  }, [running, count, position.index]);
  useEffect(() => {
    if (!running || count < 2) return;
    const timer = window.setInterval(() => {
      setPosition((previous) => ({ index: (previous.index % count) + 1, snap: false }));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [running, signature, count]);

  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === event.currentTarget && event.propertyName === "transform" && position.index >= count)
      setPosition({ index: 0, snap: true });
  };

  return { viewport, running, position, onTransitionEnd };
}
