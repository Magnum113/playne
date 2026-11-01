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

export function useWideStreakBoard() {
  return useSyncExternalStore(subscribe, desktop, server);
}
export default function HubStreakBoard() {
  const expanded = useWideStreakBoard();
  return <StreakBoardCard compact disclosure={!expanded} />;
}
