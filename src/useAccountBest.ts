import { useEffect, useState } from "react";
import { api, useGuestTrial, type GameId } from "./account";
import { PLAY_PROGRESS_UPDATED } from "./playProgress";
type Best = { game: GameId; mode: string; score: number };
const requests = new Map<string, Promise<Best[]>>();
export function useAccountBest(game: GameId | undefined, mode = "classic") {
  const { user } = useGuestTrial(game);
  const [data, setData] = useState<{ owner: string; best: Best[] } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!game || !user) return;
    let active = true;
    let request = requests.get(user.id);
    if (!request) {
      request = Promise.resolve(api<{best: Best[]}>("/account")).then(d => d.best ?? []);
      requests.set(user.id, request);
      request.catch(() => { if (requests.get(user.id) === request) requests.delete(user.id); });
    }
    request.then(best => { if (active) setData({ owner: user.id, best }); }).catch(() => {});
    return () => { active = false; };
  }, [game, user?.id, revision]);
  useEffect(() => {
    const refresh = () => { if (user) requests.delete(user.id); setRevision(v => v + 1); };
    window.addEventListener(PLAY_PROGRESS_UPDATED, refresh);
    return () => window.removeEventListener(PLAY_PROGRESS_UPDATED, refresh);
  }, [user?.id]);
  const entry = user && data?.owner === user.id ? data.best.find(b => b.game === game && b.mode === mode) : undefined;
  return user && data?.owner === user.id ? { ready: true, exists: !!entry, value: entry?.score ?? 0 } : { ready: false, exists: false, value: 0 };
}
