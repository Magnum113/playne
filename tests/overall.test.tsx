// @vitest-environment happy-dom
import { beforeEach, describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TopFiveCard, OverallContributions } from "../src/OverallLeaderboard";
import LeaderboardPage from "../src/LeaderboardPage";
import type { OverallBoard, OverallEntry } from "../src/overall";
const entry: OverallEntry = {
  nickname: "<img src=x onerror=alert(1)>",
  score: 3509,
  place: 1,
  gamesPlayed: 2,
  isMe: false,
  contributions: [
    { game: "naglaz", mode: "classic", score: 400, points: 800 },
    { game: "geo", mode: "landmarks-timed", score: 480, points: 960 },
  ],
};
const board: OverallBoard = {
  game: "overall",
  period: "all",
  version: 1,
  page: 1,
  limit: 5,
  total: 1,
  entries: [entry],
  mine: null,
};
beforeEach(() => window.history.replaceState(null, "", "/leaderboard/"));
describe("Overall leaderboard UI", () => {
  it("shows the overall all-time board by default without weekly controls", () => {
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(<LeaderboardPage />);
    expect(
      box.querySelector(".rank-games button[aria-pressed=true]")?.textContent,
    ).toBe("Общий");
    expect(box.querySelector('[aria-label="Период рейтинга"]')).toBeNull();
    expect(box.textContent).toContain("За всё время");
    expect(box.textContent).toContain("Как считаются баллы");
  });
  it("retains game-specific all-time deep links", () => {
    window.history.replaceState(
      null,
      "",
      "/leaderboard/?game=geo&mode=landmarks-timed&period=all",
    );
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(<LeaderboardPage />);
    expect(
      box.querySelector(".rank-games button[aria-pressed=true]")?.textContent,
    ).toBe("Где я?");
    const period = box.querySelector('[aria-label="Период рейтинга"]');
    expect(
      period?.querySelector("button[aria-pressed=true]")?.textContent,
    ).toBe("Всё время");
  });
  it("never invents players and safely renders user nicknames", () => {
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(<TopFiveCard data={board} />);
    expect(box.querySelectorAll("li")).toHaveLength(5);
    expect(box.querySelectorAll("img,script")).toHaveLength(0);
    expect(box.querySelector(".top-five-name")?.textContent).toBe(
      entry.nickname,
    );
    expect(
      [...box.querySelectorAll(".top-five-name")].filter(
        (n) => n.textContent === "Место свободно",
      ),
    ).toHaveLength(4);
    expect(
      [...box.querySelectorAll("a")].every(
        (a) => a.getAttribute("href") === "/leaderboard/?game=overall",
      ),
    ).toBe(true);
  });
  it("shows personal rank only when the API supplies it and offers routes for unplayed games", () => {
    expect(
      renderToStaticMarkup(
        <TopFiveCard
          data={{ ...board, mine: { ...entry, place: 28, isMe: true } }}
        />,
      ),
    ).toContain("ты №28");
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(
      <OverallContributions entry={entry} />,
    );
    expect(
      box.querySelector(
        'a[href="/leaderboard/?game=geo&mode=landmarks-timed&period=all"]',
      ),
    ).toBeTruthy();
    expect(box.querySelector('a[href="/circle/"]')).toBeTruthy();
    expect(box.textContent).toContain("Не сыграно");
  });
});
