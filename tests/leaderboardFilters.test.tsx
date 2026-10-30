// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LeaderboardPage from "../src/LeaderboardPage";

describe("Leaderboard filter grouping", () => {
  it.each(["geo", "colorfle", "line", "brain"])(
    "gives %s filter sets names without changing pressed-state buttons into incomplete tabs",
    (game) => {
      window.history.replaceState(null, "", `/leaderboard/?game=${game}`);
      const box = document.createElement("div");
      box.innerHTML = renderToStaticMarkup(<LeaderboardPage />);
      const filters = [
        ...box.querySelectorAll(".rank-games,.rank-brain-games,.rank-period"),
      ];
      expect(filters.length).toBeGreaterThanOrEqual(2);
      filters.forEach((group) => {
        expect(group.getAttribute("role")).toBe("group");
        expect(group.getAttribute("aria-label")).toBeTruthy();
        expect(
          group.querySelectorAll('button[aria-pressed="true"]'),
        ).toHaveLength(1);
      });
    },
  );
});
