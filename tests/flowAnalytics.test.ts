// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://playne.ru/swarm/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicChallenge } from "../src/challenges";

let helper: typeof import("../src/flowAnalytics");
let analytics: typeof import("../src/analytics");
let ym = vi.fn();
const origin = "https://playne.ru/swarm/";

beforeEach(async () => {
  vi.resetModules();
  window.history.replaceState(null, "", origin);
  localStorage.clear();
  sessionStorage.clear();
  ym = vi.fn();
  window.ym = ym;
  helper = await import("../src/flowAnalytics");
  analytics = await import("../src/analytics");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.ym;
});

const attempt = (kind: "level" | "daily" = "level", key = "13") => ({
  id: "private-attempt-id",
  kind,
  key,
  version: 4 as const,
  challengeToken: "private-invitation-token",
  actions: [{ type: "launch" as const, lane: 2 }],
});
const shared: PublicChallenge = {
  token: "private-public-token",
  url: "https://playne.ru/c/private-code",
  imageUrl: "https://playne.ru/api/private-image",
  nickname: "private-nickname",
  game: "flow",
  gameName: "Рой",
  score: 1000,
  maxScore: 1000,
  day: "2026-11-01",
  mode: "practice",
  isTodayDaily: false,
  flow: { kind: "level", key: "13", stars: 3, version: 4 },
};

describe("Swarm analytics privacy and real returns", () => {
  it("whitelists public dimensions and uses numeric campaign levels", () => {
    expect(helper.flowAnalyticsParams(attempt(), true)).toEqual({
      game: "flow",
      mode: "level",
      level: 13,
      field_version: 4,
      source: "challenge",
      player: "account",
    });
    expect(
      helper.flowAnalyticsParams(attempt("daily", "2026-11-01"), false),
    ).toEqual({
      game: "flow",
      mode: "daily",
      field_version: 4,
      source: "challenge",
      player: "guest",
    });
    expect(
      JSON.stringify(helper.flowAnalyticsParams(attempt(), false)),
    ).not.toMatch(/private|actions|token|attempt|2026/);
    const campaign = {
      ...attempt(),
      version: undefined,
      challengeToken: undefined,
    };
    expect(helper.flowAnalyticsParams(campaign, false)).toMatchObject({
      source: "campaign",
      field_version: 4,
    });
    expect(
      helper.flowAnalyticsParams(
        { ...campaign, kind: "daily", key: "2026-11-01" },
        false,
      ),
    ).toMatchObject({ source: "daily" });
    for (const key of ["private-data", "0", "37", "13.5", "Infinity"]) {
      expect(
        helper.flowAnalyticsParams({ ...campaign, key }, false),
      ).not.toHaveProperty("level");
    }
  });

  it("counts playing on another Moscow day once, never same-day browsing/reload", () => {
    const params = helper.flowAnalyticsParams(attempt(), false);
    helper.trackFlowReturn(params, new Date("2026-11-01T20:59:59Z"));
    expect(ym).not.toHaveBeenCalled();
    helper.trackFlowReturn(params, new Date("2026-11-01T20:59:59.999Z"));
    expect(ym).not.toHaveBeenCalled();
    helper.trackFlowReturn(params, new Date("2026-11-01T21:00:00Z"));
    helper.trackFlowReturn(params, new Date("2026-11-02T12:00:00Z"));
    expect(ym).toHaveBeenCalledExactlyOnceWith(
      analytics.METRIKA_COUNTER_ID,
      "reachGoal",
      analytics.FLOW_GOALS.returned,
      { ...params, gap_days: 1 },
    );
    expect(
      JSON.parse(localStorage.getItem(helper.FLOW_PLAYED_DAY_KEY)!),
    ).toEqual({ lastPlayedDay: "2026-11-02" });
    helper.trackFlowReturn(params, new Date("2026-11-05T12:00:00Z"));
    expect(ym.mock.calls[1]?.[3]).toMatchObject({ gap_days: 3 });
    expect(JSON.stringify(ym.mock.calls)).not.toMatch(
      /private|2026|https|nickname/,
    );
  });

  it.each([
    "broken-json",
    JSON.stringify({ lastPlayedDay: "2026-02-31" }),
    JSON.stringify({ lastPlayedDay: "2099-01-01" }),
    JSON.stringify({ lastPlayedDay: 42 }),
  ])("does not invent a return from invalid or future history: %s", (value) => {
    localStorage.setItem(helper.FLOW_PLAYED_DAY_KEY, value);
    helper.trackFlowReturn({ game: "flow" }, new Date("2026-11-02T12:00:00Z"));
    expect(ym).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(helper.FLOW_PLAYED_DAY_KEY)!),
    ).toEqual({ lastPlayedDay: "2026-11-02" });
  });

  it("keeps gameplay safe when local and session storage are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("blocked");
    });
    expect(() =>
      helper.trackFlowReturn(
        { game: "flow" },
        new Date("2026-11-02T12:00:00Z"),
      ),
    ).not.toThrow();
    expect(ym).not.toHaveBeenCalled();
  });

  it("deduplicates an evidenced return even when saving the updated day is blocked", () => {
    localStorage.setItem(
      helper.FLOW_PLAYED_DAY_KEY,
      JSON.stringify({ lastPlayedDay: "2026-11-01" }),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("blocked");
    });
    helper.trackFlowReturn({ game: "flow" }, new Date("2026-11-02T12:00:00Z"));
    helper.trackFlowReturn({ game: "flow" }, new Date("2026-11-02T12:00:00Z"));
    expect(ym).toHaveBeenCalledTimes(1);
    expect(ym.mock.calls[0]?.[2]).toBe(analytics.FLOW_GOALS.returned);
  });

  it("is safe for invalid clocks and server rendering", () => {
    expect(() =>
      helper.trackFlowReturn({ game: "flow" }, new Date("invalid")),
    ).not.toThrow();
    vi.stubGlobal("window", undefined);
    expect(() => helper.trackFlowReturn({ game: "flow" })).not.toThrow();
    expect(ym).not.toHaveBeenCalled();
  });

  it("counts a successful Swarm invitation creation once without leaking link data", () => {
    helper.trackFlowShareCreated("share-created-private-run", shared, {
      source: "campaign",
      signed: true,
    });
    helper.trackFlowShareCreated("share-created-private-run", shared, {
      source: "campaign",
      signed: true,
    });
    expect(ym).toHaveBeenCalledExactlyOnceWith(
      analytics.METRIKA_COUNTER_ID,
      "reachGoal",
      analytics.FLOW_GOALS.share,
      {
        game: "flow",
        source: "campaign",
        player: "account",
        method: "created",
        mode: "level",
        field_version: 4,
        level: 13,
      },
    );
    expect(JSON.stringify(ym.mock.calls)).not.toMatch(
      /private|https|nickname|token/,
    );
    helper.trackFlowShareCreated("another-game", {
      ...shared,
      game: "circle",
      flow: undefined,
    });
    expect(ym).toHaveBeenCalledTimes(1);
  });

  it.each([
    { source: "campaign" as const, kind: "level" as const },
    { source: "daily" as const, kind: "daily" as const },
    { source: "challenge" as const, kind: "daily" as const },
  ])(
    "preserves explicit $source share context instead of inferring it from the artifact",
    ({ source, kind }) => {
      helper.trackFlowShareCreated(
        `share-context-${source}`,
        {
          ...shared,
          flow: {
            kind,
            key: kind === "daily" ? "2026-11-01" : "13",
            stars: 3,
            version: 4,
          },
        },
        { source, signed: false },
      );
      expect(ym.mock.calls[0]?.[3]).toMatchObject({
        source,
        player: "guest",
        mode: kind,
        method: "created",
      });
      expect(JSON.stringify(ym.mock.calls)).not.toMatch(
        /private|https|2026|token|nickname/,
      );
    },
  );

  it("does not invent the unknown source or viewer from public metadata", () => {
    helper.trackFlowShareCreated("share-unknown-context", shared);
    expect(ym.mock.calls[0]?.[3]).not.toHaveProperty("source");
    expect(ym.mock.calls[0]?.[3]).not.toHaveProperty("player");
  });

  it("preserves the legacy public version and hides daily dates in share events", () => {
    helper.trackFlowShareCreated("legacy-share", {
      ...shared,
      flow: { kind: "daily", key: "2026-11-01", stars: 3 },
    });
    expect(ym.mock.calls[0]?.[3]).toEqual({
      game: "flow",
      method: "created",
      mode: "daily",
      field_version: 2,
    });
  });
});
