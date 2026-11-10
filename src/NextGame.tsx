import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import type { GameId } from "./account";
import { playCatalog } from "./playSuggestions";
import { reachGoal, PLAY_GOALS } from "./analytics";
import {
  hasResultRecommendation,
  resultRecommendations,
  trackRecommendationClick,
  trackRecommendationShown,
  type ResultOffer,
} from "./resultRecommendation";
import "./game-results.css";

const next: Partial<Record<GameId, GameId>> = {
  pressure: "line",
  line: "flash",
};

export function ResultRecommendationCard({
  offer,
  runId,
  href,
  variant,
  label,
  title,
  hint,
  art,
  onFollow,
  preview = false,
}: {
  offer: ResultOffer;
  runId?: string;
  href: string;
  variant: string;
  label: string;
  title: string;
  hint?: string;
  art: ReactNode;
  onFollow?: (event: MouseEvent<HTMLAnchorElement>) => void;
  preview?: boolean;
}) {
  const card = useRef<HTMLAnchorElement>(null);
  const { from, fromMode } = offer;
  useEffect(() => {
    const element = card.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        element.dataset.visible = "";
        if (!preview && runId) {
          const shown: ResultOffer =
            fromMode === undefined ? { from } : { from: "colorfle", fromMode };
          trackRecommendationShown(shown, runId);
        }
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [from, fromMode, preview, runId]);

  return (
    <a
      ref={card}
      className={`result-next-card result-next-card--${variant}`}
      href={href}
      onClick={(event) => {
        if (preview) return;
        const sameTab = !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        trackRecommendationClick(offer, runId, sameTab);
        if (sameTab) onFollow?.(event);
      }}
    >
      <span className="result-next-art" aria-hidden="true">{art}</span>
      <span className="result-next-copy">
        <span>{label}</span>
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </span>
      <svg
        className="result-next-arrow"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
      >
        <path
          d="M5 12h14m-6-6 6 6-6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

function RecommendationArt({
  game,
}: {
  game: (typeof resultRecommendations)[keyof typeof resultRecommendations];
}) {
  return (
    <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
      {game === "naglaz" && (
        <>
          <rect x="7" y="17" width="9" height="12" rx="2" fill="var(--mint)" />
          <rect x="20" y="7" width="9" height="22" rx="2" fill="var(--purple)" />
        </>
      )}
      {game === "colorfle" && (
        <>
          <rect
            x="5" y="11" width="14" height="17" rx="4"
            fill="var(--mint)" transform="rotate(-13 12 19)"
          />
          <rect
            x="17" y="9" width="14" height="17" rx="4"
            fill="var(--purple)" transform="rotate(13 24 17)"
          />
        </>
      )}
      {game === "circle" && (
        <>
          <circle cx="18" cy="18" r="12" stroke="var(--purple)" strokeWidth="3" />
          <circle cx="18" cy="18" r="2.5" fill="var(--mint)" />
        </>
      )}
      {game === "pressure" && (
        <>
          <rect x="6" y="9" width="24" height="21" rx="6" fill="var(--purple)" opacity=".25" />
          <rect x="6" y="6" width="24" height="21" rx="6" fill="var(--purple)" />
          <path
            d="M18 10l-5 7h5l-1 6 6-8h-5z"
            fill="var(--panel)"
          />
        </>
      )}
      {game === "line" && (
        <>
          <path
            d="M9 25V11h18v14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="25" r="3.5" fill="currentColor" />
          <circle cx="9" cy="11" r="3.5" fill="currentColor" />
          <circle cx="27" cy="11" r="3.5" fill="currentColor" />
          <circle cx="27" cy="25" r="3.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export default function NextGame({
  game,
  runId,
  preview = false,
  compact = false,
}: {
  game: GameId;
  runId?: string;
  preview?: boolean;
  compact?: boolean;
}) {
  if (hasResultRecommendation(game)) {
    const id = resultRecommendations[game];
    const item = playCatalog[id];
    return (
      <aside className="result-recommendation" aria-label="Следующая игра">
        <ResultRecommendationCard
          offer={{ from: game }}
          runId={runId}
          href={item.path}
          variant={id}
          label="Следующая игра"
          title={item.name}
          hint={compact ? undefined : item.hint}
          art={<RecommendationArt game={id} />}
          preview={preview}
        />
      </aside>
    );
  }

  const id = next[game];
  if (!id) return null;
  const item = playCatalog[id];
  return (
    <aside className="result-next-game" aria-label="Следующая игра">
      <span>{item.hint}</span>
      <a
        href={item.path}
        onClick={() =>
          !preview &&
          reachGoal(PLAY_GOALS.nextGame, {
            source: "result",
            from_game: game,
            game: id,
          })
        }
      >
        Попробовать «{item.name}» →
      </a>
    </aside>
  );
}
