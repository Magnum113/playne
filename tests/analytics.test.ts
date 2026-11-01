import { afterEach, describe, expect, it, vi } from "vitest";
import {
  METRIKA_COUNTER_ID,
  METRIKA_GOALS,
  FLOW_GOALS,
  initMetrika,
  reachGoal,
  reachGoalOnce,
} from "../src/analytics";

afterEach(() => vi.unstubAllGlobals());

describe("Yandex Metrika goals", () => {
  it("uses stable identifiers and passes event parameters", () => {
    const ym = vi.fn();
    vi.stubGlobal("window", { ym });

    reachGoal(METRIKA_GOALS.gameComplete, {
      score: 420,
      new_record: true,
    });

    expect(ym).toHaveBeenCalledWith(
      METRIKA_COUNTER_ID,
      "reachGoal",
      "naglaz_game_complete",
      { score: 420, new_record: true },
    );
  });

  it("does not interrupt the game when the tag is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(() => reachGoal(METRIKA_GOALS.gameStart)).not.toThrow();
  });

  it("is safe during server rendering and when an external tag throws", () => {
    expect(() => reachGoal(METRIKA_GOALS.gameStart)).not.toThrow();
    vi.stubGlobal("window", {
      ym: () => {
        throw new Error("blocked tag");
      },
    });
    expect(() => reachGoal(METRIKA_GOALS.gameStart)).not.toThrow();
  });
});

describe("production counter isolation", () => {
  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])(
    "blocks initialization and every goal on %s",
    (hostname) => {
      const ym = vi.fn(),
        createElement = vi.fn(),
        setItem = vi.fn();
      vi.stubGlobal("window", {
        ym,
        location: { hostname },
        sessionStorage: { getItem: vi.fn(), setItem },
      });
      vi.stubGlobal("document", { createElement });
      initMetrika();
      reachGoal(FLOW_GOALS.gameStart, { game: "flow" });
      reachGoalOnce(FLOW_GOALS.gameComplete, `local-${hostname}`);
      expect(ym).not.toHaveBeenCalled();
      expect(createElement).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    },
  );
  it("keeps production goal delivery and per-attempt deduplication", () => {
    const ym = vi.fn();
    vi.stubGlobal("window", {
      ym,
      location: { hostname: "playne.ru" },
      sessionStorage: { getItem: () => null, setItem: vi.fn() },
    });
    reachGoalOnce(FLOW_GOALS.engaged, "production-attempt", { game: "flow" });
    reachGoalOnce(FLOW_GOALS.engaged, "production-attempt", { game: "flow" });
    expect(ym).toHaveBeenCalledExactlyOnceWith(
      METRIKA_COUNTER_ID,
      "reachGoal",
      FLOW_GOALS.engaged,
      { game: "flow" },
    );
    expect(new Set(Object.values(FLOW_GOALS)).size).toBe(15);
  });
});
