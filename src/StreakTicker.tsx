import { useEffect, useRef, useState, type ReactNode } from "react";
import { attachButtonFire } from "./buttonFire";
import StreakFlame from "./StreakFlame";
import { streakDays, type StreakBoard } from "./playStreaks";
import { useLeaderboardTicker } from "./useLeaderboardTicker";
import "./fire-button.css";

/** One live leaderboard supplies both the rotating summary and expanded list. */
export default function StreakTicker({ data, error = false, children }: {
  data: StreakBoard | null;
  error?: boolean;
  children: ReactNode;
}) {
  const summary = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const entries = data?.entries ?? [];
  const { viewport, running, position, onTransitionEnd } = useLeaderboardTicker(
    entries.length, JSON.stringify(entries), keyboardFocused || open,
  );
  const current = entries.length ? entries[position.index % entries.length] : undefined;
  const fallback = error ? "Серии пока недоступны" : data ? "Кто зажжёт первым?" : "Загружаем серии…";

  useEffect(() => {
    if (running && entries.length && summary.current && canvas.current)
      return attachButtonFire(summary.current, canvas.current);
  }, [running, entries.length]);

  return (
    <div ref={viewport} className={`hub-streak-shell${running ? " is-playing" : " is-paused"}`}>
      <details className="hub-streak-disclosure" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary ref={summary} className="fire-button"
          onPointerDown={() => setKeyboardFocused(false)}
          onFocus={(e) => setKeyboardFocused(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setKeyboardFocused(false)}
          aria-label={current ? `Ударные серии: №${current.place}, ${current.nickname}, ${streakDays(current.days)}` : `Ударные серии: ${fallback}`}>
          <canvas ref={canvas} className="fire-button-effect" aria-hidden="true" />
          <span className="streak-ticker-face fire-button-label">
            <span className="streak-ticker-window" aria-hidden="true">
              {entries.length ? (
                <span className={`streak-ticker-track${position.snap ? " is-resetting" : ""}`}
                  style={{ transform: `translateY(-${position.index * 1.5}em)` }}
                  onTransitionEnd={onTransitionEnd}>
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
    </div>
  );
}
