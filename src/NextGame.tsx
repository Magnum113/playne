import { useEffect, useRef } from "react";
import type { GameId } from "./account";
import { playCatalog } from "./playSuggestions";
import { reachGoal, PLAY_GOALS } from "./analytics";
import {
  hasResultRecommendation,
  resultRecommendations,
  trackRecommendationClick,
  trackRecommendationShown,
} from "./resultRecommendation";

const next: Partial<Record<GameId, GameId>> = {
  colorfle: "circle",
  circle: "pressure",
  pressure: "line",
  line: "flash",
};

export default function NextGame({
  game,
  runId,
  preview = false,
}: {
  game: GameId;
  runId?: string;
  preview?: boolean;
}) {
  const card = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (
      preview ||
      !runId ||
      !hasResultRecommendation(game) ||
      !card.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        trackRecommendationShown(game, runId);
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [game, preview, runId]);

  if (hasResultRecommendation(game)) {
    const id = resultRecommendations[game];
    const item = playCatalog[id];
    return (
      <aside className="result-recommendation" aria-label="Следующая игра">
        <a
          ref={card}
          className={`result-next-card result-next-card--${id}`}
          href={item.path}
          onClick={(event) => {
            if (!preview)
              trackRecommendationClick(
                game,
                runId,
                !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey,
              );
          }}
        >
          <span className="result-next-art" aria-hidden="true">
            <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
              {id === "naglaz" ? (
                <>
                  <rect x="7" y="17" width="9" height="12" rx="2" fill="var(--mint)" />
                  <rect x="20" y="7" width="9" height="22" rx="2" fill="var(--purple)" />
                </>
              ) : (
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
            </svg>
          </span>
          <span className="result-next-copy">
            <span>Следующая игра</span>
            <strong>{item.name}</strong>
            <span>{item.hint}</span>
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
