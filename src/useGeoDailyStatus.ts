import { useEffect, useState } from "react";
import { api, useAuth } from "./account";
import { geoDailyDate, type GeoDailyStatus } from "./geoDaily";
import { PLAY_PROGRESS_UPDATED } from "./playProgress";

export function useGeoDailyStatus(enabled = true) {
  const auth = useAuth();
  const identity = auth.user?.id ?? "guest";
  const [day, setDay] = useState(geoDailyDate);
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState<{
    identity: string;
    day: string;
    data: GeoDailyStatus | null;
  }>();

  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      setDay(geoDailyDate());
      setRefresh((n) => n + 1);
    };
    const timer = window.setInterval(() => setDay(geoDailyDate()), 30_000);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    window.addEventListener(PLAY_PROGRESS_UPDATED, update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener(PLAY_PROGRESS_UPDATED, update);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || auth.loading) return;
    let active = true;
    void api<GeoDailyStatus>("/geo/daily").then(
      (data) => {
        if (active) setStatus({ identity, day, data });
      },
      () => {
        if (active) setStatus({ identity, day, data: null });
      },
    );
    return () => { active = false; };
  }, [enabled, auth.loading, identity, day, refresh]);

  return !auth.loading && status?.identity === identity && status.day === day
    ? status.data
    : null;
}
