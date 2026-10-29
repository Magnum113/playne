// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import BrainGame from "../src/BrainGame";
import {
  makeBrainChallenge,
  publicBrainRound,
  slideHint,
  type BrainGame as Game,
  type FlashRound,
  type SlideRound,
} from "../src/brain";

const mock = vi.hoisted(() => ({
  begin: vi.fn(),
  resume: vi.fn(),
  brainStart: vi.fn(),
  brainAnswer: vi.fn(),
  brainHint: vi.fn(),
  user: { id: "u", nickname: "Игрок" } as {
    id: string;
    nickname: string;
  } | null,
}));
vi.mock("../src/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/account")>()),
  useRankedRun: () => ({ ...mock, state: { status: "ready" } }),
  useGuestTrial: () => ({
    user: mock.user,
    ready: true,
    loading: false,
    blocked: false,
    resume: false,
    refresh: vi.fn(),
  }),
  AccountNav: () => <a href="/account/">Личный кабинет</a>,
  GuestSavedNotice: () => null,
  SaveResult: () => (
    <div data-testid="public-save">Сохранение в публичный рейтинг</div>
  ),
}));

const runId = "12345678-1234-4234-8234-123456789012";
let box: HTMLDivElement, root: Root;
const button = (name: string) =>
  [...box.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === name,
  )!;
function fixture(game: Game, mode = "classic") {
  const privateChallenge = makeBrainChallenge(game, 123, 1, "2026-10-29");
  return {
    id: runId,
    game,
    mode,
    answers: [],
    challenge: {
      ...privateChallenge,
      mode,
      rounds: privateChallenge.rounds.map((r) => publicBrainRound(r)),
      states: {},
    },
    privateChallenge,
  };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  window.history.replaceState(null, "", "/brain/flash/");
  localStorage.clear();
  vi.clearAllMocks();
  mock.user = { id: "u", nickname: "Игрок" };
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("brain game orchestration", () => {
  function completedDaily() {
    const data = fixture("rotate");
    return {
      ...data,
      completed: true,
      score: 500,
      answers: Array.from({ length: 5 }, () => ({
        same: true,
        correctSame: true,
        score: 100,
      })),
    };
  }

  it("keeps yesterday's result visible and starts today's pack only after a click", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    const yesterday = completedDaily();
    window.history.replaceState(null, "", `/brain/rotate/?result=${runId}`);
    mock.resume.mockResolvedValue(yesterday);
    const today = fixture("rotate");
    mock.begin.mockResolvedValue({
      ...today,
      id: "12345678-1234-4234-8234-123456789013",
      challenge: { ...today.challenge, day: "2026-10-30" },
    });
    await act(async () => root.render(<BrainGame game="rotate" />));
    expect(box.querySelector(".brain-total strong")?.textContent).toBe("500");
    expect(box.querySelector(".brain-summary .eyebrow")?.textContent).toContain(
      "2026-10-29",
    );
    expect(button("Начать задачу дня")).toBeTruthy();
    expect(mock.begin).not.toHaveBeenCalled();
    expect(mock.brainStart).not.toHaveBeenCalled();
    await act(async () => button("Начать задачу дня").click());
    expect(mock.begin).toHaveBeenCalledWith("classic", 1);
    expect(mock.brainStart).not.toHaveBeenCalled();
    expect(button("Начать раунд →")).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it.each(["focus", "visibility", "interval"])(
    "offers the new Moscow day on %s without changing the old result",
    async (trigger) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-29T20:59:50Z"));
      window.history.replaceState(null, "", `/brain/rotate/?result=${runId}`);
      mock.resume.mockResolvedValue(completedDaily());
      await act(async () => root.render(<BrainGame game="rotate" />));
      expect(button("Начать задачу дня")).toBeUndefined();
      vi.setSystemTime(new Date("2026-10-29T21:00:01Z"));
      await act(async () => {
        if (trigger === "focus") window.dispatchEvent(new Event("focus"));
        else if (trigger === "visibility")
          document.dispatchEvent(new Event("visibilitychange"));
        else vi.advanceTimersByTime(30_000);
      });
      expect(button("Начать задачу дня")).toBeTruthy();
      expect(box.querySelector(".brain-total strong")?.textContent).toBe("500");
      expect(window.location.search).toBe(`?result=${runId}`);
      expect(mock.resume).toHaveBeenCalledTimes(1);
      expect(mock.begin).not.toHaveBeenCalled();
      expect(mock.brainStart).not.toHaveBeenCalled();
      expect(box.querySelector(".brain-stage")).toBeNull();
    },
  );

  it("keeps the existing login gate for a guest viewing an old daily result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    mock.user = null;
    window.history.replaceState(null, "", `/brain/rotate/?result=${runId}`);
    mock.resume.mockResolvedValue(completedDaily());
    await act(async () => root.render(<BrainGame game="rotate" />));
    expect(box.querySelector(".brain-total strong")?.textContent).toBe("500");
    expect(box.querySelector('[data-testid="public-save"]')).toBeTruthy();
    expect(button("Начать задачу дня")).toBeUndefined();
    expect(mock.begin).not.toHaveBeenCalled();
  });

  it("retains the historical result and its link when the new day cannot load", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    window.history.replaceState(null, "", `/brain/rotate/?result=${runId}`);
    mock.resume.mockResolvedValue(completedDaily());
    mock.begin.mockRejectedValue(new Error("Нет соединения"));
    await act(async () => root.render(<BrainGame game="rotate" />));
    await act(async () => button("Начать задачу дня").click());
    expect(box.querySelector(".brain-total strong")?.textContent).toBe("500");
    expect(box.querySelector('[role="alert"]')?.textContent).toBe(
      "Нет соединения",
    );
    expect(window.location.search).toBe(`?result=${runId}`);
    expect(button("Начать задачу дня")?.disabled).toBe(false);
  });

  it.each([
    ["3", 3],
    ["2", 2],
    ["4", 1],
    ["bad", 1],
  ])(
    "opens the recommended practice level %s as %s",
    async (level, expected) => {
      window.history.replaceState(
        null,
        "",
        `/brain/rotate/?mode=practice&level=${level}`,
      );
      mock.begin.mockResolvedValue(null);
      await act(async () => root.render(<BrainGame game="rotate" />));
      expect(
        box.querySelector<HTMLInputElement>(
          ".brain-difficulty-choice input:checked",
        )?.value,
      ).toBe(String(expected));
      await act(async () => button("Начать игру→").click());
      expect(mock.begin).toHaveBeenCalledWith("practice", expected);
    },
  );
  it("never re-exposes flash cells after reloading an active reveal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const data = fixture("flash");
    const round = data.privateChallenge.rounds[0] as FlashRound;
    mock.begin.mockResolvedValue(data);
    mock.resume.mockResolvedValue({
      ...data,
      challenge: {
        ...data.challenge,
        states: { 0: { startedAt: Date.now(), hints: 0 } },
      },
    });
    mock.brainStart.mockResolvedValue({
      round,
      startedAt: Date.now(),
      serverNow: Date.now(),
      revealUntil: Date.now() + round.showMs,
      hints: 0,
    });
    await act(async () => root.render(<BrainGame game="flash" />));
    await act(async () => button("Начать игру→").click());
    await act(async () => button("Начать раунд →").click());
    expect(box.querySelectorAll(".brain-flash-cell.is-target")).toHaveLength(
      round.count,
    );
    expect(localStorage.getItem("playne:brain-flash:active:v1")).not.toContain(
      '"correctCells"',
    );
    expect(
      JSON.parse(localStorage.getItem("playne:brain-flash:active:v1")!)
        .flashSeen,
    ).toBe(true);
    act(() => root.unmount());
    root = createRoot(box);
    await act(async () => root.render(<BrainGame game="flash" />));
    await act(async () => button("Начать игру→").click());
    expect(mock.resume).toHaveBeenCalledWith(runId);
    expect(box.querySelectorAll(".brain-flash-cell.is-target")).toHaveLength(0);
    expect(button("Проверить →")).toBeUndefined();
    await act(async () => vi.advanceTimersByTime(round.showMs + 100));
    expect(button("Проверить →")).toBeTruthy();
  });

  it("retries the same answer and waits for an explicit next round", async () => {
    const data = fixture("rotate");
    mock.begin.mockResolvedValue(data);
    mock.brainStart.mockResolvedValue({
      round: data.challenge.rounds[0],
      startedAt: Date.now(),
      serverNow: Date.now(),
      hints: 0,
    });
    mock.brainAnswer
      .mockRejectedValueOnce(new Error("Соединение прервалось"))
      .mockResolvedValueOnce({
        ...data,
        answers: [{ same: true, score: 100, correctSame: true }],
      });
    await act(async () => root.render(<BrainGame game="rotate" />));
    await act(async () => button("Начать игру→").click());
    await act(async () => button("Начать раунд →").click());
    await act(async () =>
      box
        .querySelector<HTMLButtonElement>(".brain-binary-controls button")!
        .click(),
    );
    expect(box.textContent).toContain("Соединение прервалось");
    await act(async () => button("Повторить отправку").click());
    expect(mock.brainAnswer.mock.calls).toEqual([
      [0, { same: true }],
      [0, { same: true }],
    ]);
    expect(box.querySelector(".brain-rotation-correction")).toBeTruthy();
    await act(async () => button("Следующий раунд →").click());
    expect(mock.brainStart).toHaveBeenCalledTimes(1);
    expect(button("Начать раунд →")).toBeTruthy();
  });

  it("opens a completed private result without starting a timer or publishing", async () => {
    const data = fixture("flash", "practice");
    window.history.replaceState(null, "", `/brain/flash/?result=${runId}`);
    mock.resume.mockResolvedValue({
      ...data,
      completed: true,
      score: 500,
      answers: data.privateChallenge.rounds.map((r) => ({
        score: 100,
        cells: (r as FlashRound).cells,
        correctCells: (r as FlashRound).cells,
      })),
    });
    await act(async () =>
      root.render(
        <StrictMode>
          <BrainGame game="flash" />
        </StrictMode>,
      ),
    );
    expect(box.textContent).toContain("Результат практики сохранён");
    expect(box.textContent).not.toContain("— / —");
    expect(box.querySelector('[data-testid="public-save"]')).toBeNull();
    expect(mock.brainStart).not.toHaveBeenCalled();
    expect(mock.resume).toHaveBeenCalledTimes(1);
    expect(
      box.querySelector('a[href*="mode=practice"][href*="leaderboard"]'),
    ).toBeNull();
  });

  it("keeps the fifth round correction visible before showing the total", async () => {
    const data = fixture("rotate");
    const prior = Array.from({ length: 4 }, () => ({
      same: true,
      correctSame: true,
      score: 100,
    }));
    mock.begin.mockResolvedValue({ ...data, answers: prior });
    mock.brainStart.mockResolvedValue({
      round: data.challenge.rounds[4],
      startedAt: Date.now(),
      serverNow: Date.now(),
      hints: 0,
    });
    mock.brainAnswer.mockResolvedValue({
      ...data,
      completed: true,
      score: 500,
      answers: [...prior, { same: true, correctSame: true, score: 100 }],
    });
    await act(async () => root.render(<BrainGame game="rotate" />));
    await act(async () => button("Начать игру→").click());
    await act(async () => button("Начать раунд →").click());
    await act(async () =>
      box
        .querySelector<HTMLButtonElement>(".brain-binary-controls button")!
        .click(),
    );
    expect(box.querySelector(".brain-rotation-correction")).toBeTruthy();
    expect(box.querySelector('[data-testid="public-save"]')).toBeNull();
    await act(async () => button("Посмотреть итог →").click());
    expect(box.querySelector(".brain-total strong")?.textContent).toBe("500");
    expect(box.querySelector('[data-testid="public-save"]')).toBeTruthy();
  });

  it("reuses a failed hint request after reload without losing the route", async () => {
    const data = fixture("slide");
    const round = data.privateChallenge.rounds[0] as SlideRound;
    const hint = slideHint(round, []);
    mock.begin.mockResolvedValue(data);
    mock.resume.mockResolvedValue({
      ...data,
      challenge: {
        ...data.challenge,
        states: { 0: { startedAt: Date.now(), hints: 1 } },
      },
    });
    mock.brainStart.mockResolvedValue({
      round,
      startedAt: Date.now(),
      serverNow: Date.now(),
      hints: 0,
    });
    mock.brainHint
      .mockRejectedValueOnce(new Error("Ответ подсказки потерян"))
      .mockResolvedValueOnce({
        ...hint,
        hints: 1,
        startedAt: Date.now(),
        serverNow: Date.now(),
      });
    await act(async () => root.render(<BrainGame game="slide" />));
    await act(async () => button("Начать игру→").click());
    await act(async () => button("Начать раунд →").click());
    await act(async () => button("Подсказка −15").click());
    const requestId = mock.brainHint.mock.calls[0][2];
    expect(
      JSON.parse(localStorage.getItem("playne:brain-slide:active:v1")!)
        .hintRequest.id,
    ).toBe(requestId);
    act(() => root.unmount());
    root = createRoot(box);
    await act(async () => root.render(<BrainGame game="slide" />));
    await act(async () => button("Начать игру→").click());
    await act(async () => button("Подсказка −15").click());
    expect(mock.brainHint.mock.calls[1]).toEqual([0, [], requestId]);
    const persisted = JSON.parse(
      localStorage.getItem("playne:brain-slide:active:v1")!,
    );
    expect(persisted.moves).toEqual([hint.move]);
    expect(persisted.hintRequest).toBeUndefined();
  });
});
