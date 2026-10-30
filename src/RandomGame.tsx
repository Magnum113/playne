import { useEffect, useRef, useState } from "react";
import { chooseRandomGame, type RandomGameChoice } from "./randomGameCatalog";
import "./random-game.css";

const LAST_RANDOM_GAME = "playne:random-game:last";
export const RANDOM_GAME_SHUFFLE_MS = 620;

type Props = {
  /** Design-system preview: show the destination instead of leaving the page. */
  demo?: boolean;
  onNavigate?: (href: string) => void;
};

export default function RandomGame({ demo = false, onNavigate }: Props) {
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<RandomGameChoice | null>(null);
  const choosing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    // A page restored by Back must not keep a disabled launch button.
    const restore = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      choosing.current = false;
      setBusy(false);
    };
    window.addEventListener("pageshow", restore);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  function shuffle() {
    if (choosing.current) return;
    choosing.current = true;
    let last = previous.current;
    if (!demo) {
      try {
        last = sessionStorage.getItem(LAST_RANDOM_GAME);
      } catch {
        // The random picker still works in browsers that block storage.
      }
    }
    const next = chooseRandomGame(last);
    previous.current = next.href;
    if (!demo) {
      try {
        sessionStorage.setItem(LAST_RANDOM_GAME, next.href);
      } catch {
        // Remembering the previous draw is optional.
      }
    }
    setChoice(null);
    setBusy(true);
    const finish = () => {
      timer.current = null;
      if (demo) {
        setChoice(next);
        setBusy(false);
        choosing.current = false;
      } else {
        (onNavigate ?? ((href: string) => window.location.assign(href)))(next.href);
      }
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
    } else {
      timer.current = setTimeout(finish, RANDOM_GAME_SHUFFLE_MS);
    }
  }

  return (
    <div className={`random-game${busy ? " is-shuffling" : ""}`}>
      <button
        type="button"
        className="random-game-button"
        onClick={shuffle}
        disabled={busy}
        aria-label="Во что-нибудь! Открыть случайную игру"
      >
        <span className="random-game-stack" aria-hidden="true">
          <svg className="random-game-tile random-game-tile-back" viewBox="0 0 44 54">
            <rect x="1" y="1" width="42" height="52" rx="10" />
            <path d="m14 28 7-9 7 9-7 9Z" />
          </svg>
          <svg className="random-game-tile random-game-tile-middle" viewBox="0 0 44 54">
            <rect x="1" y="1" width="42" height="52" rx="10" />
            <path d="M13 19h8v8h10v9H13Z" />
          </svg>
          <svg className="random-game-tile random-game-tile-front" viewBox="0 0 44 54">
            <rect x="1" y="1" width="42" height="52" rx="10" />
            <circle cx="22" cy="27" r="10" />
          </svg>
        </span>
        <span className="random-game-copy">
          <strong>Во что-нибудь!</strong>
          <span>{busy ? "Выбираем игру…" : "Выберем игру за тебя"}</span>
        </span>
        <span className="random-game-arrow" aria-hidden="true">↗</span>
      </button>
      <span className="random-game-status" role="status" aria-live="polite">
        {busy ? "Выбираем случайную игру" : ""}
        {demo && choice && (
          <a href={choice.href}>Выпала игра «{choice.name}» →</a>
        )}
      </span>
    </div>
  );
}
