import {
  FLOW_LEVELS,
  FLOW_VERSION,
  makeFlowPuzzle,
  replayFlow,
  type FlowAction,
} from "./flow";
export type FlowAttempt = {
  id: string;
  version?: 2 | 3;
  kind: "level" | "daily";
  key: string;
  actions: FlowAction[];
  challengeToken?: string;
};
export type FlowRecord = { score: number; stars: number };
export type FlowSave = {
  version: number;
  records: Record<string, FlowRecord>;
  active: FlowAttempt | null;
  pending: FlowAttempt[];
  motion: boolean;
  restartedForUpgrade?: true;
};
const empty = (): FlowSave => ({
  version: FLOW_VERSION,
  records: {},
  active: null,
  pending: [],
  motion: true,
});
export const flowRecordKey = (kind: string, key: string | number) =>
  `${kind}:${key}`;
export function validFlowAttempt(value: any): value is FlowAttempt {
  try {
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.id,
      ) ||
      !["level", "daily"].includes(value.kind) ||
      typeof value.key !== "string" ||
      (value.version !== undefined &&
        ![2, FLOW_VERSION].includes(value.version)) ||
      (value.challengeToken !== undefined &&
        (typeof value.challengeToken !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(value.challengeToken)))
    )
      return false;
    const puzzle = makeFlowPuzzle(
      value.kind,
      value.kind === "level" ? Number(value.key) : value.key,
      value.version ?? FLOW_VERSION,
    );
    replayFlow(puzzle, value.actions);
    return true;
  } catch {
    return false;
  }
}
export function mergeFlowRecords(
  a: Record<string, FlowRecord>,
  b: Record<string, FlowRecord>,
) {
  const records = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (
      !/^(level:\d{1,2}|daily:\d{4}-\d{2}-\d{2})$/.test(key) ||
      !Number.isInteger(value?.score) ||
      value.score < 100 ||
      value.score > 1000
    )
      continue;
    if (
      key.startsWith("level:") &&
      (Number(key.slice(6)) < 1 || Number(key.slice(6)) > FLOW_LEVELS)
    )
      continue;
    if (!records[key] || records[key].score < value.score)
      records[key] = {
        score: value.score,
        stars: value.score >= 960 ? 3 : value.score >= 800 ? 2 : 1,
      };
  }
  // Keep all campaign records and a bounded daily history.
  for (const key of Object.keys(records)
    .filter((k) => k.startsWith("daily:"))
    .sort()
    .slice(0, -60))
    delete records[key];
  return records;
}
export function readFlowSave(scope: string): FlowSave {
  const fallback = empty();
  try {
    const value = JSON.parse(
      localStorage.getItem(`playne:flow:v${FLOW_VERSION}:${scope}`) ?? "null",
    );
    if (!value) return migrateLegacySave(scope, fallback);
    if (value.version !== FLOW_VERSION) return fallback;
    return {
      ...fallback,
      records: mergeFlowRecords({}, value.records ?? {}),
      active: validFlowAttempt(value.active) ? value.active : null,
      pending: Array.isArray(value.pending)
        ? value.pending.slice(-140).filter(validFlowAttempt)
        : [],
      motion: value.motion !== false,
    };
  } catch {
    return fallback;
  }
}
function migrateLegacySave(scope: string, fallback: FlowSave): FlowSave {
  try {
    const legacy = JSON.parse(
      localStorage.getItem(`playne:flow:v2:${scope}`) ?? "null",
    );
    if (!legacy || legacy.version !== 2) return fallback;
    const tag = (value: any) => ({ ...value, version: 2 as const });
    const oldActive = tag(legacy.active);
    const validActive =
      legacy.active && validFlowAttempt(oldActive) ? oldActive : null;
    const completed =
      validActive &&
      replayFlow(
        makeFlowPuzzle(
          validActive.kind,
          validActive.kind === "level"
            ? Number(validActive.key)
            : validActive.key,
          2,
        ),
        validActive.actions,
      ).won;
    const challengeScope = scope.startsWith("challenge:");
    const restarted = !!validActive && !completed && !challengeScope;
    const records = mergeFlowRecords({}, legacy.records ?? {});
    return {
      ...fallback,
      records: Object.fromEntries(
        Object.entries(records).filter(([key]) => key.startsWith("level:")),
      ),
      active: challengeScope
        ? validActive
        : restarted
          ? {
              id: crypto.randomUUID(),
              version: FLOW_VERSION,
              kind: validActive!.kind,
              key: validActive!.key,
              actions: [],
            }
          : null,
      pending: Array.isArray(legacy.pending)
        ? legacy.pending.slice(-140).map(tag).filter(validFlowAttempt)
        : [],
      motion: legacy.motion !== false,
      ...(restarted ? { restartedForUpgrade: true as const } : {}),
    };
  } catch {
    return fallback;
  }
}
export function writeFlowSave(scope: string, save: FlowSave): boolean {
  try {
    const { restartedForUpgrade: _, ...durable } = save;
    localStorage.setItem(
      `playne:flow:v${FLOW_VERSION}:${scope}`,
      JSON.stringify(durable),
    );
    return true;
  } catch {
    return false;
  }
}
export function flowUnlocked(records: Record<string, FlowRecord>) {
  let level = 1;
  while (level < FLOW_LEVELS && records[`level:${level}`]) level++;
  return level;
}
