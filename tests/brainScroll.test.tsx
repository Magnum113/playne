// @vitest-environment happy-dom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import BrainGame from "../src/BrainGame";
import {
  makeBrainChallenge,
  publicBrainRound,
  slideHint,
  type BrainDifficulty,
  type BrainGame as Game,
  type DispatchRound,
  type FlashRound,
  type RotateRound,
  type SlideRound,
} from "../src/brain";

const mock = vi.hoisted(() => ({
  begin: vi.fn(),
  resume: vi.fn(),
  brainStart: vi.fn(),
  brainAnswer: vi.fn(),
  brainHint: vi.fn(),
}));
vi.mock("../src/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/account")>()),
  useRankedRun: () => ({ ...mock, state: { status: "ready" } }),
  useGuestTrial: () => ({
    user: { id: "scroll-player", nickname: "Игрок" },
    ready: true,
    loading: false,
    blocked: false,
    resume: false,
    refresh: vi.fn(),
  }),
  AccountNav: () => <a href="/account/">Личный кабинет</a>,
  GuestSavedNotice: () => null,
  SaveResult: () => <p>Результат сохранён</p>,
}));

const runId = "a1234567-1234-4234-8234-123456789012";
function fixture(
  game: Game,
  mode = "practice",
  difficulty: BrainDifficulty = 3,
) {
  const privateChallenge = makeBrainChallenge(
    game,
    "scroll-fixture",
    difficulty,
    "2026-10-29",
  );
  return {
    id: runId,
    game,
    mode,
    answers: [] as any[],
    challenge: {
      ...privateChallenge,
      mode,
      rounds: privateChallenge.rounds.map((r) => publicBrainRound(r)),
      states: {} as Record<number, { startedAt: number; hints: number }>,
    },
    privateChallenge,
  };
}

let box: HTMLDivElement, root: Root;
let scroll: MockInstance<Element["scrollIntoView"]>;
let focus: MockInstance<HTMLElement["focus"]>;
const button = (text: string) =>
  [...box.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  )!;
async function click(text: string) {
  await act(async () => button(text).click());
}
function expectTarget(target: Element) {
  expect(scroll.mock.instances.at(-1)).toBe(target);
  expect(scroll).toHaveBeenLastCalledWith({
    block: "start",
    behavior: "instant",
  });
  const heading = target.querySelector("h2")!;
  expect(document.activeElement).toBe(heading);
  expect(focus.mock.instances.at(-1)).toBe(heading);
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
}
async function welcome(game: Game) {
  const data = fixture(game);
  window.history.replaceState(
    null,
    "",
    `/brain/${game}/?mode=practice&level=3`,
  );
  mock.begin.mockResolvedValue(data);
  mock.brainStart.mockImplementation((index: number) =>
    Promise.resolve({
      round: publicBrainRound(data.privateChallenge.rounds[index], true),
      startedAt: Date.now(),
      serverNow: Date.now(),
      hints: 0,
      revealUntil:
        game === "flash"
          ? Date.now() +
            (data.privateChallenge.rounds[index] as FlashRound).showMs
          : undefined,
    }),
  );
  await act(async () => root.render(<BrainGame game={game} />));
  expect(scroll).not.toHaveBeenCalled();
  return data;
}
async function playing(game: Game) {
  const data = await welcome(game);
  await click("Начать игру→");
  await click(game === "dispatch" ? "Начать волну →" : "Начать раунд →");
  return data;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/brain/");
  scroll = vi
    .spyOn(Element.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  focus = vi.spyOn(HTMLElement.prototype, "focus");
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

describe("brain round scroll and focus", () => {
  it.each(["flash", "rotate", "slide", "dispatch"] as const)(
    "positions the stable %s stage when ready and when play begins",
    async (game) => {
      await welcome(game);
      await click("Начать игру→");
      const stage = box.querySelector(".brain-stage")!;
      expect(box.querySelector(".brain-ready")).toBeTruthy();
      expect(scroll).toHaveBeenCalledTimes(1);
      expectTarget(stage);
      await click(game === "dispatch" ? "Начать волну →" : "Начать раунд →");
      expect(box.querySelector(".brain-ready")).toBeNull();
      expect(box.querySelector(".brain-stage")).toBe(stage);
      expect(scroll).toHaveBeenCalledTimes(2);
      expectTarget(stage);
    },
  );

  it("returns to the stage through two real rotate rounds without scrolling during answer submission", async () => {
    const data = await playing("rotate");
    const stage = box.querySelector(".brain-stage")!;
    let resolveAnswer!: (data: any) => void;
    mock.brainAnswer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAnswer = resolve;
        }),
    );
    await act(async () =>
      box
        .querySelector<HTMLButtonElement>(".brain-binary-controls button")!
        .click(),
    );
    expect(box.textContent).toContain("Проверяем ответ");
    expect(scroll).toHaveBeenCalledTimes(2);
    const correctFirst = (data.privateChallenge.rounds[0] as RotateRound)
      .correctSame;
    const first = {
      same: true,
      correctSame: correctFirst,
      score: correctFirst ? 100 : 0,
    };
    await act(async () => resolveAnswer({ ...data, answers: [first] }));
    expect(scroll).toHaveBeenCalledTimes(3);
    expectTarget(stage);
    await click("Следующий раунд →");
    expect(box.textContent).toContain("Раунд 2. Начнём?");
    expect(scroll).toHaveBeenCalledTimes(4);
    expectTarget(stage);
    expect(mock.brainStart).toHaveBeenCalledTimes(1);
    await click("Начать раунд →");
    expect(scroll).toHaveBeenCalledTimes(5);
    expectTarget(stage);
    mock.brainAnswer.mockResolvedValueOnce({
      ...data,
      answers: [
        first,
        {
          same: false,
          correctSame: (data.privateChallenge.rounds[1] as RotateRound)
            .correctSame,
          score: (data.privateChallenge.rounds[1] as RotateRound).correctSame
            ? 0
            : 100,
        },
      ],
    });
    await act(async () =>
      box
        .querySelector<HTMLButtonElement>(
          ".brain-binary-controls button:last-child",
        )!
        .click(),
    );
    expect(scroll).toHaveBeenCalledTimes(6);
    expectTarget(stage);
    expect(box.querySelector(".brain-stage")).toBe(stage);
  });

  it("does not pull the viewport back when flash cells disappear or are selected", async () => {
    const data = await playing("flash");
    const before = scroll.mock.calls.length;
    await act(async () =>
      vi.advanceTimersByTime(
        (data.privateChallenge.rounds[0] as FlashRound).showMs + 200,
      ),
    );
    expect(box.querySelectorAll(".brain-flash-cell.is-target")).toHaveLength(0);
    await act(async () =>
      box.querySelector<HTMLButtonElement>(".brain-flash-cell")!.click(),
    );
    expect(
      box.querySelectorAll('.brain-flash-cell[aria-pressed="true"]'),
    ).toHaveLength(1);
    expect(scroll).toHaveBeenCalledTimes(before);
  });

  it("does not reposition slide while selecting, moving, undoing or receiving a hint", async () => {
    const data = await playing("slide");
    const round = data.privateChallenge.rounds[0] as SlideRound;
    const hint = slideHint(round, []),
      move = hint.move!;
    const before = scroll.mock.calls.length;
    const car = box.querySelector<HTMLButtonElement>(
      `[aria-label^="Машина ${move.carId}"]`,
    )!;
    const axis = round.cars.find((c) => c.id === move.carId)!.axis;
    const key =
      axis === "x"
        ? move.delta > 0
          ? "ArrowRight"
          : "ArrowLeft"
        : move.delta > 0
          ? "ArrowDown"
          : "ArrowUp";
    await act(async () => car.focus());
    for (let i = 0; i < Math.abs(move.delta); i++)
      await act(async () =>
        car.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
      );
    expect(box.textContent).toContain("Ходов: 1");
    await click("Отменить");
    expect(box.textContent).toContain("Ходов: 0");
    mock.brainHint.mockResolvedValue({
      ...hint,
      startedAt: Date.now(),
      serverNow: Date.now(),
      hints: 1,
    });
    await click("Подсказка −15");
    expect(box.textContent).toContain("Ходов: 1");
    expect(scroll).toHaveBeenCalledTimes(before);
  });

  it("does not reposition dispatch on switches, animation frames or wave completion", async () => {
    const data = await playing("dispatch");
    const round = data.privateChallenge.rounds[0] as DispatchRound;
    const before = scroll.mock.calls.length;
    await act(async () =>
      box
        .querySelector<HTMLButtonElement>(".brain-switches button:last-child")!
        .click(),
    );
    await act(async () => vi.advanceTimersByTime(round.durationMs + 200));
    expect(button("Проверить волну →")).toBeTruthy();
    expect(mock.brainAnswer).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledTimes(before);
  });

  it("positions a resumed in-progress round even when ready and playing updates are batched", async () => {
    const data = fixture("slide");
    data.challenge.states[0] = { startedAt: Date.now() - 1000, hints: 0 };
    window.history.replaceState(
      null,
      "",
      "/brain/slide/?mode=practice&level=3",
    );
    localStorage.setItem(
      "playne:brain-slide:active:v1",
      JSON.stringify({
        id: runId,
        day: data.challenge.day,
        mode: "practice",
        difficulty: 3,
        index: 0,
        cells: [],
        moves: [],
        actions: [],
        flashSeen: false,
        completed: false,
      }),
    );
    mock.resume.mockResolvedValue(data);
    mock.brainStart.mockResolvedValue({
      round: data.challenge.rounds[0],
      startedAt: Date.now() - 1000,
      serverNow: Date.now(),
      hints: 0,
    });
    await act(async () => root.render(<BrainGame game="slide" />));
    await click("Начать игру→");
    expect(mock.resume).toHaveBeenCalledWith(runId);
    expect(box.querySelector(".brain-ready")).toBeNull();
    const stage = box.querySelector(".brain-stage")!;
    expect(scroll.mock.instances.length).toBeGreaterThan(0);
    expect(scroll.mock.instances.every((target) => target === stage)).toBe(
      true,
    );
    expectTarget(stage);
  });

  it("positions the summary when opening a completed result without starting a round", async () => {
    const data = fixture("rotate");
    window.history.replaceState(null, "", `/brain/rotate/?result=${runId}`);
    mock.resume.mockResolvedValue({
      ...data,
      completed: true,
      score: 500,
      answers: Array.from({ length: 5 }, () => ({
        score: 100,
        same: true,
        correctSame: true,
      })),
    });
    await act(async () =>
      root.render(
        <StrictMode>
          <BrainGame game="rotate" />
        </StrictMode>,
      ),
    );
    expect(scroll).toHaveBeenCalledTimes(1);
    expectTarget(box.querySelector(".brain-summary")!);
    expect(mock.brainStart).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(31_000));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("positions a different result when the run changes but the finished phase stays the same", async () => {
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    const old = fixture("rotate", "classic", 1);
    const answers = Array.from({ length: 5 }, () => ({
      score: 100,
      same: true,
      correctSame: true,
    }));
    window.history.replaceState(null, "", `/brain/rotate/?result=${runId}`);
    mock.resume.mockResolvedValue({
      ...old,
      completed: true,
      score: 500,
      answers,
    });
    mock.begin.mockResolvedValue({
      ...old,
      id: "b1234567-1234-4234-8234-123456789012",
      challenge: { ...old.challenge, day: "2026-10-30" },
      completed: true,
      score: 400,
      answers: answers.map((answer, index) =>
        index === 4 ? { ...answer, score: 0, same: false } : answer,
      ),
    });
    await act(async () => root.render(<BrainGame game="rotate" />));
    expect(scroll).toHaveBeenCalledTimes(1);
    await click("Начать задачу дня");
    expect(scroll).toHaveBeenCalledTimes(2);
    expectTarget(box.querySelector(".brain-summary")!);
    expect(box.querySelector(".brain-total strong")?.textContent).toBe("400");
    expect(mock.brainStart).not.toHaveBeenCalled();
  });
});
