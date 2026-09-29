import { afterEach, describe, expect, it, vi } from "vitest";
import { METRIKA_COUNTER_ID, METRIKA_GOALS, reachGoal } from "../src/analytics";

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
