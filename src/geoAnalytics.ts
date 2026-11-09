import { useEffect, useRef, type MouseEvent } from "react";
import { GEO_GOALS, reachGoal, reachGoalOnce } from "./analytics";
import { geoDailyDate, type GeoDailyStatus } from "./geoDaily";
import type { GeoMode } from "./geo";

function observeImpression(node: HTMLElement, onView: () => void) {
  if (typeof IntersectionObserver === "undefined") return;
  let visible = false;
  function stop() {
    observer.disconnect();
    document.removeEventListener("visibilitychange", report);
  }
  function report() {
    if (!visible || document.hidden) return;
    onView();
    stop();
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
    report();
  }, { threshold: 0.5 });
  document.addEventListener("visibilitychange", report);
  observer.observe(node);
  return stop;
}

export function geoDailyAction(attempt: GeoDailyStatus["attempt"] | undefined) {
  if (attempt?.completed) return "open_result";
  return attempt ? "resume" : "start";
}

type DailySource = "home" | "daily_intro" | "geo_intro" | "result";
type DailyAction = ReturnType<typeof geoDailyAction> | "open_route" | "leaderboard" | "other_modes";

function dailyParams(source: DailySource, day?: string) {
  return {
    mode: "daily",
    source,
    route_day: day ?? geoDailyDate(),
    viewport: window.matchMedia("(max-width: 620px)").matches ? "compact" : "wide",
  };
}

export function trackDailyAction(source: DailySource, action: DailyAction, day?: string) {
  reachGoal(GEO_GOALS.dailyAction, { ...dailyParams(source, day), action });
}

export function useDailyImpression(source: "home" | "daily_intro", status?: GeoDailyStatus | null, enabled = true) {
  const ref = useRef<HTMLHeadingElement>(null);
  const day = status?.day ?? geoDailyDate();
  const hasLeaders = status?.leaders && status.leaders.length > 0;
  const action = status ? geoDailyAction(status.attempt) : "unknown";
  useEffect(() => {
    const heading = ref.current;
    if (!enabled || !heading) return;
    return observeImpression(heading, () => {
      reachGoalOnce(GEO_GOALS.dailyView, `${source}:${day}`, {
        ...dailyParams(source, day),
        ...(hasLeaders === undefined ? {} : { has_leaders: hasLeaders }),
        route_action: action,
      });
    });
  }, [action, day, enabled, hasLeaders, source]);
  return ref;
}

export type GeoResultOrigin = "played" | "reopened" | "restored";
const layout = "compact_rank_v1";
const loginWindowMs = 24 * 60 * 60 * 1000;

function resultParams(mode: GeoMode, player: "guest" | "account", origin: GeoResultOrigin) {
  return {
    mode,
    player,
    origin,
    layout,
    viewport: window.matchMedia("(max-width: 750px)").matches ? "compact" : "wide",
    challenge: new URLSearchParams(window.location.search).has("challenge"),
  };
}

export function useGeoResultAnalytics({
  runId, mode, player, origin, score, projected, saved,
}: {
  runId?: string;
  mode: GeoMode;
  player?: "guest" | "account";
  origin: GeoResultOrigin;
  score: number;
  projected?: boolean;
  saved: boolean;
}) {
  const scoreRef = useRef<HTMLHeadingElement>(null);
  const rankRef = useRef<HTMLDivElement>(null);
  const rankSeen = useRef<string | undefined>(undefined);
  const loginKey = `playne:geo-result-login:${runId}`;

  useEffect(() => {
    if (!runId || !player || !scoreRef.current) return;
    return observeImpression(scoreRef.current, () => {
      reachGoalOnce(GEO_GOALS.resultView, `${runId}:${origin}`, {
        ...resultParams(mode, player, origin), score,
      });
    });
  }, [mode, origin, player, runId, score]);

  useEffect(() => {
    if (!runId || !player || projected === undefined || !rankRef.current) return;
    return observeImpression(rankRef.current, () => {
      rankSeen.current = `${runId}:${player}`;
      reachGoalOnce(GEO_GOALS.resultRankView, rankSeen.current, {
        ...resultParams(mode, player, origin), projected,
      });
    });
  }, [mode, origin, player, projected, runId]);

  useEffect(() => {
    if (!runId || player !== "account" || !saved || origin !== "restored") return;
    try {
      const value = JSON.parse(sessionStorage.getItem(loginKey) ?? "null");
      if (!value || Date.now() - value.at >= loginWindowMs) return;
      sessionStorage.removeItem(loginKey);
      reachGoalOnce(GEO_GOALS.resultSavedAfterLogin, runId, value.params);
    } catch {
      // Storage restrictions must not affect saving a result.
    }
  }, [loginKey, origin, player, runId, saved]);

  function trackResultClick(event: MouseEvent<HTMLElement>) {
    if (!runId || !player || !(event.target instanceof Element)) return;
    const control = event.target.closest("a, button");
    if (!control) return;
    const action = control.getAttribute("data-geo-result-action")
      ?? (control.matches(".yandex-login") ? "login"
        : control.matches(".result-next-card") ? "next_game"
        : control.matches(".result-share button") ? "challenge" : null);
    if (!action) return;
    const params = {
      ...resultParams(mode, player, origin),
      rank_seen: rankSeen.current === `${runId}:${player}`,
    };
    reachGoalOnce(GEO_GOALS.resultAction, `${runId}:${player}:${action}`, { ...params, action });
    if (action === "login" && player === "guest" && !params.challenge) {
      try {
        sessionStorage.setItem(loginKey, JSON.stringify({ at: Date.now(), params }));
      } catch {
        // Login works with storage disabled.
      }
    }
  }

  return { scoreRef, rankRef, trackResultClick };
}
