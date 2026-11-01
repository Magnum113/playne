import { FLOW_GOALS, reachGoalOnce, type MetrikaParams } from "./analytics";
import { FLOW_LEVELS, FLOW_VERSION, flowDay } from "./flow";
import type { FlowAttempt } from "./flowStorage";
import type { PublicChallenge } from "./challenges";

export const FLOW_PLAYED_DAY_KEY = "playne:flow:analytics:played-days";

type AnalyticsAttempt = Pick<
  FlowAttempt,
  "kind" | "key" | "version" | "challengeToken"
>;

/** Whitelist public game dimensions; private attempts and invite tokens stay local. */
export function flowAnalyticsParams(
  attempt: AnalyticsAttempt,
  signed: boolean,
): MetrikaParams {
  const level = Number(attempt.key);
  return {
    game: "flow",
    mode: attempt.kind,
    field_version: attempt.version ?? FLOW_VERSION,
    source: attempt.challengeToken
      ? "challenge"
      : attempt.kind === "daily"
        ? "daily"
        : "campaign",
    player: signed ? "account" : "guest",
    ...(attempt.kind === "level" &&
    Number.isInteger(level) &&
    level >= 1 &&
    level <= FLOW_LEVELS
      ? { level }
      : {}),
  };
}

function canonicalDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

/** Called only after an accepted launch, so browsing the menu is not a return. */
export function trackFlowReturn(params: MetrikaParams, now = new Date()) {
  if (typeof window === "undefined" || !Number.isFinite(now.getTime())) return;
  try {
    const today = flowDay(now);
    let prior: unknown;
    try {
      prior = JSON.parse(
        window.localStorage.getItem(FLOW_PLAYED_DAY_KEY) ?? "null",
      )?.lastPlayedDay;
    } catch {
      // Missing or malformed history gives no evidence of a returning player.
    }
    if (prior === today) return;
    try {
      window.localStorage.setItem(
        FLOW_PLAYED_DAY_KEY,
        JSON.stringify({ lastPlayedDay: today }),
      );
    } catch {
      // Analytics storage may be disabled without affecting the game.
    }
    if (!canonicalDay(prior) || prior >= today) return;
    const gap = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${prior}T00:00:00Z`)) /
        86400000,
    );
    reachGoalOnce(FLOW_GOALS.returned, `flow-played:${today}`, {
      ...params,
      gap_days: gap,
    });
  } catch {
    // Date handling, storage and analytics must never interrupt a move.
  }
}

export type FlowShareContext = {
  source?: "campaign" | "daily" | "challenge";
  signed?: boolean;
};

/** A created invitation is distinct from the existing copied/sent share events. */
export function trackFlowShareCreated(
  runId: string,
  data: PublicChallenge,
  context: FlowShareContext = {},
) {
  if (data.game !== "flow") return;
  const params: MetrikaParams = { game: "flow", method: "created" };
  if (data.flow) {
    const safe = flowAnalyticsParams(
      {
        kind: data.flow.kind,
        key: data.flow.key,
        // Unversioned public invitations belong to the frozen v2 engine.
        version: data.flow.version ?? 2,
        challengeToken: context.source === "challenge" ? "present" : undefined,
      },
      context.signed ?? false,
    );
    // Public metadata describes the board, not where or who created this link.
    delete safe.source;
    delete safe.player;
    Object.assign(params, safe);
  }
  if (context.source) params.source = context.source;
  if (typeof context.signed === "boolean")
    params.player = context.signed ? "account" : "guest";
  reachGoalOnce(FLOW_GOALS.share, runId, params);
}
