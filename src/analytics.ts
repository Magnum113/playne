export const METRIKA_COUNTER_ID = 112711950;

export const METRIKA_GOALS = {
  rulesOpen: "naglaz_rules_open",
  gameStart: "naglaz_game_start",
  roundComplete: "naglaz_round_complete",
  perfectRound: "naglaz_perfect_round",
  gameComplete: "naglaz_game_complete",
  gameRestart: "naglaz_game_restart",
} as const;

export const CIRCLE_GOALS = {
  rulesOpen: "circle_rules_open",
  attemptStart: "circle_attempt_start",
  attemptComplete: "circle_attempt_complete",
  newRecord: "circle_new_record",
  retry: "circle_retry",
} as const;

export const SHADE_GOALS = {
  rulesOpen: "ottenok_rules_open",
  gameStart: "ottenok_game_start",
  roundComplete: "ottenok_round_complete",
  gameComplete: "ottenok_game_complete",
  gameRestart: "ottenok_game_restart",
} as const;

export const GEO_GOALS = {
  rulesOpen: "geo_rules_open",
  gameStart: "geo_game_start",
  roundComplete: "geo_round_complete",
  perfectRound: "geo_perfect_round",
  gameComplete: "geo_game_complete",
  gameRestart: "geo_game_restart",
  loadError: "geo_load_error",
} as const;

export const PRESSURE_GOALS = {
  rulesOpen: "pressure_rules_open",
  gameStart: "pressure_game_start",
  levelComplete: "pressure_level_complete",
  gameComplete: "pressure_game_complete",
  gameRestart: "pressure_game_restart",
} as const;

export const LINE_GOALS = {
  rulesOpen: "line_rules_open",
  gameStart: "line_game_start",
  roundComplete: "line_round_complete",
  gameComplete: "line_game_complete",
  gameRestart: "line_game_restart",
  hintUsed: "line_hint_used",
} as const;

export const BRAIN_GOALS = {
  rulesOpen: "brain_rules_open",
  gameStart: "brain_game_start",
  roundComplete: "brain_round_complete",
  gameComplete: "brain_game_complete",
  gameRestart: "brain_game_restart",
  hintUsed: "brain_hint_used",
  practiceLevel: "brain_practice_level",
} as const;

export const SHARE_GOALS = {
  opened: "playne_challenge_dialog_open",
  created: "playne_challenge_created",
  copied: "playne_challenge_copied",
  sent: "playne_challenge_shared",
  cancelled: "playne_challenge_share_cancelled",
  error: "playne_challenge_error",
  revoked: "playne_challenge_revoked",
  landing: "playne_challenge_landing",
  accepted: "playne_challenge_accept",
  started: "playne_challenge_start",
  completed: "playne_challenge_complete",
  resultViewed: "playne_challenge_result_view",
  retryClicked: "playne_challenge_retry_click",
  retryStarted: "playne_challenge_retry_start",
  retryCompleted: "playne_challenge_retry_complete",
} as const;

export const PLAY_GOALS = {
  todayGame: "playne_today_game",
  nextGame: "playne_next_game",
  weekOpen: "playne_week_open",
} as const;

export const ACCOUNT_GOALS = {
  loginStart: "account_yandex_login_start",
  loginSuccess: "account_yandex_login_success",
  nicknameSaved: "account_nickname_saved",
  resultPublished: "leaderboard_result_saved",
  leaderboardOpen: "leaderboard_open",
  logout: "account_logout",
} as const;

export const BRAIN_GAME_GOALS = {
  flashStart: "flash_game_start",
  flashComplete: "flash_game_complete",
  rotateStart: "rotate_game_start",
  rotateComplete: "rotate_game_complete",
  slideStart: "slide_game_start",
  slideComplete: "slide_game_complete",
  dispatchStart: "dispatch_game_start",
  dispatchComplete: "dispatch_game_complete",
} as const;

type Values<T> = T[keyof T];
export type MetrikaGoal =
  | Values<typeof METRIKA_GOALS>
  | Values<typeof CIRCLE_GOALS>
  | Values<typeof SHADE_GOALS>
  | Values<typeof GEO_GOALS>
  | Values<typeof ACCOUNT_GOALS>
  | Values<typeof PRESSURE_GOALS>
  | Values<typeof LINE_GOALS>
  | Values<typeof BRAIN_GOALS>
  | Values<typeof PLAY_GOALS>
  | Values<typeof SHARE_GOALS>
  | Values<typeof BRAIN_GAME_GOALS>;
export type MetrikaParams = Record<string, string | number | boolean>;

type MetrikaFunction = {
  (...args: unknown[]): void;
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: MetrikaFunction;
  }
}

const TAG_URL = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_COUNTER_ID}`;

export function initMetrika() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (!window.ym) {
    const queued: MetrikaFunction = (...args: unknown[]) => {
      (queued.a ??= []).push(args);
    };
    queued.l = Date.now();
    window.ym = queued;
  }

  if (![...document.scripts].some((script) => script.src === TAG_URL)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = TAG_URL;
    document.scripts[0]?.parentNode?.insertBefore(script, document.scripts[0]);
  }

  window.ym(METRIKA_COUNTER_ID, "init", {
    ssr: true,
    webvisor: !new URLSearchParams(window.location.search).has("challenge"),
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: analyticsUrl(document.referrer),
    url: analyticsUrl(window.location.href),
    accurateTrackBounce: true,
    trackLinks: !new URLSearchParams(window.location.search).has("challenge"),
  });
}

export function reachGoal(goal: MetrikaGoal, params?: MetrikaParams) {
  if (typeof window === "undefined") return;
  try {
    window.ym?.(METRIKA_COUNTER_ID, "reachGoal", goal, params);
    if (
      (goal === BRAIN_GOALS.gameStart || goal === BRAIN_GOALS.gameComplete) &&
      ["flash", "rotate", "slide", "dispatch"].includes(String(params?.game))
    ) {
      const event = `${params!.game}_game_${goal === BRAIN_GOALS.gameStart ? "start" : "complete"}`;
      window.ym?.(METRIKA_COUNTER_ID, "reachGoal", event, params);
    }
  } catch {
    // Analytics must never interrupt a player's action.
  }
}

// Keep campaign attribution while dropping private runs, invitations and login links.
export const ANALYTICS_CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "yclid",
  "gclid",
] as const;
export function analyticsUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    const path = /^\/(c|challenge)\//.test(url.pathname)
      ? "/challenge/"
      : url.pathname;
    const query = new URLSearchParams();
    for (const key of ANALYTICS_CAMPAIGN_KEYS) {
      const value = url.searchParams.get(key);
      if (value) query.set(key, value);
    }
    return url.origin + path + (query.size ? "?" + query : "");
  } catch {
    return "";
  }
}

const once = new Set<string>();
export function reachGoalOnce(
  goal: MetrikaGoal,
  key: string,
  params?: MetrikaParams,
) {
  if (typeof window === "undefined" || !window.ym) return;
  const storageKey = `playne:analytics:${goal}:${key}`;
  if (once.has(storageKey)) return;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
  } catch {
    /* storage may be blocked */
  }
  once.add(storageKey);
  try {
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    /* best effort */
  }
  reachGoal(goal, params);
}

const activeChallenges = new Map<string, MetrikaParams>();
export function trackChallengeStart(
  run: {
    id: string;
    game: string;
    mode?: string;
    completed?: boolean;
    challenge: { retryOf?: string };
  },
  auth: boolean,
) {
  if (run.completed) return;
  const params = {
    game: run.game,
    mode: run.mode ?? "classic",
    attempt_kind: run.challenge.retryOf ? "retry" : "first",
    player: auth ? "account" : "guest",
  };
  activeChallenges.set(run.id, params);
  try {
    window.sessionStorage.setItem(
      `playne:challenge-analytics:${run.id}`,
      JSON.stringify(params),
    );
  } catch {
    /* best effort */
  }
  reachGoalOnce(SHARE_GOALS.started, run.id, params);
  if (run.challenge.retryOf)
    reachGoalOnce(SHARE_GOALS.retryStarted, run.id, params);
}
export function trackChallengeComplete(run: { id: string }, score: number) {
  let params = activeChallenges.get(run.id);
  try {
    params ??=
      JSON.parse(
        window.sessionStorage.getItem(`playne:challenge-analytics:${run.id}`) ??
          "null",
      ) ?? undefined;
  } catch {
    /* best effort */
  }
  if (!params) return;
  reachGoalOnce(SHARE_GOALS.completed, run.id, { ...params, score });
  if (params.attempt_kind === "retry")
    reachGoalOnce(SHARE_GOALS.retryCompleted, run.id, { ...params, score });
}
export function trackChallengeResult(
  runId: string,
  game: string,
  score: number,
  referenceScore: number,
) {
  reachGoalOnce(SHARE_GOALS.resultViewed, runId, {
    game,
    score,
    reference_score: referenceScore,
    outcome:
      score > referenceScore
        ? "win"
        : score === referenceScore
          ? "tie"
          : "behind",
  });
}
