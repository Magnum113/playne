// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChallengeContext, {
  challengeQuery,
  readChallengeToken,
} from "../src/ChallengeContext";
import type { ChallengeGame, PublicChallenge } from "../src/challenges";
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/account", () => ({ api: (path: string) => mock.api(path) }));
const reference = (
  overrides: Partial<PublicChallenge> = {},
): PublicChallenge => ({
  token: "invite",
  url: "https://playne.ru/brain/flash/?challenge=invite",
  imageUrl: "/preview.png",
  game: "flash",
  gameName: "Вспышка",
  nickname: "Друг",
  score: 400,
  maxScore: 500,
  day: "2026-10-30",
  mode: "classic",
  isTodayDaily: true,
  ...overrides,
});
let box: HTMLDivElement, root: Root;
async function render(
  props: {
    game: ChallengeGame;
    token?: string;
    score?: number | null;
    completed?: boolean;
    runDay?: string;
    runMode?: "classic" | "practice";
    comparisonToken?: string;
  } = { game: "flash", token: "invite" },
) {
  await act(async () => root.render(<ChallengeContext {...props} />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mock.api.mockResolvedValue(reference());
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  window.history.replaceState(null, "", "/brain/flash/");
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});
describe("same-task friend challenge context", () => {
  it("does nothing without a token and never starts a party while displaying a reference", async () => {
    await render({ game: "flash" });
    expect(box.innerHTML).toBe("");
    expect(mock.api).not.toHaveBeenCalled();
    await render();
    expect(mock.api).toHaveBeenCalledExactlyOnceWith("/challenges/invite");
    expect(box.textContent).toContain("Вызов от Друг");
    expect(box.querySelector("button")).toBeNull();
  });
  it("shows a loading state until the public reference arrives", async () => {
    let resolve!: (value: PublicChallenge) => void;
    mock.api.mockReturnValue(
      new Promise<PublicChallenge>((yes) => {
        resolve = yes;
      }),
    );
    await render();
    expect(box.querySelector('[role="status"]')?.textContent).toContain(
      "Загружаем вызов",
    );
    await act(async () => resolve(reference()));
    expect(box.textContent).toContain("400 / 500");
  });
  it.each([true, false])(
    "distinguishes a current daily reference from an old/private comparison: %s",
    async (today) => {
      mock.api.mockResolvedValue(
        reference({
          isTodayDaily: today,
          mode: today ? "classic" : "practice",
        }),
      );
      await render();
      expect(box.textContent).toContain(
        today ? "Сегодняшняя задача дня" : "Те же задания, отдельное сравнение",
      );
      expect(mock.api).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["flash", "line"] as const)(
    "gives a normal %s game link for a revoked or inaccessible reference",
    async (game) => {
      mock.api.mockRejectedValue(new Error("revoked"));
      await render({ game, token: "revoked" });
      expect(box.textContent).toContain("Вызов недоступен");
      expect(box.querySelector("a")?.getAttribute("href")).toBe(
        game === "line" ? "/one-line/" : "/brain/flash/",
      );
    },
  );
  it("rejects a reference belonging to a different game", async () => {
    mock.api.mockResolvedValue(reference({ game: "rotate" }));
    await render();
    expect(box.textContent).toContain("Вызов недоступен");
    expect(box.textContent).not.toContain("Вызов от");
  });
  it.each([
    { score: 450, reference: 400, text: "Ты впереди на 50 очков" },
    { score: 400, reference: 400, text: "Ничья" },
    { score: 350, reference: 400, text: "До результата друга — 50 очков" },
    { score: 500, reference: 500, text: "Ничья" },
  ])(
    "compares saved results honestly at $score vs $reference",
    async (example) => {
      mock.api.mockResolvedValue(reference({ score: example.reference }));
      await render({
        game: "flash",
        token: "invite",
        completed: true,
        score: example.score,
        runDay: "2026-10-30",
        runMode: "classic",
      });
      expect(box.querySelector("strong")?.textContent).toBe(example.text);
      expect(box.querySelector("p")?.textContent).toBe(
        `Ты: ${example.score} · Друг: ${example.reference} / 500`,
      );
    },
  );
  it("does not compare a score from another daily pack smuggled into the result URL", async () => {
    await render({
      game: "flash",
      token: "invite",
      completed: true,
      score: 500,
      runDay: "2026-10-29",
      runMode: "classic",
    });
    expect(box.textContent).toContain("Для сравнения нужны те же задания");
    expect(box.textContent).not.toContain("Ты впереди");
    expect(box.textContent).not.toContain("Ты: 500");
    expect(box.querySelector("a")?.getAttribute("href")).toBe(
      "/brain/flash/?challenge=invite",
    );
  });
  it("compares a server-cloned old private challenge only with its matching comparison token", async () => {
    mock.api.mockResolvedValue(
      reference({ mode: "practice", isTodayDaily: false, day: "2026-10-01" }),
    );
    await render({
      game: "flash",
      token: "invite",
      completed: true,
      score: 450,
      runDay: "2026-10-01",
      runMode: "practice",
      comparisonToken: "invite",
    });
    expect(box.querySelector("strong")?.textContent).toBe(
      "Ты впереди на 50 очков",
    );
    await render({
      game: "flash",
      token: "invite",
      completed: true,
      score: 450,
      runDay: "2026-10-01",
      runMode: "practice",
      comparisonToken: "other",
    });
    expect(box.textContent).toContain("Для сравнения нужны те же задания");
    expect(box.textContent).not.toContain("Ты впереди");
  });
  it("ignores a late old token response when a new challenge has already loaded", async () => {
    let resolve!: (value: PublicChallenge) => void;
    mock.api
      .mockReturnValueOnce(
        new Promise<PublicChallenge>((yes) => {
          resolve = yes;
        }),
      )
      .mockResolvedValueOnce(
        reference({ token: "new", nickname: "Новый друг" }),
      );
    await render();
    await render({ game: "flash", token: "new" });
    await act(async () => resolve(reference({ nickname: "Старый друг" })));
    expect(box.textContent).toContain("Новый друг");
    expect(box.textContent).not.toContain("Старый друг");
  });
  it("hides loaded data when game changes with the same token, before the new request resolves", async () => {
    await render();
    expect(box.textContent).toContain("Вызов от Друг");
    mock.api.mockReturnValueOnce(new Promise(() => {}));
    await render({ game: "rotate", token: "invite" });
    expect(box.textContent).toContain("Загружаем вызов");
    expect(box.textContent).not.toContain("Вызов от Друг");
  });
  it("encodes a challenge token and preserves a pre-existing mode query", () => {
    expect(challengeQuery("/brain/flash/?mode=practice", "a+b&c")).toBe(
      "/brain/flash/?mode=practice&challenge=a%2Bb%26c",
    );
    expect(challengeQuery("/one-line/")).toBe("/one-line/");
    window.history.replaceState(null, "", "/one-line/?challenge=a%2Bb%26c");
    expect(readChallengeToken()).toBe("a+b&c");
  });
});
