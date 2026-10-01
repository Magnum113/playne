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

type Values<T> = T[keyof T];
export type MetrikaGoal =
  | Values<typeof METRIKA_GOALS>
  | Values<typeof CIRCLE_GOALS>
  | Values<typeof SHADE_GOALS>;
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
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
}

export function reachGoal(goal: MetrikaGoal, params?: MetrikaParams) {
  if (typeof window === "undefined") return;
  try {
    window.ym?.(METRIKA_COUNTER_ID, "reachGoal", goal, params);
  } catch {
    // Analytics must never interrupt a player's action.
  }
}
