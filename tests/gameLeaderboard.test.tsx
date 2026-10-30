// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GameLeaderboard, {
  GameLeaderboardCard,
  type GameRankBoard,
} from "../src/GameLeaderboard";
import GameResultLayout from "../src/GameResultLayout";
import { ResultStatus } from "../src/ResultStatus";

const mock = vi.hoisted(() => ({
  user: { id: "player-a" } as { id: string } | null,
  loading: false,
  api: vi.fn(),
}));
vi.mock("../src/account", async (original) => ({
  ...(await original<typeof import("../src/account")>()),
  api: mock.api,
  useAuth: () => ({ user: mock.user, loading: mock.loading }),
}));
const board: GameRankBoard = {
  entries: [1, 2, 3, 4, 5].map((i) => ({
    nickname: `Игрок ${i}`,
    score: 100 - i,
    place: i,
    isMe: false,
  })),
  mine: { nickname: "Твой ник", score: 84.5, place: 37, isMe: true },
};
let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.api.mockReset().mockResolvedValue(board);
  mock.user = { id: "player-a" };
  mock.loading = false;
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});

it("shows five leaders, an ellipsis and the player's actual rank in the same panel", () => {
  act(() => root.render(<GameLeaderboardCard game="circle" data={board} />));
  expect(
    box.querySelectorAll(".top-five-list:first-of-type > li"),
  ).toHaveLength(5);
  expect(box.querySelector(".game-rank-gap")?.textContent).toBe("···");
  expect(
    box.querySelector(".game-rank-mine .top-five-place")?.textContent,
  ).toBe("37");
  expect(
    box.querySelector(".game-rank-mine .top-five-score")?.textContent,
  ).toBe("84,5%");
  expect(box.querySelector(".game-rank-mine .is-me")).not.toBeNull();
});
it("highlights a player inside the five without duplicating them below or inventing empty scores", () => {
  const mine = { ...board.entries[2], isMe: true };
  act(() =>
    root.render(
      <GameLeaderboardCard
        game="naglaz"
        data={{ entries: [board.entries[0], { ...mine, place: 1 }], mine }}
      />,
    ),
  );
  expect(box.querySelectorAll("li")).toHaveLength(2);
  expect(box.querySelectorAll("li.is-me")).toHaveLength(1);
  expect(box.querySelector(".game-rank-gap")).toBeNull();
});
it("keeps no-result, error and loading states distinct and does not invent a guest place", () => {
  act(() =>
    root.render(
      <GameLeaderboardCard game="geo" data={{ entries: [], mine: null }} />,
    ),
  );
  expect(box.textContent).toContain("Пока нет результатов");
  expect(box.querySelector(".game-rank-mine")).toBeNull();
  const retry = vi.fn();
  act(() =>
    root.render(
      <GameLeaderboardCard game="geo" data={null} error onRetry={retry} />,
    ),
  );
  act(() => box.querySelector("button")!.click());
  expect(retry).toHaveBeenCalledOnce();
  act(() =>
    root.render(<GameLeaderboardCard game="geo" data={null} loading />),
  );
  expect(box.textContent).toContain("Загружаем рейтинг");
  expect(box.textContent).not.toContain("Пока нет результатов");
});
it("requests only the selected game's mode and refreshes after publication", async () => {
  await act(async () =>
    root.render(<GameLeaderboard game="colorfle" mode="timed" refreshKey="" />),
  );
  expect(mock.api).toHaveBeenLastCalledWith(
    "/leaderboard?game=colorfle&mode=timed&period=all&limit=5",
  );
  await act(async () =>
    root.render(
      <GameLeaderboard
        game="colorfle"
        mode="timed"
        refreshKey="published-run"
      />,
    ),
  );
  expect(mock.api).toHaveBeenCalledTimes(2);
  await act(async () =>
    root.render(<GameLeaderboard game="slide" mode="practice" />),
  );
  expect(mock.api).toHaveBeenLastCalledWith(
    "/leaderboard?game=slide&mode=classic&period=all&limit=5",
  );
});
it("discards stale boards and identity-specific rows on account or mode changes", async () => {
  let resolveOld!: (data: GameRankBoard) => void;
  mock.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await act(async () =>
    root.render(<GameLeaderboard game="geo" mode="timed" />),
  );
  mock.user = { id: "player-b" };
  mock.api.mockResolvedValue({ ...board, mine: null });
  await act(async () =>
    root.render(<GameLeaderboard game="geo" mode="moving" />),
  );
  await act(async () => resolveOld(board));
  expect(box.querySelector(".game-rank-mine")).toBeNull();
  expect(box.querySelector(".top-five-cta")?.getAttribute("href")).toContain(
    "mode=moving",
  );
});
it("mounts a ranking only on desktop and only when the result layout is enabled", async () => {
  let wide = false,
    listener: () => void = () => {};
  vi.stubGlobal("matchMedia", () => ({
    matches: wide,
    addEventListener: (_name: string, fn: () => void) => {
      listener = fn;
    },
    removeEventListener: vi.fn(),
  }));
  await act(async () =>
    root.render(
      <GameResultLayout game="circle">
        <div>Игра</div>
      </GameResultLayout>,
    ),
  );
  expect(mock.api).not.toHaveBeenCalled();
  await act(async () => {
    wide = true;
    listener();
  });
  expect(box.querySelector("aside")).not.toBeNull();
  expect(mock.api).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(
      <GameResultLayout game="circle" enabled={false}>
        <div>Игра</div>
      </GameResultLayout>,
    ),
  );
  expect(box.querySelector("aside")).toBeNull();
});
it("removes the saved-success text without hiding save failures or retry actions", () => {
  act(() =>
    root.render(
      <ResultStatus state="saved" ranking="/leaderboard/?game=circle" />,
    ),
  );
  expect(box.textContent).not.toContain("Результат сохранён");
  expect(box.querySelector("p")).toBeNull();
  expect(box.querySelector("a")).not.toBeNull();
  const retry = vi.fn();
  act(() => root.render(<ResultStatus state="save-error" onRetry={retry} />));
  expect(box.textContent).toContain("Не удалось отправить");
  act(() => box.querySelector("button")!.click());
  expect(retry).toHaveBeenCalledOnce();
});
