import { RulesDialog } from "./RulesDialog";
import { useEffect, useRef, useState } from "react";
import { GameHeader } from "./SiteHeader";
import { GameIntro, GameStartAction } from "./GameIntro";
import { ApiError, SaveResult, useGuestTrial, useRankedRun } from "./account";
import type { ServerRun } from "./rankedQueue";
import { ModeChoice, RoundDots } from "./ui";
import FooterLinks from "./FooterLinks";
import LineAbout from "./LineAbout";
import LineBoard from "./LineBoard";
import LinePreview from "./LinePreview";
import { linePathState, lineMoscowDate, type LinePuzzle } from "./line";
import {
  lineDailyText,
  linePracticeText,
  lineRules,
  lineScoreText,
} from "./lineContent";
import { LINE_GOALS, reachGoal } from "./analytics";
import "./line.css";
import ShareResult from "./ShareResult";
import ChallengeContext, {
  challengeQuery,
  readChallengeToken,
} from "./ChallengeContext";
import { PlayneEmailOffer } from "./EmailPreferences";

type Mode = "classic" | "practice";
type Phase =
  | "welcome"
  | "ready"
  | "playing"
  | "checking"
  | "round-result"
  | "finished";
type Saved = {
  id: string;
  mode: Mode;
  day: string;
  index: number;
  path: number[];
  completed: boolean;
};
const STORAGE = "playne:line-active:v1";
function readSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
    return s &&
      typeof s.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        s.id,
      ) &&
      ["classic", "practice"].includes(s.mode) &&
      Number.isInteger(s.index) &&
      s.index >= 0 &&
      s.index < 5 &&
      Array.isArray(s.path)
      ? s
      : null;
  } catch {
    return null;
  }
}
const clock = (ms: number) =>
  `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, "0")}`;
const modes = [
  {
    value: "classic" as const,
    label: "Задача дня",
    description: "5 полей дня · одна попытка",
  },
  {
    value: "practice" as const,
    label: "Практика",
    description: "Другие поля · отдельный рейтинг",
  },
];

export default function LineGame() {
  const ranked = useRankedRun("line");
  const [challengeToken] = useState(readChallengeToken);
  const access = useGuestTrial("line");
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "practice"
      ? "practice"
      : "classic",
  );
  const [phase, setPhase] = useState<Phase>("welcome");
  const [run, setRun] = useState<ServerRun | null>(null);
  const [index, setIndex] = useState(0);
  const [path, setPath] = useState<number[]>([]);
  const [timing, setTiming] = useState<{
    startedAt: number;
    offset: number;
    hints: number;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const rules = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hintRequest = useRef<{ id: string; path: number[] } | null>(null);
  const sending = useRef(false);
  const resultRequest = useRef<{
    id: string;
    promise: Promise<ServerRun | null>;
  } | null>(null);
  const resultToResume = useRef<string | null>(null);
  const puzzle: LinePuzzle | undefined = run?.challenge.puzzles[index];
  const answers = run?.answers ?? [];
  const elapsed = timing
    ? Math.max(0, now + timing.offset - timing.startedAt)
    : 0;
  const state = puzzle ? linePathState(puzzle, path) : null;
  const [saved] = useState(readSaved);
  useEffect(() => {
    if (phase !== "playing") return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [phase]);
  useEffect(() => {
    if (!run || phase === "welcome") return;
    const data: Saved = {
      id: run.id,
      mode: run.mode === "practice" ? "practice" : "classic",
      day: run.challenge.day,
      index,
      path,
      completed: !!run.completed,
    };
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data));
    } catch {
      /* Server still keeps the attempt. */
    }
  }, [run, index, path, phase]);
  useEffect(() => {
    const token = challengeToken ?? run?.challenge.comparisonToken;
    if (!run?.completed || !token) return;
    window.history.replaceState(
      null,
      "",
      challengeQuery(`/one-line/?result=${encodeURIComponent(run.id)}`, token),
    );
  }, [run?.completed, run?.id, challengeToken, run?.challenge.comparisonToken]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("result");
    if (
      !id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return;
    if (resultRequest.current?.id !== id)
      resultRequest.current = { id, promise: ranked.resume(id) };
    let alive = true;
    setBusy(true);
    void resultRequest.current.promise
      .then((data) => {
        if (!alive || !data) return;
        if (
          data.game !== "line" ||
          !Array.isArray(data.challenge?.puzzles) ||
          data.challenge.puzzles.length !== 5
        )
          throw new Error("Не удалось загрузить результат этой игры.");
        setRun(data);
        setMode(data.mode === "practice" ? "practice" : "classic");
        if (data.completed) {
          resultToResume.current = null;
          setTiming(null);
          setPhase("finished");
        } else {
          resultToResume.current = data.id;
          const previous = readSaved(),
            next = Math.min(data.answers?.length ?? 0, 4);
          const restored =
            previous?.id === data.id &&
            previous.index === next &&
            linePathState(data.challenge.puzzles[next], previous.path).valid
              ? previous.path
              : [];
          try {
            localStorage.setItem(
              STORAGE,
              JSON.stringify({
                id: data.id,
                mode: data.mode === "practice" ? "practice" : "classic",
                day: data.challenge.day,
                index: next,
                path: restored,
                completed: false,
              } satisfies Saved),
            );
          } catch {
            /* The server still keeps this party. */
          }
          setMessage(
            "Эта партия ещё не завершена. Продолжи её по кнопке, когда будешь готов.",
          );
        }
      })
      .catch((error) => {
        if (alive)
          setError(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить результат. Попробуй ещё раз.",
          );
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (["round-result", "finished", "ready"].includes(phase))
      heading.current?.focus({ preventScroll: true });
    if (phase === "playing") {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [phase]);

  function openRules() {
    rules.current?.showModal();
    reachGoal(LINE_GOALS.rulesOpen);
  }
  async function startRound(
    next: number,
    existingRun = run,
    restored: number[] = [],
  ) {
    if (!existingRun) return;
    setIndex(next);
    setPath(restored);
    setPhase("ready");
    setBusy(true);
    setError("");
    setMessage("");
    hintRequest.current = null;
    try {
      const t = await ranked.lineStart(next);
      setTiming({
        startedAt: t.startedAt,
        offset: t.serverNow - Date.now(),
        hints: t.hints,
      });
      setNow(Date.now());
      setPhase("playing");
      if (linePathState(existingRun.challenge.puzzles[next], restored).complete)
        await confirmPath(restored, next);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось начать поле. Попробуй ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function begin(chosen = mode) {
    setBusy(true);
    setError("");
    const previous = readSaved();
    // Guests have a single trial across modes; resume it rather than creating another.
    const restoreId =
      resultToResume.current ??
      (challengeToken
        ? undefined
        : access.resume
          ? access.trial?.id
          : previous &&
              !previous.completed &&
              previous.mode === chosen &&
              (chosen === "practice" || previous.day === lineMoscowDate())
            ? previous.id
            : undefined);
    let data: ServerRun | null;
    try {
      data = restoreId
        ? await ranked.resume(restoreId)
        : await ranked.begin(chosen, 1, challengeToken);
    } catch (e) {
      if (e instanceof ApiError && [403, 404, 410].includes(e.status)) {
        try {
          localStorage.removeItem(STORAGE);
        } catch {
          /* A new run can still begin. */
        }
        data = await ranked.begin(chosen, 1, challengeToken);
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Не удалось восстановить партию. Попробуй ещё раз.",
        );
        setBusy(false);
        return;
      }
    }
    if (!data) {
      setBusy(false);
      return;
    }
    resultToResume.current = null;
    if (
      !Array.isArray(data.challenge?.puzzles) ||
      data.challenge.puzzles.length !== 5
    ) {
      setError(
        "Не удалось загрузить поля. Обнови страницу и попробуй ещё раз.",
      );
      setBusy(false);
      return;
    }
    setRun(data);
    setMode(data.mode === "practice" ? "practice" : "classic");
    if (data.completed) {
      setPhase("finished");
      setBusy(false);
      return;
    }
    const next = Math.min(data.answers?.length ?? 0, 4);
    const restored =
      previous?.id === data.id &&
      previous.index === next &&
      linePathState(data.challenge.puzzles[next], previous.path).valid
        ? previous.path
        : [];
    reachGoal(LINE_GOALS.gameStart, {
      mode: data.mode ?? chosen,
      resumed: !!restoreId,
    });
    await startRound(next, data, restored);
  }
  async function confirmPath(answerPath: number[], round = index) {
    if (sending.current) return;
    sending.current = true;
    setPhase("checking");
    setBusy(true);
    setError("");
    try {
      const data = await ranked.lineAnswer(round, answerPath);
      if (!data || !data.answers?.[round])
        throw new Error("Не удалось подтвердить ответ. Повтори отправку.");
      setRun(data);
      const answer = data.answers[round];
      reachGoal(LINE_GOALS.roundComplete, {
        round: round + 1,
        score: answer.score,
        hints: answer.hints,
        mode: data.mode ?? mode,
      });
      if (data.completed) {
        reachGoal(LINE_GOALS.gameComplete, {
          score: data.score ?? 0,
          mode: data.mode ?? mode,
        });
        setPhase("finished");
      } else setPhase("round-result");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось отправить ответ. Путь сохранён, попробуй ещё раз.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function changePath(next: number[]) {
    setPath(next);
    setMessage("");
    if (puzzle && linePathState(puzzle, next).complete) void confirmPath(next);
  }
  async function hint() {
    if (busy) return;
    setBusy(true);
    setError("");
    const request = hintRequest.current ?? {
      id: crypto.randomUUID(),
      path: [...path],
    };
    hintRequest.current = request;
    try {
      const response = await ranked.lineHint(index, request.path, request.id);
      hintRequest.current = null;
      setTiming({
        startedAt: response.startedAt,
        offset: response.serverNow - Date.now(),
        hints: response.hints,
      });
      setMessage(
        "Подсказка показала следующий шаг. Если маршрут зашёл в тупик, лишние шаги убраны. −15 очков.",
      );
      setPath(response.path);
      reachGoal(LINE_GOALS.hintUsed, {
        round: index + 1,
        mode,
        hints: response.hints,
      });
      if (puzzle && linePathState(puzzle, response.path).complete)
        await confirmPath(response.path);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Подсказка не загрузилась. Попробуй ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }
  function chooseMode(next: Mode) {
    setMode(next);
    setError("");
    window.history.replaceState(
      null,
      "",
      `/one-line/${next === "practice" ? "?mode=practice" : ""}`,
    );
  }
  return (
    <div className="app line-app">
      <a className="skip-link" href="#line-main">
        К игре
      </a>
      <GameHeader />
      <main
        id="line-main"
        className={`line-main${phase === "welcome" ? " game-start-main" : ""}`}
      >
        <GameIntro
          title="Одной линией"
          eyebrow="ЛОГИКА · МАРШРУТ · ВНИМАНИЕ"
          description="Соедини числа по порядку и пройди каждую клетку ровно один раз."
          onRules={openRules}
        />
        {phase === "welcome" && (
          <ChallengeContext game="line" token={challengeToken} />
        )}
        {phase === "welcome" ? (
          <>
            <section className="line-welcome game-welcome">
              <div className="game-welcome-copy">
                <p className="eyebrow">ПЯТЬ ПОЛЕЙ · ОДИН МАРШРУТ</p>
                <h2>
                  Соединить числа легко.
                  <br />
                  <span>А заполнить всё поле?</span>
                </h2>
                <p>
                  От 1 до последнего числа — одной непрерывной линией. Найди
                  путь, который не оставит пустых клеток.
                </p>
                {!challengeToken && (
                  <ModeChoice
                    value={mode}
                    onChange={chooseMode}
                    options={modes}
                    className="line-mode-choice"
                  />
                )}
                {!challengeToken && (
                  <p className="line-mode-description">
                    {mode === "classic" ? lineDailyText : linePracticeText}
                  </p>
                )}
                <GameStartAction
                  game="line"
                  onStart={() => void begin()}
                  loading={busy}
                  loadingLabel="Готовим поля…"
                  caption={
                    saved && !saved.completed
                      ? "Незавершённую партию можно продолжить."
                      : "Пальцем, мышью или клавиатурой. Без скачивания."
                  }
                  error={
                    error ||
                    (ranked.state.status === "error"
                      ? ranked.state.message
                      : undefined)
                  }
                />
                {message && <p role="status">{message}</p>}
                <a
                  className="game-start-ranking"
                  href={`/leaderboard/?game=line&mode=${mode}`}
                >
                  Рейтинг игры →
                </a>
              </div>
              <div className="game-welcome-art line-welcome-art">
                <LinePreview />
                <span>ВСЕ КЛЕТКИ. ОДНА ЛИНИЯ.</span>
              </div>
              <ol className="game-welcome-steps line-steps">
                <li>
                  <span>01</span>
                  <div>
                    Начни с 1<small>Соединяй числа по порядку.</small>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    Заполни поле
                    <small>Без диагоналей и повторных клеток.</small>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    Найди свой путь
                    <small>Возвращаться назад можно бесплатно.</small>
                  </div>
                </li>
              </ol>
            </section>
          </>
        ) : phase === "finished" ? (
          <section className="line-summary">
            <p className="eyebrow">
              {mode === "classic"
                ? `ПОЛЯ ДНЯ · ${run?.challenge.day ?? lineMoscowDate()}`
                : "ПРАКТИКА ЗАВЕРШЕНА"}
            </p>
            <h2 ref={heading} tabIndex={-1}>
              Пять маршрутов найдены.
            </h2>
            <p className="line-total">
              <strong>{run?.score ?? 0}</strong>
              <span>/ 500 очков</span>
            </p>
            <ol className="line-results">
              {answers.map((a, i) => (
                <li key={i}>
                  <span>Поле {i + 1}</span>
                  <span>
                    {clock(a.elapsedMs)} · подсказок: {a.hints}
                  </span>
                  <strong>{a.score} / 100</strong>
                </li>
              ))}
            </ol>
            <p>
              {mode === "classic"
                ? "Первая попытка дня завершена. Новый набор появится в полночь по Москве. Можно продолжить в практике."
                : "Результат практики учитывается в её отдельном рейтинге. Общий рейтинг меняют только поля дня."}
            </p>
            <ChallengeContext
              game="line"
              token={challengeToken ?? run?.challenge.comparisonToken}
              runId={run?.id}
              completed
              runDay={run?.challenge.day}
              runMode={run?.mode}
              comparisonToken={run?.challenge.comparisonToken}
              score={run?.score}
            />
            {run?.private || run?.challenge.comparison ? (
              <>
                <p className="save-result">
                  Результат сравнения сохранён отдельно от рейтинга.
                </p>
                <PlayneEmailOffer />
              </>
            ) : (
              <SaveResult run={ranked} game="line" />
            )}
            <ShareResult runId={run?.id} />
            {access.user && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  reachGoal(LINE_GOALS.gameRestart, { mode: "practice" });
                  void begin("practice");
                }}
              >
                {busy ? "Готовим поля…" : "Играть в практике →"}
              </button>
            )}
            {error && <p role="status">{error}</p>}
            <a className="text-button" href="/leaderboard/?game=overall">
              Общий рейтинг →
            </a>
          </section>
        ) : (
          <section className="line-play" aria-label="Игра Одной линией">
            <div className="line-topline">
              <span>
                {mode === "classic"
                  ? `Поля дня · ${run?.challenge.day}`
                  : "Практика"}
              </span>
              <span>Поле {index + 1} / 5</span>
            </div>
            <RoundDots current={index} completed={answers.length} />
            {phase === "round-result" ? (
              <div className="line-round-result">
                <p className="eyebrow">ПОЛЕ ПРОЙДЕНО</p>
                <h2 ref={heading} tabIndex={-1}>
                  Маршрут найден.
                </h2>
                <p className="line-round-score">
                  <strong>{answers[index]?.score}</strong> / 100 очков
                </p>
                <p>
                  {clock(answers[index]?.elapsedMs ?? 0)} · подсказок:{" "}
                  {answers[index]?.hints ?? 0}
                </p>
                <button
                  className="primary"
                  onClick={() => void startRound(index + 1)}
                  disabled={busy}
                >
                  Следующее поле →
                </button>
              </div>
            ) : (
              <>
                <div className="line-play-heading">
                  <h2 ref={heading} tabIndex={-1}>
                    {phase === "ready"
                      ? "Продолжим маршрут?"
                      : phase === "checking"
                        ? "Проверяем маршрут…"
                        : `Начни с 1. Пройди все ${puzzle ? puzzle.rows * puzzle.cols : ""} клеток.`}
                  </h2>
                  <p>Числа по порядку. Последнее — на финише.</p>
                </div>
                <div className="line-stats">
                  <span>
                    Клетки{" "}
                    <strong>
                      {path.length} / {puzzle ? puzzle.rows * puzzle.cols : 0}
                    </strong>
                  </span>
                  <span>
                    Время <strong>{clock(elapsed)}</strong>
                  </span>
                  <span>
                    Подсказки <strong>{timing?.hints ?? 0}</strong>
                  </span>
                </div>
                <div className="line-board-wrap">
                  {puzzle && (
                    <LineBoard
                      key={puzzle.id}
                      puzzle={puzzle}
                      path={path}
                      onPathChange={changePath}
                      disabled={busy || phase !== "playing"}
                      onMessage={setMessage}
                    />
                  )}
                </div>
                <p className="line-path-status" role="status">
                  {message ||
                    (state?.complete
                      ? "Все клетки заполнены. Проверяем результат на сервере."
                      : path.length
                        ? `Следующее число: ${state?.nextCheckpoint}.`
                        : "Нажми на 1 и веди линию через соседние клетки.")}
                </p>
                {phase === "ready" ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void startRound(index, run, path)}
                  >
                    {busy ? "Подключаем поле…" : "Начать поле →"}
                  </button>
                ) : phase === "checking" ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void confirmPath(path)}
                  >
                    {busy ? "Сохраняем ответ…" : "Повторить отправку"}
                  </button>
                ) : (
                  <div className="line-controls">
                    <button
                      className="secondary-button"
                      disabled={busy || !path.length}
                      onClick={() => {
                        setPath((p) => p.slice(0, -1));
                        setMessage("");
                      }}
                    >
                      Отменить
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy || !path.length}
                      onClick={() => {
                        setPath([]);
                        setMessage("Поле начато заново. Время продолжается.");
                      }}
                    >
                      Заново
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void hint()}
                    >
                      {busy ? "Загружаем…" : "Подсказка −15"}
                    </button>
                  </div>
                )}
                {error && (
                  <p className="line-error" role="alert">
                    {error}
                  </p>
                )}
                <p className="line-keyboard">
                  Бонус за скорость: до 20 очков за первые {puzzle?.parSeconds}{" "}
                  сек., затем меньше. Ограничения времени нет.
                </p>
                <p className="line-keyboard">
                  Клавиатура: стрелки — выбрать клетку, Enter или пробел — ход,
                  Backspace — отмена. Время идёт и при закрытой вкладке.
                </p>
              </>
            )}
          </section>
        )}
        <LineAbout />
      </main>
      <FooterLinks />
      <RulesDialog
        dialogRef={rules}
        className="line-rules-dialog"
        title="Одной линией"
        titleId="line-dialog-title"
        eyebrow="ПРАВИЛА ИГРЫ"
      >
        <LinePreview />
        <ol>
          {lineRules.map((r) => (
            <li key={r.title}>
              <strong>{r.title}</strong> {r.text}
            </li>
          ))}
        </ol>
        <p>{lineScoreText}</p>
        <p>
          Бонус за скорость полный до ориентира времени поля, затем плавно
          снижается до нуля за четырёхкратное время. Он не ограничивает время
          решения.
        </p>
        <p>{lineDailyText}</p>
        <p>{linePracticeText}</p>
      </RulesDialog>
    </div>
  );
}
