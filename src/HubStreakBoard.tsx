import { useSyncExternalStore } from "react";
import { StreakBoardCard } from "./StreakLeaderboard";

const query = "(min-width: 651px)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const desktop = () => window.matchMedia(query).matches;
const server = () => false;

export default function HubStreakBoard() {
  const expanded = useSyncExternalStore(subscribe, desktop, server);
  if (expanded) return <StreakBoardCard compact />;
  return (
    <details className="hub-streak-disclosure">
      <summary>
        Кто играет каждый день <span aria-hidden="true">⌄</span>
      </summary>
      <StreakBoardCard compact />
    </details>
  );
}
