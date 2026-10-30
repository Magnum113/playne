import { RulesDialog } from "./RulesDialog";
import { useGuestTrial } from "./account";
import { GameIntro, GameStartAction } from "./GameIntro";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SaveResult, useRankedRun } from "./account";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import PressureAbout from "./PressureAbout";
import { PRESSURE_GOALS, reachGoal } from "./analytics";
import {
  appendPressBatch,
  formatPressScore,
  pressScoreWord,
  PRESSURE_RULES_VERSION,
  judgePress,
  readPressStats,
  savePressStats,
  type PressEvent,
  type PressLevel,
  type PressStats,
  type PressTrace,
} from "./pressure";
import "./pressure.css";
type Phase = "welcome" | "countdown" | "playing" | "between" | "finished";
type BoardState = {
  phase: Phase;
  deck: PressLevel[];
  index: number;
  events: PressEvent[];
  elapsed: number;
  traces: PressTrace[];
  cleared: number;
  reason?: string;
};
const RING_SEGMENTS = 40;
const ringSegments = Array.from({ length: RING_SEGMENTS }, (_, i) => i);

export function PressureTimer({ fraction }: { fraction: number }) {
  return (
    <svg className="pressure-ring" viewBox="0 0 360 360" aria-hidden="true">
      <circle className="pressure-ring-track" cx="180" cy="180" r="166" />
      {ringSegments.map((i) => (
        <circle
          key={i}
          className={`pressure-ring-segment${i < Math.ceil(fraction * RING_SEGMENTS) ? " is-lit" : ""}`}
          cx="180"
          cy="180"
          r="166"
          pathLength="100"
          strokeDasharray="1.3 98.7"
          strokeDashoffset={(-i * 100) / RING_SEGMENTS}
          style={{ "--segment": i } as CSSProperties}
        />
      ))}
    </svg>
  );
}

const initial: BoardState = {
  phase: "welcome",
  deck: [],
  index: 0,
  events: [],
  elapsed: 0,
  traces: [],
  cleared: 0,
};
export function PressurePreview() {
  return (
    <svg
      className="size-preview pressure-preview"
      viewBox="0 0 420 190"
      aria-hidden="true"
    >
      <circle
        cx="210"
        cy="94"
        r="73"
        fill="none"
        stroke="var(--line)"
        strokeWidth="7"
      />
      <circle
        cx="210"
        cy="94"
        r="73"
        fill="none"
        stroke="var(--mint)"
        strokeWidth="7"
        strokeDasharray="7.4 4.06"
        strokeLinecap="round"
        transform="rotate(-90 210 94)"
      />
      <circle cx="210" cy="101" r="57" fill="var(--purple)" opacity=".2" />
      <g className="preview-pressure-button">
        <circle cx="210" cy="93" r="57" fill="var(--purple-soft)" />
        <text
          x="210"
          y="100"
          textAnchor="middle"
          fill="#292133"
          fontSize="21"
          fontWeight="650"
        >
          ЖМИ
        </text>
      </g>
      <path
        className="preview-pressure-cursor"
        d="m285 133 23 18-13 3-6 13Z"
        fill="var(--panel)"
        stroke="var(--mint)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Rules() {
  return (
    <div className="pressure-rules-copy">
      <p>Одна большая кнопка, но новое правило на каждом уровне.</p>
      <ol>
        <li>
          Прочитай задание. Иногда нужно нажать, иногда — ничего не делать.
        </li>
        <li>
          Для удержания зажми кнопку и отпусти в нужный момент. Для обычных
          нажатий каждый раз отпускай её.
        </li>
        <li>
          Следи за таймером. «Прошло» считает время от начала уровня, кольцо
          показывает оставшееся.
        </li>
        <li>
          Одна ошибка заканчивает попытку. Твой результат — число пройденных
          уровней. Ограничения нет: каждый пройденный уровень — одно очко.
        </li>
      </ol>
      <p>
        Запоминай числа и фигуры, если правило об этом просит: вопрос может
        вернуться через несколько уровней. Иногда нужно вспомнить и число
        нажатий на прошлом уровне.
      </p>
      <p>
        Счёт, память, логика и реакция чередуются случайно. При новой игре
        меняются задания, числа и порядок. На компьютере можно нажимать мышью,
        пробелом или Enter, на телефоне — пальцем.
      </p>
      <p>
        При уходе из вкладки игра приостанавливается. После возвращения текущий
        уровень начнётся заново.
      </p>
    </div>
  );
}
export default function PressureGame() {
  const access = useGuestTrial("pressure");
  const onlineId = useRef<string | null>(null);
  const ranked = useRankedRun("pressure");
  const [state, setState] = useState<BoardState>(initial),
    live = useRef(state);
  const [stats, setStats] = useState<PressStats>(readPressStats),
    statsRef = useRef(stats);
  const [loading, setLoading] = useState(false),
    [paused, setPaused] = useState(false),
    [countdown, setCountdown] = useState(3),
    [online, setOnline] = useState(false),
    [resultVisible, setResultVisible] = useState(false),
    [pressSerial, setPressSerial] = useState(0);
  const pausedRef = useRef(false),
    started = useRef(0),
    button = useRef<HTMLButtonElement>(null),
    rules = useRef<HTMLDialogElement>(null),
    outcome = useRef<HTMLElement>(null),
    input = useRef<string | null>(null),
    latestAct = useRef<(type: "down" | "up", source: string) => void>(() => {}),
    generation = useRef(0);
  const runSeed = useRef(0),
    recentVariants = useRef<string[]>([]);
  const level = state.deck[state.index],
    playing = state.phase === "playing";
  function update(next: BoardState) {
    if (
      onlineId.current &&
      (next.phase !== live.current.phase || next.index !== live.current.index)
    ) {
      try {
        localStorage.setItem(
          "playne:pressure-active:v1",
          JSON.stringify({
            id: onlineId.current,
            seed: runSeed.current,
            state:
              next.phase === "between"
                ? { ...next, index: next.index + 1 }
                : next,
          }),
        );
      } catch {
        /* Play continues in memory. */
      }
    }
    live.current = next;
    setState(next);
  }
  function complete(next: BoardState) {
    input.current = null;
    update(next);
    const old = statsRef.current;
    const saved = {
      best: Math.max(old.best, next.cleared),
      played: old.played + 1,
      recent: next.deck
        .slice(Math.max(0, next.index - 89), next.index + 1)
        .map((x) => x.id),
    };
    statsRef.current = saved;
    setStats(saved);
    savePressStats(saved);
    if (online) ranked.submit(0, { rounds: next.traces });
    reachGoal(PRESSURE_GOALS.gameComplete, {
      score: next.cleared,
      level_count: next.cleared + 1,
      mode: "endless",
      reason: next.reason ?? "complete",
    });
  }
  function evaluate(events: PressEvent[], elapsed: number) {
    const s = live.current;
    if (s.phase !== "playing" || pausedRef.current) return;
    const verdict = judgePress(s.deck[s.index], events, elapsed);
    if (verdict.status === "playing") {
      update({ ...s, events, elapsed });
      return;
    }
    const traces = [...s.traces, { events, elapsed }];
    if (verdict.status === "failure") {
      complete({
        ...s,
        events,
        elapsed,
        traces,
        phase: "finished",
        reason: verdict.reason,
      });
      return;
    }
    reachGoal(PRESSURE_GOALS.levelComplete, {
      level: s.index + 1,
      family: s.deck[s.index].family,
    });
    const next = {
      ...s,
      events,
      elapsed,
      traces,
      cleared: s.cleared + 1,
      phase: "between" as Phase,
    };
    input.current = null;
    if (next.index + 1 === next.deck.length)
      next.deck = [
        ...next.deck,
        ...appendPressBatch(runSeed.current, next.deck, recentVariants.current),
      ];
    update(next);
  }
  function act(type: "down" | "up", source: string) {
    if (live.current.phase !== "playing" || pausedRef.current) return;
    if (type === "down") {
      if (input.current !== null) return;
      input.current = source;
      setPressSerial((n) => n + 1);
    } else {
      if (input.current !== source) return;
      input.current = null;
    }
    const elapsed = Math.max(0, performance.now() - started.current);
    evaluate([...live.current.events, { type, at: elapsed }], elapsed);
  }
  latestAct.current = act;
  function pause() {
    if (live.current.phase !== "playing" || pausedRef.current) return;
    pausedRef.current = true;
    input.current = null;
    setPaused(true);
  }
  function resume() {
    input.current = null;
    started.current = performance.now();
    update({ ...live.current, events: [], elapsed: 0 });
    pausedRef.current = false;
    setPaused(false);
    button.current?.focus({ preventScroll: true });
  }
  async function begin() {
    if (loading) return;
    const gen = ++generation.current;
    setLoading(true);
    pausedRef.current = false;
    setPaused(false);
    const previous = live.current.phase === "finished";
    const data = await ranked.begin();
    if (gen !== generation.current) return;
    if (!data) {
      setLoading(false);
      return;
    }
    onlineId.current = data.id;
    const compatible = data.challenge?.rulesVersion === PRESSURE_RULES_VERSION;
    if (!compatible) {
      setLoading(false);
      return;
    }
    setOnline(!!data && compatible);
    runSeed.current = compatible
      ? data.challenge.seed
      : Math.floor(Math.random() * 4294967296);
    recentVariants.current = compatible
      ? data.challenge.recent
      : statsRef.current.recent;
    const deck = compatible
      ? data.challenge.levels
      : appendPressBatch(runSeed.current, [], recentVariants.current);
    setCountdown(3);
    setResultVisible(false);
    setPressSerial(0);
    let resumed: Partial<BoardState> = {};
    try {
      const saved = JSON.parse(
        localStorage.getItem("playne:pressure-active:v1") ?? "null",
      );
      if (
        access.resume &&
        saved?.id === data.id &&
        saved.seed === runSeed.current &&
        saved.state?.phase !== "finished" &&
        Array.isArray(saved.state?.traces) &&
        saved.state.traces.length === saved.state.index &&
        Array.isArray(saved.state.deck)
      )
        resumed = {
          deck: saved.state.deck,
          traces: saved.state.traces,
          index: saved.state.index,
          cleared: saved.state.cleared,
        };
    } catch {
      /* The server still reserves this same trial. */
    }
    update({ ...initial, deck, ...resumed, phase: "countdown" });
    setLoading(false);
    if (previous) reachGoal(PRESSURE_GOALS.gameRestart);
    reachGoal(PRESSURE_GOALS.gameStart, {
      mode: "endless",
      online: !!data && compatible,
    });
  }
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (state.phase !== "countdown") return;
    setCountdown(3);
    window.scrollTo({ top: 0, behavior: "instant" });
    let n = 3;
    const t = setInterval(() => {
      n--;
      setCountdown(n);
      if (!n) {
        clearInterval(t);
        started.current = performance.now();
        update({ ...live.current, phase: "playing" });
      }
    }, 650);
    return () => clearInterval(t);
  }, [state.phase]);
  useEffect(() => {
    if (state.phase !== "between") return;
    const t = setTimeout(() => {
      started.current = performance.now();
      update({
        ...live.current,
        index: live.current.index + 1,
        events: [],
        elapsed: 0,
        phase: "playing",
      });
    }, 700);
    return () => clearTimeout(t);
  }, [state.phase]);
  useEffect(() => {
    if (!playing || paused) return;
    button.current?.focus({ preventScroll: true });
    const t = setInterval(
      () =>
        evaluate(
          live.current.events,
          Math.max(0, performance.now() - started.current),
        ),
      32,
    );
    return () => clearInterval(t);
  }, [playing, paused, state.index]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) pause();
    };
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const blur = () => {
      clearTimeout(blurTimer);
      // Ignore transient/element focus changes caused by the animated control.
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) pause();
      }, 80);
    };
    const focus = () => clearTimeout(blurTimer);
    const up = (e: PointerEvent) => {
      latestAct.current("up", `pointer:${e.pointerId}`);
    };
    const keyup = (e: KeyboardEvent) => {
      if ([" ", "Enter"].includes(e.key))
        latestAct.current("up", `key:${e.key}`);
    };
    const cancel = (e: PointerEvent) => {
      if (input.current === `pointer:${e.pointerId}`) pause();
    };
    // Capture phase also receives release outside the button or after capture loss.
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearTimeout(blurTimer);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  // Submit in complete() immediately; this delay belongs only to visual feedback.
  useEffect(() => {
    if (state.phase !== "finished") return;
    const t = setTimeout(() => setResultVisible(true), 600);
    return () => clearTimeout(t);
  }, [state.phase]);
  useEffect(() => {
    if (resultVisible) outcome.current?.focus({ preventScroll: true });
  }, [resultVisible]);
  const held = state.events.at(-1)?.type === "down",
    heldFrom = held ? state.events.at(-1)!.at : 0;
  const holdingTime = held ? state.elapsed - heldFrom : 0;
  let display = level?.display ?? "·";
  if (level?.revealAt && state.elapsed >= level.revealAt) display = "?";
  if (level?.frames && state.elapsed < (level.revealAt ?? 0)) {
    const frameTime = state.elapsed - (level.frameStart ?? 0);
    display =
      frameTime < 0
        ? "СМОТРИ"
        : (level.frames[Math.floor(frameTime / (level.frameMs ?? 1000))] ??
          "?");
  }
  if (level?.signal)
    display =
      state.elapsed < level.from
        ? "ЖДИ"
        : state.elapsed < level.to
          ? level.signal
          : "ПОЗДНО";
  if (level?.kind === "release")
    display = held
      ? holdingTime >= level.from
        ? "ОТПУСТИ"
        : "ДЕРЖИ"
      : "ЗАЖМИ";
  if (level?.kind === "hold")
    display = held
      ? `${(holdingTime / 1000).toFixed(1).replace(".", ",")} с`
      : "ЗАЖМИ";
  const fraction = level ? Math.max(0, 1 - state.elapsed / level.duration) : 1;
  const taps = state.events.filter((e) => e.type === "up").length;
  const failing = state.phase === "finished" && !!state.reason;
  const succeeding =
    state.phase === "between" || (state.phase === "finished" && !state.reason);
  const active =
    ["playing", "between", "countdown"].includes(state.phase) ||
    (state.phase === "finished" && !resultVisible);
  const contentKey =
    state.phase === "countdown"
      ? `count-${countdown}`
      : `${state.phase}-${state.index}-${level?.signal || level?.frames || level?.kind === "release" ? display : ""}`;
  return (
    <div className={`app pressure-app${active ? " pressure-active" : ""}`}>
      <a className="skip-link" href="#pressure-main">
        Перейти к игре
      </a>
      <GameHeader />
      <main
        id="pressure-main"
        className={`pressure-main${state.phase === "welcome" ? " game-start-main" : ""}`}
      >
        {state.phase === "welcome" ? (
          <GameIntro
            title="Жми"
            eyebrow="ВНИМАТЕЛЬНОСТЬ ПОД ДАВЛЕНИЕМ"
            description="Сначала прочитай. Потом решай."
            record={{ value: stats.best, unit: pressScoreWord(stats.best) }}
            onRules={() => {
              rules.current?.showModal();
              reachGoal(PRESSURE_GOALS.rulesOpen);
            }}
          />
        ) : (
          <div className="pressure-heading">
            <div>
              <p className="eyebrow">ВНИМАТЕЛЬНОСТЬ ПОД ДАВЛЕНИЕМ</p>
              <h1>
                Жми<span className="brand-dot">.</span>
              </h1>
              <p>Бесплатная игра на русском. Сначала прочитай. Потом решай.</p>
            </div>
            <button
              className="help-button"
              onClick={() => {
                pause();
                rules.current?.showModal();
                reachGoal(PRESSURE_GOALS.rulesOpen);
              }}
            >
              Как играть{" "}
              <span className="question" aria-hidden="true">
                ?
              </span>
            </button>
          </div>
        )}
        {state.phase === "welcome" ? (
          <section className="pressure-welcome game-welcome">
            <div className="pressure-welcome-copy game-welcome-copy">
              <p className="eyebrow">ОДНА КНОПКА · ДО ПЕРВОЙ ОШИБКИ</p>
              <h2>
                Палец хочет нажать.
                <br />
                <span>А правило разрешает?</span>
              </h2>
              <p>
                Считай, запоминай, лови момент. Иногда лучший ход — вообще
                ничего не делать. Одна ошибка, и начинаем сначала.
              </p>
              <GameStartAction
                game="pressure"
                onStart={() => void begin()}
                loading={loading}
                loadingLabel="Готовим задания…"
                caption="Без скачивания. Игра — до первой ошибки."
              />
              {ranked.state.status === "error" && (
                <p role="status">{ranked.state.message}</p>
              )}
              <a
                className="game-start-ranking"
                href="/leaderboard/?game=pressure"
              >
                Рейтинг игры →
              </a>
            </div>
            <div className="pressure-welcome-art game-welcome-art">
              <PressurePreview />
              <span className="pressure-art-label">НЕ СПЕШИ НАЖИМАТЬ</span>
            </div>
            <ol className="pressure-steps game-welcome-steps">
              <li>
                <span>01</span>
                <div>
                  Читай правило<small>Оно меняется на каждом уровне.</small>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  Следи за временем<small>Нажми, удерживай или жди.</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  Побей рекорд
                  <small>Уровни не заканчиваются. За каждый — очко.</small>
                </div>
              </li>
            </ol>
          </section>
        ) : state.phase === "finished" && resultVisible ? (
          <section className="pressure-result" ref={outcome} tabIndex={-1}>
            <p className="eyebrow">ПОПЫТКА ЗАВЕРШЕНА</p>
            <h2>
              {state.cleared}
              <span> {pressScoreWord(state.cleared)}</span>
            </h2>
            <p className="pressure-result-lead">{state.reason}</p>
            {state.reason && (
              <div className="pressure-explanation">
                <span>УРОВЕНЬ {state.index + 1}</span>
                <h3>{level.prompt}</h3>
                {level.display && (
                  <p className="pressure-result-display">{level.display}</p>
                )}
                <p>{level.explanation}</p>
              </div>
            )}
            <div className="pressure-result-stats">
              <span>
                Лучший результат <strong>{formatPressScore(stats.best)}</strong>
              </span>
              <span>
                Попыток <strong>{stats.played}</strong>
              </span>
            </div>
            {access.user && (
              <button
                className="primary"
                disabled={loading}
                onClick={() => void begin()}
              >
                {loading ? "Готовим задания…" : "Попробовать ещё"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            )}
            {access.user && (
              <p className="pressure-new-deck">
                Следующая попытка — новые задания и порядок.
              </p>
            )}
            {online ? (
              <SaveResult run={ranked} game="pressure" />
            ) : (
              <p className="pressure-offline">
                Рекорд сохранён на этом устройстве. Для общего рейтинга начни
                игру при подключении к серверу.
              </p>
            )}
          </section>
        ) : (
          <section
            className={`pressure-play${succeeding ? " pressure-level-clear" : ""}${failing ? " pressure-level-failed" : ""}`}
            aria-label="Игровое поле"
          >
            <div className="pressure-topline">
              <span>
                УРОВЕНЬ <strong>{state.index + 1}</strong>
              </span>
              <span>
                Очки <strong>{state.cleared}</strong> · Рекорд{" "}
                <strong>{stats.best}</strong>
              </span>
              <button
                className="pressure-pause"
                onClick={pause}
                disabled={!playing || paused}
                aria-label="Пауза"
              >
                Ⅱ
              </button>
            </div>
            <div className="pressure-progress" aria-hidden="true">
              <span style={{ width: "100%" }} />
            </div>
            {paused ? (
              <div className="pressure-pause-screen">
                <p className="eyebrow">ПАУЗА</p>
                <h2>Продолжим?</h2>
                <p>
                  Этот уровень начнётся заново.
                  <br />
                  Пройденные уровни остаются.
                </p>
                <button className="primary" onClick={resume}>
                  Продолжить →
                </button>
              </div>
            ) : (
              <>
                <div className="pressure-instruction" aria-live="polite">
                  <p
                    className="eyebrow"
                    key={`status-${state.phase}-${state.index}`}
                  >
                    {state.phase === "countdown"
                      ? "ПРИГОТОВЬСЯ"
                      : failing
                        ? "ОШИБКА"
                        : succeeding
                          ? "ВЕРНО"
                          : "СЛЕДУЙ ПРАВИЛУ"}
                  </p>
                  <h2 key={`rule-${state.phase}-${state.index}`}>
                    {state.phase === "countdown"
                      ? "Сначала правило. Затем кнопка."
                      : failing
                        ? state.reason
                        : succeeding
                          ? "Есть. Следующее правило…"
                          : level.prompt}
                  </h2>
                </div>
                <div
                  className={`pressure-button-wrap${playing && fraction < 0.25 ? " urgent" : ""}${succeeding ? " is-success" : ""}${failing ? " is-failure" : ""}`}
                >
                  <PressureTimer fraction={fraction} />
                  <span className="pressure-housing" aria-hidden="true" />
                  <span className="pressure-button-base" aria-hidden="true" />
                  {pressSerial > 0 && (
                    <span
                      key={`press-${pressSerial}`}
                      className="pressure-press-wave"
                      aria-hidden="true"
                    />
                  )}
                  {succeeding && (
                    <span className="pressure-clear-wave" aria-hidden="true" />
                  )}
                  <button
                    ref={button}
                    className={`pressure-button${playing && held ? " is-held" : ""}`}
                    disabled={!playing}
                    aria-label="Игровая кнопка"
                    onContextMenu={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      if (!e.isPrimary || e.button !== 0) return;
                      e.preventDefault();
                      if (input.current !== null) return;
                      act("down", `pointer:${e.pointerId}`);
                      // Capture is an enhancement; global pointerup remains the fallback.
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        /* Pointer already ended. */
                      }
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      act("up", `pointer:${e.pointerId}`);
                    }}
                    onKeyDown={(e) => {
                      if (![" ", "Enter"].includes(e.key)) return;
                      e.preventDefault();
                      if (!e.repeat) act("down", `key:${e.key}`);
                    }}
                    onKeyUp={(e) => {
                      if (![" ", "Enter"].includes(e.key)) return;
                      e.preventDefault();
                      act("up", `key:${e.key}`);
                    }}
                    onClick={(e) => {
                      if (e.detail === 0 && !input.current) {
                        act("down", "assistive");
                        act("up", "assistive");
                      }
                    }}
                  >
                    <span className="pressure-button-face">
                      <span
                        key={contentKey}
                        className={`pressure-button-content${state.phase === "countdown" ? " pressure-countdown-beat" : ""}${succeeding || failing ? " pressure-feedback-symbol" : ""} ${playing && level?.family === "word" ? "pressure-word" : ""}${playing && level?.family === "politeness" ? " pressure-request" : ""}`}
                      >
                        {state.phase === "countdown"
                          ? countdown
                          : failing
                            ? "×"
                            : succeeding
                              ? "✓"
                              : display}
                      </span>
                    </span>
                  </button>
                </div>
                <div className="pressure-readout">
                  <span>
                    Прошло{" "}
                    <strong>
                      {(state.elapsed / 1000).toFixed(1).replace(".", ",")} с
                    </strong>
                  </span>
                  <span>
                    Нажатий <strong>{taps}</strong>
                  </span>
                  <span>
                    Осталось{" "}
                    <strong>
                      {Math.max(
                        0,
                        ((level?.duration ?? 0) - state.elapsed) / 1000,
                      )
                        .toFixed(1)
                        .replace(".", ",")}{" "}
                      с
                    </strong>
                  </span>
                </div>
                <p className="pressure-input-tip">
                  Палец, мышь или пробел. Удерживать — значит не отпускать.
                </p>
              </>
            )}
          </section>
        )}
        {state.phase === "welcome" && <PressureAbout />}
      </main>
      <footer className="color-footer">
        <span>Одна кнопка. Каждый раз новое правило.</span>
        <a href="/">Все игры Playne ↗</a>
        <FooterLinks />
      </footer>
      <RulesDialog
        dialogRef={rules}
        className="color-rules-dialog"
        title="Как играть в «Жми»"
        titleId="pressure-rules-title"
      >
        <Rules />
      </RulesDialog>
    </div>
  );
}
