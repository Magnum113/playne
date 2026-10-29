// @vitest-environment happy-dom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
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
  it("does not reuse another board's response during switching or accept late responses", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let resolveGame: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", (path: string) =>
      String(path).includes("game=overall")
        ? Promise.resolve(new Response(JSON.stringify(board)))
        : new Promise<Response>((resolve) => {
            resolveGame = resolve;
          }),
    );
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const click = (name: string) =>
      [...box.querySelectorAll<HTMLButtonElement>(".rank-games button")]
        .find((b) => b.textContent === name)!
        .click();
    const gameResponse = () =>
      new Response(
        JSON.stringify({
          game: "naglaz",
          mode: "classic",
          period: "all",
          page: 1,
          total: 1,
          mine: null,
          entries: [
            {
              nickname: "Игрок",
              score: 400,
              place: 1,
              rounds: [80, 80, 80, 80, 80],
              isMe: false,
            },
          ],
        }),
      );
    try {
      await act(async () => root.render(<LeaderboardPage />));
      expect(box.querySelector(".overall-table")).toBeTruthy();
      await act(async () => click("На глаз"));
      expect(box.querySelector(".rank-table")).toBeNull();
      expect(box.textContent).toContain("Загружаем рейтинг");
      await act(async () => resolveGame(gameResponse()));
      expect(box.querySelector(".rank-table")).toBeTruthy();
      expect(box.querySelector(".overall-table")).toBeNull();
      await act(async () => click("Общий"));
      expect(box.querySelector(".overall-table")).toBeTruthy();
      await act(async () => click("На глаз"));
      await act(async () => click("Общий"));
      await act(async () => resolveGame(gameResponse()));
      expect(box.querySelector(".overall-table")).toBeTruthy();
      expect(
        box.querySelector('.rank-games button[aria-pressed="true"]')
          ?.textContent,
      ).toBe("Общий");
    } finally {
      act(() => root.unmount());
      box.remove();
      vi.unstubAllGlobals();
    }
  });
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
