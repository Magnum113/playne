import { useEffect, useRef, useState, type ReactNode } from "react";
import { attachButtonFire } from "./buttonFire";
import StreakFlame from "./StreakFlame";
import { streakDays, type StreakBoard } from "./playStreaks";
import "./fire-button.css";

/** One live leaderboard supplies both the rotating summary and expanded list. */
export default function StreakTicker({ data, error = false, children }: {
  data: StreakBoard | null;
  error?: boolean;
  children: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [position, setPosition] = useState({ index: 0, snap: true });
  const entries = data?.entries ?? [];
  const signature = JSON.stringify(entries);
  const running = visible && !hidden && !reduced && !paused && !hovered && !focused && !open;
  const current = entries.length ? entries[position.index % entries.length] : undefined;
  const fallback = error ? "Серии пока недоступны" : data ? "Кто зажжёт первым?" : "Загружаем серии…";

  useEffect(() => { setPosition({ index: 0, snap: true }); }, [signature]);
  useEffect(() => {
    if (!running && entries.length && position.index >= entries.length)
      setPosition({ index: 0, snap: true });
  }, [running, entries.length, position.index]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    const updateVisibility = () => setHidden(document.hidden);
    updateMotion(); updateVisibility();
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    if (shell.current) observer?.observe(shell.current);
    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  useEffect(() => {
    if (!running || entries.length < 2) return;
    const timer = window.setInterval(() => setPosition((p) => ({ index: (p.index % entries.length) + 1, snap: false })), 4000);
    return () => window.clearInterval(timer);
  }, [running, signature, entries.length]);
  useEffect(() => {
    if (running && entries.length && summary.current && canvas.current)
      return attachButtonFire(summary.current, canvas.current);
  }, [running, entries.length]);

  return (
    <div ref={shell} className={`hub-streak-shell${running ? " is-playing" : " is-paused"}${!open && !reduced && entries.length ? " has-controls" : ""}`}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}>
      <details className="hub-streak-disclosure" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary ref={summary} className="fire-button" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          aria-label={current ? `Ударные серии: №${current.place}, ${current.nickname}, ${streakDays(current.days)}` : `Ударные серии: ${fallback}`}>
          <canvas ref={canvas} className="fire-button-effect" aria-hidden="true" />
          <span className="streak-ticker-face fire-button-label">
            <span className="streak-ticker-window" aria-hidden="true">
              {entries.length ? (
                <span className={`streak-ticker-track${position.snap ? " is-resetting" : ""}`}
                  style={{ transform: `translateY(-${position.index * 1.5}em)` }}
                  onTransitionEnd={(e) => {
                    if (e.propertyName === "transform" && position.index >= entries.length)
                      setPosition({ index: 0, snap: true });
                  }}>
                  {[...entries, entries[0]].map((entry, i) => (
                    <span className="streak-ticker-row" key={i}>
                      <span className="streak-ticker-place">№{entry.place}</span>
                      <strong className="streak-ticker-name">{entry.nickname}</strong>
                      <span className="streak-ticker-score"><StreakFlame />{streakDays(entry.days)}</span>
                    </span>
                  ))}
                </span>
              ) : <span className="streak-ticker-fallback"><StreakFlame />{fallback}</span>}
            </span>
            <svg className="streak-ticker-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </summary>
        {children}
      </details>
      {!open && !reduced && entries.length > 0 && (
        <button type="button" className="streak-ticker-pause" aria-label={paused ? "Продолжить смену игроков и огонь" : "Приостановить смену игроков и огонь"}
          aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            {paused ? <path d="m5 3 7 5-7 5Z" fill="currentColor" /> : <path d="M5 3v10M11 3v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button>
      )}
    </div>
  );
}
