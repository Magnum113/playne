import { useCallback, useEffect, useRef, useState } from "react";
import { api, useAuth } from "./account";
import { brainMoscowDate } from "./brain";
import { PLAY_PROGRESS_UPDATED, type PlayProgress } from "./playProgress";

export function usePlayProgress(revision?: string) {
  const auth = useAuth();
  const identity = auth.user?.id ?? "guest";
  const day = brainMoscowDate();
  const lastDay = useRef(day);
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    data: PlayProgress;
  } | null>(null);
  const [state, setState] = useState<{
    identity: string;
    day: string;
    loading: boolean;
    error: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) {
        lastDay.current = brainMoscowDate();
        refresh();
      }
    };
    const timer = window.setInterval(() => {
      if (brainMoscowDate() !== lastDay.current) visible();
    }, 30_000);
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    window.addEventListener(PLAY_PROGRESS_UPDATED, refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
      window.removeEventListener(PLAY_PROGRESS_UPDATED, refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (auth.loading) return;
    let active = true;
    setState({ identity, day, loading: true, error: false });
    api<PlayProgress>("/play/progress")
      .then((data) => {
        if (
          !data ||
          !Array.isArray(data.week) ||
          data.day !== brainMoscowDate()
        )
          throw new Error("Stale progress");
        if (active) {
          setSnapshot({ identity, data });
          setState({ identity, day: data.day, loading: false, error: false });
        }
      })
      .catch(() => {
        if (active) setState({ identity, day, loading: false, error: true });
      });
    return () => {
      active = false;
    };
  }, [identity, auth.loading, day, revision, retry]);
  const data =
    snapshot?.identity === identity &&
    snapshot.data.day === day &&
    !auth.loading
      ? snapshot.data
      : undefined;
  const current =
    state?.identity === identity && state.day === day ? state : undefined;
  return {
    data,
    day,
    loading: auth.loading || !current || current.loading,
    error: current?.error ?? false,
    refresh,
  };
}
