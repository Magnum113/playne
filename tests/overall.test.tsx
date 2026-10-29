// @vitest-environment happy-dom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TopFiveCard,
  OverallContributions,
  OverallRules,
  OverallStandings,
} from "../src/OverallLeaderboard";
import LeaderboardPage from "../src/LeaderboardPage";
import {
  OVERALL_GAMES,
  OVERALL_MAX_POINTS,
  type OverallBoard,
  type OverallEntry,
} from "../src/overall";
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
  version: 2,
  page: 1,
  limit: 5,
  total: 1,
  entries: [entry],
  mine: null,
};
beforeEach(() => window.history.replaceState(null, "", "/leaderboard/"));
describe("Overall leaderboard UI", () => {
  it("resets expanded rows and returns focus to results after pagination", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", (path: string) => {
      const second = String(path).includes("page=2");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ...board,
            total: 26,
            page: second ? 2 : 1,
            entries: [
              {
                ...entry,
                nickname: second ? "Вторая страница" : "Первая страница",
                place: second ? 26 : 1,
              },
            ],
          }),
        ),
      );
    });
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    try {
      await act(async () => root.render(<LeaderboardPage />));
      box.querySelector(".overall-standing")!.setAttribute("open", "");
      await act(async () =>
        box
          .querySelector<HTMLButtonElement>(
            ".rank-pagination button:last-child",
          )!
          .click(),
      );
      expect(
        box.querySelector(".overall-standing summary")?.textContent,
      ).toContain("Вторая страница");
      expect(box.querySelector(".overall-standing[open]")).toBeNull();
      expect(document.activeElement).toBe(
        box.querySelector(".ranking-panel h2"),
      );
      expect(scroll).toHaveBeenCalledWith({
        block: "start",
        behavior: "instant",
      });
    } finally {
      act(() => root.unmount());
      box.remove();
      scroll.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it("cancels pagination focus when another game is selected before the page loads", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let resolvePage: (response: Response) => void = () => {};
    let resolveGame: (response: Response) => void = () => {};
    const fetch = vi.fn((path: string) => {
      if (String(path).includes("game=naglaz")) {
        return new Promise<Response>((resolve) => {
          resolveGame = resolve;
        });
      }
      if (String(path).includes("page=2")) {
        return new Promise<Response>((resolve) => {
          resolvePage = resolve;
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ...board, total: 26 })),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    try {
      await act(async () => root.render(<LeaderboardPage />));
      await act(async () =>
        box
          .querySelector<HTMLButtonElement>(
            ".rank-pagination button:last-child",
          )!
          .click(),
      );
      expect(
        fetch.mock.calls.some(([path]) => String(path).includes("page=2")),
      ).toBe(true);
      expect(box.textContent).toContain("Загружаем рейтинг");
      const gameButton = [
        ...box.querySelectorAll<HTMLButtonElement>(".rank-games button"),
      ].find((button) => button.textContent === "На глаз")!;
      await act(async () => {
        gameButton.focus();
        gameButton.click();
      });
      expect(document.activeElement).toBe(gameButton);
      await act(async () =>
        resolveGame(
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
                  nickname: "Игрок новой игры",
                  score: 400,
                  place: 1,
                  rounds: [80, 80, 80, 80, 80],
                  isMe: false,
                },
              ],
            }),
          ),
        ),
      );
      expect(box.querySelector(".rank-table")?.textContent).toContain(
        "Игрок новой игры",
      );
      expect(box.querySelector(".overall-standings")).toBeNull();
      expect(document.activeElement).toBe(gameButton);
      expect(scroll).not.toHaveBeenCalled();
      await act(async () =>
        resolvePage(
          new Response(
            JSON.stringify({
              ...board,
              total: 26,
              page: 2,
              entries: [{ ...entry, nickname: "Запоздалый игрок", place: 26 }],
            }),
          ),
        ),
      );
      expect(box.querySelector(".rank-table")?.textContent).toContain(
        "Игрок новой игры",
      );
      expect(box.textContent).not.toContain("Запоздалый игрок");
      expect(gameButton.getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(gameButton);
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      box.remove();
      scroll.mockRestore();
      vi.unstubAllGlobals();
    }
  });
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
      expect(box.querySelector(".overall-standings")).toBeTruthy();
      await act(async () => click("На глаз"));
      expect(box.querySelector(".rank-table")).toBeNull();
      expect(box.textContent).toContain("Загружаем рейтинг");
      await act(async () => resolveGame(gameResponse()));
      expect(box.querySelector(".rank-table")).toBeTruthy();
      expect(box.querySelector(".overall-standings")).toBeNull();
      await act(async () => click("Общий"));
      expect(box.querySelector(".overall-standings")).toBeTruthy();
      await act(async () => click("На глаз"));
      await act(async () => click("Общий"));
      await act(async () => resolveGame(gameResponse()));
      expect(box.querySelector(".overall-standings")).toBeTruthy();
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
    expect(box.querySelector('a[href="/one-line/"]')).toBeTruthy();
    expect(box.querySelectorAll(".overall-contributions > li")).toHaveLength(6);
    expect(box.textContent).toContain("Не сыграно");
  });
  it("shows six equal game contributions with classic-only line rules", () => {
    expect(OVERALL_GAMES).toHaveLength(6);
    expect(OVERALL_MAX_POINTS).toBe(6000);
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(
      <>
        <OverallRules />
        <OverallStandings entries={[{ ...entry, gamesPlayed: 6 }]} />
      </>,
    );
    expect(box.textContent).toContain("6 из 6 игр");
    expect(box.textContent).toContain("«Практика» не учитывается");
  });
  it.each([
    ["line", "practice", "practice", "/one-line/?mode=practice"],
    ["line", "moving-timed", "classic", "/one-line/"],
    ["naglaz", "moving", "classic", "/naglaz/"],
    ["circle", "practice", "classic", "/circle/"],
    ["pressure", "timed", "classic", "/pressure/"],
    ["colorfle", "moving-timed", "classic", "/colorfle/"],
    ["geo", "practice", "classic", "/geo/"],
  ])(
    "limits %s deep-link mode %s to %s",
    async (game, requestedMode, mode, playPath) => {
      window.history.replaceState(
        null,
        "",
        `/leaderboard/?game=${game}&mode=${requestedMode}&period=all`,
      );
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const fetch = vi.fn((path: string) => {
        const query = new URL(String(path), "https://playne.ru").searchParams;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              game: query.get("game"),
              mode: query.get("mode"),
              period: "all",
              page: 1,
              total: 0,
              entries: [],
              mine: null,
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fetch);
      const box = document.createElement("div");
      document.body.append(box);
      const root = createRoot(box);
      try {
        await act(async () => root.render(<LeaderboardPage />));
        expect(
          fetch.mock.calls.some(([path]) =>
            String(path).includes(`mode=${mode}`),
          ),
        ).toBe(true);
        expect(box.querySelector(".rank-empty a")?.getAttribute("href")).toBe(
          playPath,
        );
        expect(box.querySelectorAll(".rank-games button")).toHaveLength(7);
      } finally {
        act(() => root.unmount());
        box.remove();
        vi.unstubAllGlobals();
      }
    },
  );
  it("clears practice when switching from line to geography", async () => {
    window.history.replaceState(
      null,
      "",
      "/leaderboard/?game=line&mode=practice&period=all",
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetch = vi.fn((path: string) => {
      const query = new URL(String(path), "https://playne.ru").searchParams;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            game: query.get("game"),
            mode: query.get("mode"),
            period: "all",
            page: 1,
            total: 0,
            entries: [],
            mine: null,
          }),
        ),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    try {
      await act(async () => root.render(<LeaderboardPage />));
      await act(async () =>
        [...box.querySelectorAll<HTMLButtonElement>(".rank-games button")]
          .find((b) => b.textContent === "Где я?")!
          .click(),
      );
      expect(window.location.search).toContain("game=geo&mode=classic");
      expect(
        fetch.mock.calls.some(
          ([path]) =>
            String(path).includes("game=geo") &&
            String(path).includes("mode=classic"),
        ),
      ).toBe(true);
      expect(box.querySelector('[aria-label="Режим Одной линией"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      box.remove();
      vi.unstubAllGlobals();
    }
  });
});
