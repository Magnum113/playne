import { useSyncExternalStore, type ReactNode } from "react";
import type { GameId } from "./account";
import GameLeaderboard from "./GameLeaderboard";
import "./game-results.css";

const query = "(min-width: 1100px)";
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const desktop = () => window.matchMedia(query).matches;
const server = () => false;

/** Keeps rankings out of mobile gameplay and preserves the existing game refs. */
export default function GameResultLayout({
  children,
  game,
  mode,
  refreshKey,
  enabled = true,
}: {
  children: ReactNode;
  game: GameId;
  mode?: string;
  refreshKey?: string;
  enabled?: boolean;
}) {
  const wide = useSyncExternalStore(subscribe, desktop, server);
  if (!enabled) return children;
  return (
    <div
      className={`game-result-layout${game === "circle" ? " circle-result-layout" : ""}`}
    >
      <div className="game-result-main">{children}</div>
      {wide && (
        <aside className="game-result-aside" aria-label="Рейтинг игры">
          <GameLeaderboard game={game} mode={mode} refreshKey={refreshKey} />
        </aside>
      )}
    </div>
  );
}
