import { afterEach, describe, expect, it, vi } from "vitest";
import { challengeAnalyticsScript } from "../server/challenge-analytics";

afterEach(() => vi.unstubAllGlobals());

describe("local friend invitation analytics", () => {
  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])(
    "does not load the production tag or convert on %s",
    (hostname) => {
      const ym = vi.fn();
      const createElement = vi.fn();
      const appendChild = vi.fn();
      vi.stubGlobal("window", { location: { hostname }, ym });
      vi.stubGlobal("document", {
        body: { dataset: { game: "flow", mode: "practice" } },
        createElement,
        head: { appendChild },
      });
      expect(() => new Function(challengeAnalyticsScript)()).not.toThrow();
      expect(ym).not.toHaveBeenCalled();
      expect(createElement).not.toHaveBeenCalled();
      expect(appendChild).not.toHaveBeenCalled();
    },
  );
});
