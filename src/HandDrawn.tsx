import { useEffect, useRef, type ReactNode } from "react";
import "./home-delight.css";

/** Small decorative marks draw once, only when they become visible. */
function useDrawOnce<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        element.classList.add("has-drawn");
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export function MarkerWord({ children }: { children: ReactNode }) {
  const ref = useDrawOnce<HTMLSpanElement>();
  return (
    <span className="marker-word" ref={ref}>
      {children}
      <svg viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="1" d="M4 11Q66 2 196 6M20 14Q97 7 173 11" />
      </svg>
    </span>
  );
}

export function DailySpark() {
  const ref = useDrawOnce<HTMLSpanElement>();
  return (
    <span className="daily-spark" ref={ref} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          pathLength="1"
          d="m17 3 1 9 9-6-6 10 9 3-11 1 1 10-6-9-9 5 5-10-7-5 10 1Z"
        />
      </svg>
    </span>
  );
}
