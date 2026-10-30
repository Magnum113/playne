import { RulesDialog } from "./RulesDialog";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, SaveResult, useGuestTrial, useRankedRun } from "./account";
import type { ServerRun } from "./rankedQueue";
import { GameHeader } from "./SiteHeader";
import { GameIntro, GameStartAction } from "./GameIntro";
import { ModeChoice, RoundDots, StatusMessage } from "./ui";
import FooterLinks from "./FooterLinks";
import BrainPreview from "./BrainPreview";
import PlayNextStep from "./PlayNextStep";
import {
  DispatchBoard,
  FlashBoard,
  RotateBoard,
  SlideBoard,
} from "./BrainBoards";
import {
  brainMoscowDate,
  dispatchSnapshot,
  replaySlideMoves,
  rotationAlignment,
  validDispatchActions,
  type BrainDifficulty,
  type DispatchAction,
  type PublicBrainRound,
  type SlideMove,
} from "./brain";
import {
  brainDailyText,
  brainDifficultyOptions,
  brainGameContent,
  brainPracticeText,
  type BrainGameId,
  type BrainMode,
} from "./brainContent";
import { BRAIN_GOALS, reachGoal } from "./analytics";
import "./brain-game.css";
import BrainInsight from "./BrainInsight";
import ShareResult from "./ShareResult";
import ChallengeContext, {
  readChallengeToken,
  challengeQuery,
} from "./ChallengeContext";
import { PlayneEmailOffer } from "./EmailPreferences";

const useGameLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Phase =
  | "welcome"
  | "ready"
  | "playing"
  | "checking"
  | "round-result"
  | "finished";
type Answer =
  | { cells: number[] }
  | { same: boolean }
  | { moves: SlideMove[] }
  | { actions: DispatchAction[] };
type Saved = {
  id: string;
  day: string;
  mode: BrainMode;
  difficulty: BrainDifficulty;
  index: number;
  cells: number[];
  moves: SlideMove[];
  actions: DispatchAction[];
  flashSeen: boolean;
  completed: boolean;
  pending?: Answer;
  hintRequest?: { id: string; moves: SlideMove[] };
};
type Timing = {
  startedAt: number;
  offset: number;
  revealUntil?: number;
  hints: number;
};
const keyFor = (game: BrainGameId) => `playne:brain-${game}:active:v1`;
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function readSaved(game: BrainGameId): Saved | null {
  try {
    const data = JSON.parse(localStorage.getItem(keyFor(game)) ?? "null");
    return data &&
      isUuid(data.id) &&
      ["classic", "practice"].includes(data.mode) &&
      [1, 2, 3].includes(data.difficulty) &&
      Number.isInteger(data.index) &&
      data.index >= 0 &&
      data.index < 5 &&
      Array.isArray(data.cells) &&
      Array.isArray(data.moves) &&
      Array.isArray(data.actions)
      ? data
      : null;
  } catch {
    return null;
  }
}
function writeSaved(game: BrainGameId, saved: Saved) {
  try {
    localStorage.setItem(keyFor(game), JSON.stringify(saved));
  } catch {
    /* The server keeps the run even when local storage is unavailable. */
  }
}
const seconds = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))} с`;
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось связаться с сервером. Попробуй ещё раз.";
const modeOptions = [
  {
    value: "classic" as const,
    label: "Задача дня",
    description: "Общие 5 раундов · первая попытка",
  },
  {
    value: "practice" as const,
    label: "Практика",
    description: "Выбор сложности · личная история",
  },
];

export default function BrainGame({ game }: { game: BrainGameId }) {
  const content = brainGameContent(game);
  const ranked = useRankedRun(game);
  const [challengeToken] = useState(readChallengeToken);
  const access = useGuestTrial(game);
  const [mode, setMode] = useState<BrainMode>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "practice"
      ? "practice"
      : "classic",
  );
  const [difficulty, setDifficulty] = useState<BrainDifficulty>(() => {
    if (typeof window === "undefined") return 1;
    const value = Number(
      new URLSearchParams(window.location.search).get("level"),
    );
    return value === 2 || value === 3 ? value : 1;
  });
  const [phase, setPhase] = useState<Phase>("welcome");
  const [run, setRun] = useState<ServerRun | null>(null);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState<PublicBrainRound | null>(null);
  const [cells, setCells] = useState<number[]>([]);
  const [moves, setMoves] = useState<SlideMove[]>([]);
  const [actions, setActions] = useState<DispatchAction[]>([]);
  const [pending, setPending] = useState<Answer | undefined>();
  const [flashSeen, setFlashSeen] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [now, setNow] = useState(Date.now());
  const [today, setToday] = useState(() => brainMoscowDate());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [visibilityWarning, setVisibilityWarning] = useState(false);
  const [saved] = useState(() => readSaved(game));
  const rules = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const stage = useRef<HTMLElement>(null);
  const summary = useRef<HTMLElement>(null);
  const sending = useRef(false);
  const hintRequest = useRef<{ id: string; moves: SlideMove[] } | null>(null);
  const resultRequest = useRef<{
    id: string;
    game: BrainGameId;
    promise: Promise<ServerRun | null>;
  } | null>(null);
  const resultToResume = useRef<string | null>(null);
  const startsTracked = useRef(new Set<string>());
  const beginning = useRef(false);
  const elapsed = timing
    ? Math.max(0, now + timing.offset - timing.startedAt)
    : 0;
  const answers = run?.answers ?? [];
  const currentAnswer = answers[index];
  const slideState =
    round?.kind === "slide" ? replaySlideMoves(round, moves) : null;

  useEffect(() => {
    const checkDate = () => setToday(brainMoscowDate());
    const visible = () => {
      if (!document.hidden) checkDate();
    };
    checkDate();
    const timer = window.setInterval(checkDate, 30_000);
    window.addEventListener("focus", checkDate);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkDate);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  function hideFlash() {
    setShowFlash(false);
    setRound((current) =>
      current?.kind === "flash" ? { ...current, cells: undefined } : current,
    );
  }
  useEffect(() => {
    if (
      game === "flash" &&
      showFlash &&
      timing?.revealUntil !== undefined &&
      now + timing.offset >= timing.revealUntil
    )
      hideFlash();
  }, [game, showFlash, timing, now]);
  useEffect(() => {
    if (phase !== "playing") return;
    const visibility = () => {
      if (!document.hidden) return;
      if (game === "flash") {
        hideFlash();
        setMessage(
          "Показ скрыт при смене вкладки. Выбери клетки, которые запомнил.",
        );
      }
      if (game === "dispatch") setVisibilityWarning(true);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [phase, game]);

  useEffect(() => {
    if (!run || phase === "welcome") return;
    writeSaved(game, {
      id: run.id,
      mode: run.mode === "practice" ? "practice" : "classic",
      day: run.challenge.day,
      difficulty: run.challenge.difficulty ?? 1,
      index,
      cells,
      moves,
      actions,
      flashSeen,
      completed: !!run.completed,
      pending,
      hintRequest: hintRequest.current ?? undefined,
    });
  }, [game, run, phase, index, cells, moves, actions, flashSeen, pending]);
  useEffect(() => {
    const token = challengeToken ?? run?.challenge.comparisonToken;
    if (!run?.completed || !token) return;
    window.history.replaceState(
      null,
      "",
      challengeQuery(
        `${content.path}?result=${encodeURIComponent(run.id)}`,
        token,
      ),
    );
  }, [
    run?.completed,
    run?.id,
    challengeToken,
    run?.challenge.comparisonToken,
    content.path,
  ]);
  useGameLayoutEffect(() => {
    if (["ready", "playing", "round-result", "finished"].includes(phase)) {
      heading.current?.focus({ preventScroll: true });
      const target = phase === "finished" ? summary.current : stage.current;
      target?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [phase, index, run?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("result");
    if (!isUuid(id)) return;
    if (
      !resultRequest.current ||
      resultRequest.current.id !== id ||
      resultRequest.current.game !== game
    )
      resultRequest.current = { id, game, promise: ranked.resume(id) };
    let alive = true;
    setBusy(true);
    void resultRequest.current.promise
      .then((data) => {
        if (!alive || !data) return;
        setRun(data);
        setMode(data.mode === "practice" ? "practice" : "classic");
        setDifficulty(data.challenge.difficulty ?? 1);
        if (data.completed) {
          resultToResume.current = null;
          setPhase("finished");
        } else {
          resultToResume.current = data.id;
          const next = Math.min(data.answers?.length ?? 0, 4);
          const previous = readSaved(game);
          writeSaved(game, {
            id: data.id,
            day: data.challenge.day,
            mode: data.mode === "practice" ? "practice" : "classic",
            difficulty: data.challenge.difficulty ?? 1,
            index: next,
            cells: previous?.id === data.id ? previous.cells : [],
            moves: previous?.id === data.id ? previous.moves : [],
            actions: previous?.id === data.id ? previous.actions : [],
            flashSeen:
              (previous?.id === data.id && previous.flashSeen) || false,
            completed: false,
          });
          setMessage(
            "Эта партия ещё не завершена. Нажми «Продолжить партию», когда будешь готов.",
          );
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [game]);

  function prepareRound(
    next: number,
    data: ServerRun,
    restored?: Saved | null,
  ) {
    const metadata = data.challenge.rounds[next] as PublicBrainRound;
    setIndex(next);
    setRound(metadata);
    setTiming(null);
    setNow(Date.now());
    setPending(undefined);
    setCells(
      restored?.cells
        .filter(
          (cell) =>
            metadata.kind === "flash" &&
            Number.isInteger(cell) &&
            cell >= 0 &&
            cell < metadata.rows * metadata.cols,
        )
        .slice(0, metadata.kind === "flash" ? metadata.count : 0) ?? [],
    );
    setMoves(
      metadata.kind === "slide" &&
        restored &&
        replaySlideMoves(metadata, restored.moves).valid
        ? restored.moves
        : [],
    );
    setActions(
      metadata.kind === "dispatch" &&
        restored &&
        validDispatchActions(metadata, restored.actions)
        ? restored.actions
        : [],
    );
    setFlashSeen(!!restored?.flashSeen);
    setShowFlash(false);
    setMessage("");
    setError("");
    setVisibilityWarning(false);
    hintRequest.current =
      restored?.hintRequest &&
      isUuid(restored.hintRequest.id) &&
      Array.isArray(restored.hintRequest.moves)
        ? restored.hintRequest
        : null;
    setPhase("ready");
  }

  async function startRound(next = index, data = run, restored?: Saved | null) {
    if (!data || sending.current) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await ranked.brainStart(next);
      if (response.round?.kind !== game)
        throw new Error("Получено задание другой игры. Обнови страницу.");
      const publicRound = response.round as PublicBrainRound;
      const stamp: Timing = {
        startedAt: response.startedAt,
        offset: response.serverNow - Date.now(),
        hints: response.hints ?? 0,
        revealUntil: response.revealUntil,
      };
      setRound(publicRound);
      setTiming(stamp);
      setNow(Date.now());
      const previouslySeen = restored?.flashSeen ?? flashSeen;
      if (publicRound.kind === "flash") {
        const canShow =
          !previouslySeen &&
          !!publicRound.cells?.length &&
          response.serverNow < (response.revealUntil ?? 0) &&
          !document.hidden;
        setShowFlash(canShow);
        setFlashSeen(true);
        if (!canShow) setRound({ ...publicRound, cells: undefined });
        // Persist the one-time exposure immediately, before any rendering effects.
        const previous = readSaved(game);
        writeSaved(game, {
          id: data.id,
          day: data.challenge.day,
          mode: data.mode === "practice" ? "practice" : "classic",
          difficulty: data.challenge.difficulty ?? 1,
          index: next,
          cells: restored?.cells ?? cells,
          moves: [],
          actions: [],
          flashSeen: true,
          completed: false,
          pending: previous?.id === data.id ? previous.pending : undefined,
        });
      }
      setPhase("playing");
      if (!startsTracked.current.has(data.id)) {
        startsTracked.current.add(data.id);
        reachGoal(BRAIN_GOALS.gameStart, {
          game,
          mode: data.mode ?? mode,
          difficulty: data.challenge.difficulty ?? 1,
          resumed: !!data.challenge.states?.[next]?.startedAt,
        });
      }
      if (restored?.pending) {
        setPending(restored.pending);
        setPhase("checking");
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function begin(chosen = mode, selectedDifficulty = difficulty) {
    if (busy || sending.current || beginning.current) return;
    beginning.current = true;
    setBusy(true);
    setError("");
    const previous = readSaved(game);
    const restoreId =
      resultToResume.current ??
      (challengeToken
        ? undefined
        : access.resume
          ? access.trial?.id
          : previous &&
              !previous.completed &&
              previous.mode === chosen &&
              (chosen === "classic"
                ? previous.day === brainMoscowDate()
                : previous.difficulty === selectedDifficulty)
            ? previous.id
            : undefined);
    try {
      let data: ServerRun | null;
      try {
        data = restoreId
          ? await ranked.resume(restoreId)
          : await ranked.begin(chosen, selectedDifficulty, challengeToken);
      } catch (e) {
        if (!(e instanceof ApiError) || ![403, 404, 410].includes(e.status))
          throw e;
        try {
          localStorage.removeItem(keyFor(game));
        } catch {
          /* Retry still works. */
        }
        data = await ranked.begin(chosen, selectedDifficulty, challengeToken);
      }
      if (!data) return;
      resultToResume.current = null;
      if (
        !Array.isArray(data.challenge?.rounds) ||
        data.challenge.rounds.length !== 5 ||
        data.challenge.rounds.some((r: PublicBrainRound) => r.kind !== game)
      )
        throw new Error("Задания не загрузились. Попробуй ещё раз.");
      setRun(data);
      setMode(data.mode === "practice" ? "practice" : "classic");
      setDifficulty(data.challenge.difficulty ?? 1);
      if (chosen === "classic" && phase === "finished")
        window.history.replaceState(
          null,
          "",
          challengeQuery(
            data.completed ? `${content.path}?result=${data.id}` : content.path,
            challengeToken,
          ),
        );
      if (data.completed) {
        setPhase("finished");
        return;
      }
      const next = Math.min(data.answers?.length ?? 0, 4);
      const restored =
        previous?.id === data.id && previous.index === next ? previous : null;
      prepareRound(next, data, restored);
      if (data.challenge.states?.[next]?.startedAt)
        await startRound(next, data, restored);
    } catch (e) {
      setError(errorText(e));
    } finally {
      beginning.current = false;
      setBusy(false);
    }
  }

  async function confirm(answer: Answer) {
    if (sending.current) return;
    sending.current = true;
    setPending(answer);
    setPhase("checking");
    setBusy(true);
    setError("");
    hideFlash();
    try {
      const data = await ranked.brainAnswer(index, answer);
      if (!data?.answers?.[index])
        throw new Error("Сервер ещё не подтвердил ответ. Повтори отправку.");
      setRun(data);
      setPending(undefined);
      reachGoal(BRAIN_GOALS.roundComplete, {
        game,
        mode: data.mode ?? mode,
        difficulty: data.challenge.difficulty ?? 1,
        round: index + 1,
        score: data.answers[index].score,
      });
      if (data.completed)
        reachGoal(BRAIN_GOALS.gameComplete, {
          game,
          mode: data.mode ?? mode,
          difficulty: data.challenge.difficulty ?? 1,
          score: data.score ?? 0,
        });
      setPhase("round-result");
    } catch (e) {
      setError(errorText(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function hint() {
    if (busy || round?.kind !== "slide") return;
    setBusy(true);
    setError("");
    const request = hintRequest.current ?? {
      id: crypto.randomUUID(),
      moves: [...moves],
    };
    hintRequest.current = request;
    const previous = readSaved(game);
    if (previous && run && previous.id === run.id)
      writeSaved(game, { ...previous, hintRequest: request });
    try {
      const response = await ranked.brainHint(index, request.moves, request.id);
      hintRequest.current = null;
      setTiming({
        startedAt: response.startedAt,
        offset: response.serverNow - Date.now(),
        hints: response.hints,
      });
      const next = response.move
        ? [...request.moves, response.move]
        : request.moves;
      if (!replaySlideMoves(round, next).valid)
        throw new Error(
          "Подсказка не совпала с полем. Обнови страницу, чтобы продолжить партию.",
        );
      setMoves(next);
      reachGoal(BRAIN_GOALS.hintUsed, {
        game,
        mode,
        difficulty,
        round: index + 1,
        hints: response.hints,
      });
      setMessage(
        response.move
          ? `Подсказка: машина ${response.move.carId} сдвинута на ${Math.abs(response.move.delta)}. −15 очков. Отсюда до выхода: ${Math.max(0, response.remainingMoves - 1)} ходов.`
          : "Красная машина уже у выхода. Можно записать решение.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function chooseMode(next: BrainMode) {
    setMode(next);
    setError("");
    window.history.replaceState(
      null,
      "",
      `${content.path}${next === "practice" ? `?mode=practice&level=${difficulty}` : ""}`,
    );
  }

  function board(result = false) {
    if (!round) return null;
    const disabled = busy || phase !== "playing" || result;
    if (round.kind === "flash")
      return (
        <FlashBoard
          key={`${run?.id}:${index}`}
          round={round}
          phase={result ? "result" : showFlash ? "show" : "answer"}
          selected={cells}
          onChange={setCells}
          disabled={disabled || showFlash}
          correctCells={
            currentAnswer?.correctCells ??
            currentAnswer?.expectedCells ??
            currentAnswer?.result?.cells ??
            []
          }
        />
      );
    if (round.kind === "rotate")
      return (
        <RotateBoard
          key={`${run?.id}:${index}`}
          round={round}
          disabled={disabled}
          result={result}
          onAnswer={(same) => void confirm({ same })}
        />
      );
    if (round.kind === "slide")
      return (
        <SlideBoard
          key={`${run?.id}:${index}`}
          round={round}
          moves={moves}
          onChange={(next) => {
            setMoves(next);
            setMessage("");
            hintRequest.current = null;
          }}
          disabled={disabled}
          onMessage={setMessage}
        />
      );
    return (
      <DispatchBoard
        key={`${run?.id}:${index}`}
        round={round}
        actions={actions}
        onChange={setActions}
        startedAt={timing?.startedAt ?? Date.now()}
        serverOffset={timing?.offset ?? 0}
        disabled={disabled}
        finished={result}
      />
    );
  }

  const correctFlash =
    currentAnswer?.correctCells ?? currentAnswer?.expectedCells ?? [];
  const rotateSame =
    round?.kind === "rotate"
      ? !rotationAlignment(round.shapeA, round.shapeB)?.mirrored
      : false;
  const dailyResult = run?.mode !== "practice";
  const newDailyAvailable = dailyResult && !!run && run.challenge.day !== today;
  const saveActionHasPriority =
    dailyResult && (!access.user || ranked.state.status === "save-error");
  const flashCanAnswer =
    !timing?.revealUntil || now + timing.offset >= timing.revealUntil;
  function roundMetric(answer: any, roundIndex: number): string {
    if (game === "slide")
      return `${Array.isArray(answer.moves) ? answer.moves.length : (answer.moveCount ?? 0)} ходов · ${answer.hints ?? 0} подсказок`;
    if (game === "dispatch")
      return `${answer.correct ?? 0} / ${answer.total ?? run?.challenge.rounds[roundIndex]?.trains?.length ?? 0} поездов`;
    if (game === "flash")
      return `${(answer.cells ?? []).filter((cell: number) => answer.correctCells?.includes(cell)).length} / ${run?.challenge.rounds[roundIndex]?.count ?? 0} клеток`;
    return answer.score === 100 ? "Верно" : "Не совпало";
  }
  return (
    <div className={`app brain-app brain-app-${game}`}>
      <a className="skip-link" href="#brain-main">
        К игре
      </a>
      <GameHeader />
      <main
        id="brain-main"
        className={`brain-main${phase === "welcome" ? " game-start-main" : ""}`}
      >
        <nav className="brain-breadcrumb" aria-label="Игры для ума">
          <a href="/brain/">← Игры для ума</a>
        </nav>
        <GameIntro
          title={content.name}
          eyebrow={content.skill.toUpperCase()}
          description={content.description}
          onRules={() => {
            rules.current?.showModal();
            reachGoal(BRAIN_GOALS.rulesOpen, { game, mode, difficulty });
          }}
        />
        {phase === "welcome" && (
          <ChallengeContext game={game} token={challengeToken} />
        )}
        {phase === "welcome" ? (
          <section className="brain-welcome game-welcome">
            <div className="game-welcome-copy">
              <p className="eyebrow">ПЯТЬ РАУНДОВ · ДО 500 ОЧКОВ</p>
              <h2>{content.heroTitle}</h2>
              <p>{content.heroText}</p>
              {!challengeToken && (
                <ModeChoice
                  value={mode}
                  onChange={chooseMode}
                  options={modeOptions}
                  className="brain-mode-choice"
                  disabled={busy}
                />
              )}
              {!challengeToken && mode === "practice" && (
                <ModeChoice
                  value={String(difficulty)}
                  onChange={(value) => {
                    setDifficulty(Number(value) as BrainDifficulty);
                    window.history.replaceState(
                      null,
                      "",
                      `${content.path}?mode=practice&level=${value}`,
                    );
                    reachGoal(BRAIN_GOALS.practiceLevel, {
                      game,
                      mode,
                      difficulty: Number(value),
                    });
                  }}
                  options={brainDifficultyOptions}
                  legend="Сложность практики"
                  className="brain-difficulty-choice"
                  disabled={busy}
                />
              )}
              {!challengeToken && (
                <p className="brain-mode-note">
                  {mode === "classic" ? brainDailyText : brainPracticeText}
                </p>
              )}
              {message && <p role="status">{message}</p>}
              <GameStartAction
                game={game}
                onStart={() => void begin()}
                loading={busy}
                loadingLabel="Готовим задания…"
                error={
                  error ||
                  (ranked.state.status === "error"
                    ? ranked.state.message
                    : undefined)
                }
                caption={
                  saved && !saved.completed
                    ? "Сохранённую партию можно продолжить."
                    : "Первый раунд начнётся, когда нажмёшь его кнопку."
                }
              />
              <a
                className="game-start-ranking"
                href={`/leaderboard/?game=${game}&mode=classic`}
              >
                Рейтинг задачи дня →
              </a>
            </div>
            <div className="game-welcome-art brain-welcome-art">
              <BrainPreview game={game} />
              <span>{content.tagline}</span>
            </div>
          </section>
        ) : phase === "finished" ? (
          <section className="brain-summary" ref={summary}>
            <p className="eyebrow">
              {dailyResult
                ? `ЗАДАЧА ДНЯ · ${run?.challenge.day}`
                : `ПРАКТИКА · ${brainDifficultyOptions[(run?.challenge.difficulty ?? 1) - 1]?.label}`}
            </p>
            <h2 ref={heading} tabIndex={-1}>
              Пять раундов позади.
            </h2>
            <p className="brain-total">
              <strong>
                {run?.score ??
                  answers.reduce((sum, a) => sum + (a.score ?? 0), 0)}
              </strong>
              <span>/ 500 очков</span>
            </p>
            <ol className="brain-result-list">
              {answers.map((answer, i) => (
                <li key={i}>
                  <span>Раунд {i + 1}</span>
                  <span>{roundMetric(answer, i)}</span>
                  <strong>{answer.score} / 100</strong>
                </li>
              ))}
            </ol>
            <BrainInsight game={game} runId={run?.id} />
            <ChallengeContext
              game={game}
              token={challengeToken ?? run?.challenge.comparisonToken}
              runId={run?.id}
              completed
              runDay={run?.challenge.day}
              runMode={run?.mode}
              comparisonToken={run?.challenge.comparisonToken}
              score={run?.score}
            />
            {dailyResult ? (
              <SaveResult run={ranked} game={game} />
            ) : (
              <>
                <StatusMessage tone="success" title="Практика сохранена">
                  {access.user
                    ? "В личной истории, без влияния на рейтинг."
                    : "Войди, чтобы сохранить её в аккаунте."}
                </StatusMessage>
                <PlayneEmailOffer />
              </>
            )}
            <PlayNextStep
              game={game}
              runId={run?.id}
              hideAction={
                (newDailyAvailable && !!access.user) || saveActionHasPriority
              }
            />
            <div className="brain-summary-actions">
              <ShareResult runId={run?.id} />
              {newDailyAvailable && access.user && (
                <button
                  className={
                    saveActionHasPriority ? "secondary-button" : "primary"
                  }
                  disabled={busy}
                  onClick={() => void begin("classic", 1)}
                >
                  {busy ? "Готовим задания…" : "Начать задачу дня"}
                </button>
              )}
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setMode("practice");
                  setPhase("welcome");
                  setError("");
                  setMessage("");
                  reachGoal(BRAIN_GOALS.gameRestart, {
                    game,
                    mode: "practice",
                    difficulty,
                  });
                }}
              >
                Ещё в практике →
              </button>
              <a
                href={
                  dailyResult
                    ? `/leaderboard/?game=${game}&mode=classic`
                    : `/account/${access.user || !run ? "" : `?claim=${run.id}`}`
                }
              >
                {dailyResult ? "Рейтинг задачи дня" : "Личная история"}
              </a>
              <a href="/brain/">Выбрать другую игру →</a>
            </div>
            {newDailyAvailable &&
              (error || ranked.state.status === "error") && (
                <p className="brain-error" role="alert">
                  {error ||
                    (ranked.state.status === "error"
                      ? ranked.state.message
                      : "")}
                </p>
              )}
          </section>
        ) : (
          <section
            className="brain-stage"
            ref={stage}
            aria-label={`Игра ${content.name}`}
          >
            <div className="brain-stage-top">
              <span>
                {mode === "classic"
                  ? `Задача дня · ${run?.challenge.day}`
                  : `Практика · ${brainDifficultyOptions[difficulty - 1].label}`}
              </span>
              <span>Раунд {index + 1} / 5</span>
            </div>
            <RoundDots current={index} completed={answers.length} />
            {phase === "ready" ? (
              <div className="brain-ready">
                <BrainPreview game={game} />
                <h2 ref={heading} tabIndex={-1}>
                  {game === "dispatch"
                    ? "Готов к новой волне?"
                    : game === "flash"
                      ? "Готов запомнить узор?"
                      : `Раунд ${index + 1}. Начнём?`}
                </h2>
                <p>
                  {game === "flash" && round?.kind === "flash"
                    ? `Клеток для запоминания: ${round.count}. Показ — ${(round.showMs / 1000).toLocaleString("ru-RU")} с. Затем выбери их на пустом поле.`
                    : game === "dispatch" && round?.kind === "dispatch"
                      ? `Поездов: ${round.trains.length}. Время: ${seconds(round.durationMs)}. Время продолжится, даже если свернуть вкладку.`
                      : game === "slide"
                        ? "Сдвигай машины вдоль их оси и доведи красную R до выхода справа. Подтверди, когда будешь доволен числом ходов."
                        : "Совпадут ли две фигуры после поворота? Или для этого нужно отражение?"}
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void startRound()}
                >
                  {busy
                    ? "Подключаем раунд…"
                    : game === "dispatch"
                      ? "Начать волну →"
                      : "Начать раунд →"}
                </button>
              </div>
            ) : phase === "round-result" ? (
              <div className="brain-round-result">
                <p className="eyebrow">ОТВЕТ ЗАПИСАН</p>
                <h2 ref={heading} tabIndex={-1}>
                  {currentAnswer?.score === 100
                    ? "Точно получилось."
                    : game === "slide"
                      ? "Дорога свободна."
                      : "Посмотрим, что совпало."}
                </h2>
                <p className="brain-round-score">
                  <strong>{currentAnswer?.score ?? 0}</strong> / 100 очков
                </p>
                {board(true)}
                <p>
                  {game === "flash"
                    ? `Совпало ${cells.filter((c) => correctFlash.includes(c)).length} из ${round?.kind === "flash" ? round.count : 0} клеток.`
                    : game === "rotate"
                      ? `Правильный ответ: «${rotateSame ? "Та же фигура" : "Зеркальная"}».`
                      : game === "slide"
                        ? `${moves.length} ходов, подсказок: ${currentAnswer?.hints ?? timing?.hints ?? 0}.`
                        : "Каждый поезд выбирает путь в момент проезда стрелки."}
                </p>
                {round?.kind === "dispatch" && (
                  <ol className="brain-train-results">
                    {dispatchSnapshot(
                      round,
                      actions,
                      round.durationMs,
                    ).trains.map((train, i) => (
                      <li key={train.id}>
                        {train.correct ? "✓" : "×"} Поезд {i + 1}: нужно{" "}
                        {"ABC"[train.destination]}, прибыл к{" "}
                        {"ABC"[train.station ?? 0]}
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  className="primary"
                  onClick={() =>
                    run?.completed
                      ? setPhase("finished")
                      : run && prepareRound(index + 1, run)
                  }
                >
                  {run?.completed ? "Посмотреть итог →" : "Следующий раунд →"}
                </button>
              </div>
            ) : (
              <>
                <div className="brain-play-heading">
                  <h2 ref={heading} tabIndex={-1}>
                    {phase === "checking"
                      ? "Проверяем ответ…"
                      : round?.kind === "flash"
                        ? showFlash
                          ? "Запомни узор."
                          : "Восстанови узор."
                        : round?.kind === "rotate"
                          ? "Поворот или отражение?"
                          : round?.kind === "slide"
                            ? slideState?.solved
                              ? "Красная машина у выхода."
                              : "Освободи дорогу вправо."
                            : elapsed >=
                                (round?.kind === "dispatch"
                                  ? round.durationMs
                                  : Infinity)
                              ? "Волна завершена."
                              : "Следи за стрелками."}
                  </h2>
                  <p>
                    {round?.kind === "flash"
                      ? showFlash
                        ? `До исчезновения: ${seconds((timing?.revealUntil ?? 0) - (now + (timing?.offset ?? 0)))}`
                        : `Выбрано ${cells.length} / ${round.count}`
                      : round?.kind === "slide"
                        ? `Ходов: ${moves.length} · Подсказок: ${timing?.hints ?? 0} · Время не влияет на счёт`
                        : round?.kind === "dispatch"
                          ? `До конца волны: ${seconds(round.durationMs - elapsed)}`
                          : "Можно вращать в уме. Отражение — другой ответ."}
                  </p>
                </div>
                {board()}
                <p className="brain-live-message" role="status">
                  {message}
                </p>
                {visibilityWarning && (
                  <p className="brain-visibility-warning" role="status">
                    Пока вкладка была скрыта, поезда продолжали движение. Время
                    волны не останавливается.
                  </p>
                )}
                {phase === "checking" ? (
                  <button
                    className="primary brain-confirm"
                    disabled={busy || !pending}
                    onClick={() => pending && void confirm(pending)}
                  >
                    {busy ? "Сохраняем ответ…" : "Повторить отправку"}
                  </button>
                ) : (
                  <>
                    {round?.kind === "flash" &&
                      !showFlash &&
                      (flashCanAnswer ? (
                        <button
                          className="primary brain-confirm"
                          disabled={busy}
                          onClick={() =>
                            cells.length === round.count
                              ? void confirm({ cells })
                              : setMessage(
                                  `Нужно выбрать ровно ${round.count} клеток. Сейчас отмечено ${cells.length}.`,
                                )
                          }
                        >
                          Проверить →
                        </button>
                      ) : (
                        <p className="brain-board-note">
                          Показ скрыт. Проверить ответ можно через{" "}
                          {seconds(
                            (timing?.revealUntil ?? 0) -
                              now -
                              (timing?.offset ?? 0),
                          )}
                          .
                        </p>
                      ))}
                    {round?.kind === "slide" && (
                      <>
                        <div className="brain-slide-actions">
                          <button
                            className="secondary-button"
                            disabled={busy || !moves.length}
                            onClick={() => {
                              setMoves((m) => m.slice(0, -1));
                              setMessage("");
                              hintRequest.current = null;
                            }}
                          >
                            Отменить
                          </button>
                          <button
                            className="secondary-button"
                            disabled={busy || !moves.length}
                            onClick={() => {
                              setMoves([]);
                              setMessage(
                                "Машины возвращены. Подсказки остаются в счёте.",
                              );
                              hintRequest.current = null;
                            }}
                          >
                            Сбросить
                          </button>
                          <button
                            className="secondary-button"
                            disabled={busy || !!slideState?.solved}
                            onClick={() => void hint()}
                          >
                            Подсказка −15
                          </button>
                        </div>
                        <button
                          className="primary brain-confirm"
                          disabled={busy}
                          onClick={() =>
                            slideState?.solved
                              ? void confirm({ moves })
                              : setMessage(
                                  "Сначала доведи красную машину R до правого края третьего ряда.",
                                )
                          }
                        >
                          Записать решение →
                        </button>
                      </>
                    )}
                    {round?.kind === "dispatch" &&
                      elapsed >= round.durationMs && (
                        <button
                          className="primary brain-confirm"
                          disabled={busy}
                          onClick={() => void confirm({ actions })}
                        >
                          Проверить волну →
                        </button>
                      )}
                  </>
                )}
              </>
            )}
            {error && (
              <p className="brain-error" role="alert">
                {error}
              </p>
            )}
          </section>
        )}
        <section
          className="brain-about"
          id={`${game}-about`}
          aria-labelledby="brain-about-title"
        >
          <div className="brain-about-grid">
            <div>
              <p className="eyebrow">{content.skill.toUpperCase()}</p>
              <h2 id="brain-about-title">Правила игры «{content.name}»</h2>
              <ol>
                {content.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ol>
              <p>{content.scoreText}</p>
            </div>
            <div>
              <h3>Своя задача на каждый день</h3>
              <p>{brainDailyText}</p>
              <p>{brainPracticeText}</p>
              <p>
                Можно играть пальцем, мышью и клавиатурой. Первая партия — без
                входа, дальше бесплатно через Яндекс.
              </p>
              <a href="/brain/">Все игры для ума →</a>
              <p>
                <a href="/guides/brain/">Правила, сложность и очки →</a>
              </p>
            </div>
          </div>
          <section
            className="brain-faq"
            id={`${game}-faq`}
            aria-labelledby="brain-faq-title"
          >
            <h2 id="brain-faq-title">Вопросы об игре</h2>
            {content.faq.map(({ question, answer }) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </section>
        </section>
      </main>
      <FooterLinks />
      <RulesDialog
        dialogRef={rules}
        className="brain-rules-dialog"
        title={content.name}
        titleId="brain-dialog-title"
        eyebrow="ПРАВИЛА ИГРЫ"
      >
        <BrainPreview game={game} />
        <ol>
          {content.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p>{content.scoreText}</p>
        <p>{brainDailyText}</p>
        <p>{brainPracticeText}</p>
      </RulesDialog>
    </div>
  );
}
