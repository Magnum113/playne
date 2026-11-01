import type { GameId } from "./account";
import { playCatalog } from "./playSuggestions";
import { reachGoal, PLAY_GOALS } from "./analytics";
const next: Partial<Record<GameId, GameId>> = { naglaz: "colorfle", colorfle: "circle", circle: "pressure", pressure: "line", geo: "naglaz", line: "flash" };
export default function NextGame({ game }: { game: GameId }) {
  const id = next[game]; if (!id) return null;
  const item = playCatalog[id];
  return <aside className="result-next-game" aria-label="Следующая игра"><span>{item.hint}</span><a href={item.path} onClick={() => reachGoal(PLAY_GOALS.nextGame, { source: "result", from_game: game, game: id })}>Попробовать «{item.name}» →</a></aside>;
}
