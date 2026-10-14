import { AccountNav, useRankedRun, SaveResult } from "./account";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import FooterLinks from "./FooterLinks";
import { SHADE_GOALS, reachGoal } from "./analytics";
import { shadeTransitionGoals } from "./gameAnalytics";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import {
  hsvToHex,
  loadShadeSession,
  newShadeSession,
  ROUND_COUNT,
  saveShadeSession,
  shadePhase,
  shadeReducer,
  shadeTotal,
  shadeModeName,
  SHADE_TIME_LIMIT_MS,
  type ShadeMode,
  type HSV,
  type ShadeAction,
} from "./colorfle";
import "./colorfle.css";

const colorText = (color: HSV) => hsvToHex(color).toUpperCase();
function Swatch({
  label,
  color,
  hint,
  showHex = true,
  empty = false,
}: {
  label: string;
  color: HSV;
  hint?: string;
  showHex?: boolean;
  empty?: boolean;
}) {
  return (
    <div className="shade-swatch-card">
      <span className="shade-label">{label}</span>
      <div
        className={`shade-swatch${empty ? " shade-swatch-empty" : ""}`}
        style={{ backgroundColor: empty ? "var(--hover)" : hsvToHex(color) }}
        role="img"
        aria-label={
          empty
            ? "Цвет не выбран"
            : showHex
              ? `${label}: ${colorText(color)}`
              : label
        }
      >
        {empty ? "Нет ответа" : null}
      </div>
      <div className="shade-value">
        {empty ? "—" : showHex ? colorText(color) : "Подбери на глаз"}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
function Palette({
  value,
  onChange,
}: {
  value: HSV;
  onChange: (c: HSV) => void;
}) {
  const square = useRef<HTMLDivElement>(null);
  const setPosition = (clientX: number, clientY: number) => {
    const box = square.current?.getBoundingClientRect();
    if (!box) return;
    onChange({
      h: value.h,
      s: Math.round(
        Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * 100,
      ),
      v: Math.round(
        (1 - Math.max(0, Math.min(1, (clientY - box.top) / box.height))) * 100,
      ),
    });
  };
  const pointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointerdown")
      event.currentTarget.setPointerCapture(event.pointerId);
    if (
      event.type === "pointerdown" ||
      event.currentTarget.hasPointerCapture(event.pointerId)
    )
      setPosition(event.clientX, event.clientY);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.shiftKey ? 10 : 1;
    const next = { ...value };
    if (event.key === "ArrowLeft") next.s = Math.max(0, next.s - delta);
    else if (event.key === "ArrowRight") next.s = Math.min(100, next.s + delta);
    else if (event.key === "ArrowUp") next.v = Math.min(100, next.v + delta);
    else if (event.key === "ArrowDown") next.v = Math.max(0, next.v - delta);
    else return;
    event.preventDefault();
    onChange(next);
  };
  return (
    <div className="shade-picker">
      <div className="shade-picker-heading">
        <h2>Подбери оттенок</h2>
        <span>Выбери цвет на поле</span>
      </div>
      <div
        ref={square}
        className="shade-square"
        style={{ backgroundColor: `hsl(${value.h} 100% 50%)` }}
        onPointerDown={pointer}
        onPointerMove={pointer}
        onKeyDown={keyboard}
        role="slider"
        tabIndex={0}
        aria-label="Насыщенность и яркость, стрелки для настройки"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value.s}
        aria-valuetext={`Насыщенность ${value.s} процентов, яркость ${value.v} процентов`}
      >
        <div className="shade-square-white" />
        <div className="shade-square-black" />
        <span
          className="shade-cursor"
          style={{
            left: `${value.s}%`,
            top: `${100 - value.v}%`,
            backgroundColor: hsvToHex(value),
          }}
        />
      </div>
      <label className="shade-hue-label" htmlFor="shade-hue">
        Цветовой тон
      </label>
      <input
        id="shade-hue"
        className="shade-hue"
        type="range"
        min="0"
        max="359"
        value={value.h}
        onChange={(event) =>
          onChange({ ...value, h: Number(event.target.value) })
        }
        aria-label="Цветовой тон"
      />
      <p className="shade-picker-tip">
        Двигай точку по полю и ползунок под ним. На клавиатуре — стрелки; Shift
        ускоряет шаг.
      </p>
    </div>
  );
}
function Rules() {
  return (
    <div className="shade-rules-copy">
      <p>
        На экране показан цвет. Твоя задача — подобрать такой же оттенок на
        палитре.
      </p>
      <ol>
        <li>
          Передвигай точку по цветному полю, чтобы выбрать яркость и
          насыщенность.
        </li>
        <li>Ползунком под полем меняй цветовой тон.</li>
        <li>
          Нажми «Проверить». Увидишь оба цвета рядом и получишь от 0 до 100
          очков.
        </li>
      </ol>
      <p>
        Всего пять раундов. Максимум — 500 очков. Можно играть без таймера или с
        лимитом 30 секунд на цвет. Когда время истечёт, засчитывается последний
        выбранный оттенок. Если ничего не выбрано — 0 очков. У каждого режима
        свой рекорд и рейтинг.
      </p>
    </div>
  );
}
export default function ColorfleGame() {
  const ranked = useRankedRun("colorfle");
  const [state, update] = useReducer(shadeReducer, undefined, loadShadeSession);
  const current = useRef(state);
  const rules = useRef<HTMLDialogElement>(null);
  const result = useRef<HTMLElement>(null);
  const [remaining, setRemaining] = useState(SHADE_TIME_LIMIT_MS / 1000);
  const lastChoiceSent = useRef(0);
  const pendingChoice = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timerError, setTimerError] = useState("");
  const [timerRetry, setTimerRetry] = useState(0);
  const mode = state.mode ?? "classic";
  const timed = mode === "timed";
  const phase = shadePhase(state);
  const round = state.round;
  const answer = state.answers[round];
  const total = shadeTotal(state);
  function syncChoice() {
    const latest = current.current;
    if (
      latest.mode !== "timed" ||
      shadePhase(latest) !== "picking" ||
      !latest.deadline ||
      Date.now() >= latest.deadline
    )
      return;
    lastChoiceSent.current = Date.now();
    ranked.shadeChoice(latest.round, latest.draft);
  }
  useEffect(
    () => () => {
      if (pendingChoice.current) clearTimeout(pendingChoice.current);
    },
    [],
  );
  function dispatch(action: ShadeAction) {
    const before = current.current,
      after = shadeReducer(before, action);
    if (before === after) return;
    current.current = after;
    update(action);
    if (
      action.type === "submit" &&
      after.answers.length > before.answers.length
    ) {
      if (before.mode === "timed" && before.touched)
        ranked.shadeChoice(before.round, before.draft);
      void ranked
        .shadeAnswer(before.round, {
          choice: before.touched ? before.draft : null,
          expired: action.expired,
        })
        .then((answer) => {
          if (answer && before.rankedId)
            dispatch({
              type: "verified",
              index: before.round,
              answer,
              id: before.rankedId,
            });
        });
    }
    shadeTransitionGoals(before, after, action).forEach(({ goal, params }) =>
      reachGoal(goal, params),
    );
  }
  async function beginOnline(replay = false) {
    if (ranked.state.status === "loading") return;
    const online = await ranked.begin(mode);
    if (!online) return;
    if (replay)
      dispatch({ type: "new", session: newShadeSession(current.current) });
    if (online)
      dispatch({
        type: "ranked",
        targets: online.challenge.targets,
        id: online.id,
      });
    if (!replay) dispatch({ type: "start" });
  }
  useEffect(() => {
    if (state.started)
      void ranked.resumeColor(state.rankedId, state.targets, state.answers);
  }, [state.started, state.rankedId, state.targets]);
  useEffect(() => {
    const results = ranked.shadeResults();
    if (!state.rankedId || !results) return;
    for (const [index, checked] of Object.entries(results)) {
      const local = state.answers[Number(index)],
        answer = checked.answer;
      if (
        local &&
        (local.score !== answer.score ||
          local.timedOut !== answer.timedOut ||
          !!local.noChoice !== (answer.choice === null) ||
          (answer.choice &&
            colorText(local.choice) !== colorText(answer.choice)))
      )
        dispatch({
          type: "verified",
          index: Number(index),
          answer,
          id: state.rankedId,
        });
    }
  }, [ranked.state, state.rankedId]);
  useEffect(() => {
    if (!timed || phase !== "picking") return;
    let active = true;
    setTimerError("");
    setRemaining(SHADE_TIME_LIMIT_MS / 1000);
    void ranked
      .shadeReady(round)
      .then((deadline) => {
        if (active) dispatch({ type: "deadline", deadline });
      })
      .catch((e) => {
        if (active) setTimerError(e.message);
      });
    return () => {
      active = false;
    };
  }, [timed, phase, round, timerRetry]);
  useEffect(() => {
    if (!timed || phase !== "picking" || !state.deadline) return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((state.deadline! - Date.now()) / 1000),
      );
      setRemaining(left);
      if (!left) dispatch({ type: "submit", expired: true });
    };
    tick();
    const interval = setInterval(tick, 100);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timed, phase, state.deadline, round]);
  useEffect(() => saveShadeSession(state), [state]);
  useEffect(() => {
    if (phase === "reveal" || phase === "finished") result.current?.focus();
  }, [phase, round]);
  useEffect(() => {
    if (phase === "picking" && round > 0)
      document
        .querySelector(".shade-status")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [round, phase]);
  return (
    <div className="app color-app">
      <a className="skip-link" href="#color-main">
        Перейти к игре
      </a>
      <header className="header">
        <PlayneBrand />
        <nav className="game-header-actions" aria-label="Навигация">
          <a className="back-to-hub" href="/">
            ← Все игры
          </a>
          <AccountNav />
          <ThemeToggle />
        </nav>
      </header>
      <main id="color-main" className="color-main">
        <div className="color-heading">
          <div>
            <p className="eyebrow">ПОПАДИ В ЦВЕТ</p>
            <h1>
              Оттенок<span className="brand-dot">.</span>
            </h1>
            <p>Подбери цвет как можно точнее.</p>
          </div>
          <button
            className="help-button color-help"
            onClick={() => {
              rules.current?.showModal();
              reachGoal(SHADE_GOALS.rulesOpen);
            }}
          >
            Как играть{" "}
            <span className="question" aria-hidden="true">
              ?
            </span>
          </button>
        </div>
        {phase === "welcome" ? (
          <section className="shade-welcome">
            <div className="shade-welcome-art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="eyebrow">ПЯТЬ РАУНДОВ · 500 ОЧКОВ</p>
            <h2>Сможешь попасть в цвет?</h2>
            <p>
              Смотри на образец и выбирай такой же оттенок на палитре. Чем ближе
              твой цвет, тем больше очков.
            </p>
            <fieldset className="shade-mode-choice">
              <legend>Режим игры</legend>
              {(["classic", "timed"] as ShadeMode[]).map((option) => (
                <label
                  key={option}
                  className={mode === option ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="shade-mode"
                    checked={mode === option}
                    disabled={ranked.state.status === "loading"}
                    onChange={() => dispatch({ type: "mode", mode: option })}
                  />
                  <span>
                    <strong>{shadeModeName(option)}</strong>
                    <small>
                      {option === "timed"
                        ? "30 секунд на цвет"
                        : "В своём темпе"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              className="primary"
              disabled={ranked.state.status === "loading"}
              onClick={() => void beginOnline()}
            >
              Начать игру <span aria-hidden="true">↗</span>
            </button>
            {ranked.state.status === "error" && (
              <p role="status">{ranked.state.message}</p>
            )}
            <small>Без регистрации. 150 оттенков в случайном порядке.</small>
          </section>
        ) : (
          <>
            <div className="shade-status">
              <div>
                <span className="eyebrow">
                  {phase === "finished"
                    ? "ИГРА ЗАВЕРШЕНА"
                    : `РАУНД ${round + 1} ИЗ ${ROUND_COUNT}`}
                </span>
                <div className="shade-dots" aria-hidden="true">
                  {Array.from({ length: ROUND_COUNT }, (_, i) => (
                    <i
                      key={i}
                      className={
                        i < state.answers.length
                          ? "done"
                          : i === round
                            ? "active"
                            : ""
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="shade-status-right">
                {timed && phase === "picking" && (
                  <span
                    className={`shade-timer${remaining <= 5 ? " urgent" : ""}`}
                    role="timer"
                    aria-label={
                      state.deadline ? "Осталось времени" : "Запускаем таймер"
                    }
                  >
                    {state.deadline
                      ? `0:${String(remaining).padStart(2, "0")}`
                      : "—:—"}
                  </span>
                )}
                <div className="shade-score">
                  Очки <strong>{total}</strong>{" "}
                  <span>/ {ROUND_COUNT * 100}</span>
                </div>
              </div>
            </div>
            <div className="shade-active-mode">
              <span>
                {shadeModeName(mode)}
                {timed ? " · 30 секунд на цвет" : ""}
              </span>
              {phase !== "finished" && (
                <button
                  className="text-button"
                  onClick={() => dispatch({ type: "menu" })}
                >
                  Сменить режим
                </button>
              )}
            </div>
            {timerError && (
              <div className="shade-timer-error" role="status">
                <p>{timerError}</p>
                <button
                  className="text-button"
                  onClick={() => setTimerRetry((n) => n + 1)}
                >
                  Повторить запуск таймера
                </button>
              </div>
            )}
            <div className="shade-play-area">
              <section className="shade-board" aria-label="Сравнение цветов">
                <Swatch
                  label="Образец"
                  color={state.targets[round]}
                  showHex={!!answer}
                />
                <Swatch
                  label={answer ? "Твой ответ" : "Твой выбор"}
                  color={answer?.choice ?? state.draft}
                  empty={answer?.noChoice}
                  hint={
                    answer?.noChoice
                      ? "Не выбран"
                      : !answer && !state.touched
                        ? "Пока не выбран"
                        : undefined
                  }
                />
              </section>
              {phase === "picking" ? (
                <>
                  <Palette
                    value={state.draft}
                    onChange={(color) => {
                      if (
                        timed &&
                        (!state.deadline || Date.now() >= state.deadline)
                      )
                        return;
                      dispatch({ type: "pick", color });
                      if (timed) {
                        if (Date.now() - lastChoiceSent.current >= 500)
                          syncChoice();
                        else if (!pendingChoice.current)
                          pendingChoice.current = setTimeout(
                            () => {
                              pendingChoice.current = null;
                              syncChoice();
                            },
                            500 - (Date.now() - lastChoiceSent.current),
                          );
                      }
                    }}
                  />
                  <div className="shade-actions">
                    <button
                      className="primary"
                      disabled={!state.touched || (timed && !state.deadline)}
                      onClick={() => dispatch({ type: "submit" })}
                    >
                      Проверить <span aria-hidden="true">→</span>
                    </button>
                    <span>
                      {timed
                        ? "Когда время истечёт, ответ засчитается сам"
                        : "Один ответ на каждый раунд"}
                    </span>
                  </div>
                </>
              ) : (
                <section
                  className="shade-result"
                  ref={result}
                  tabIndex={-1}
                  aria-live="polite"
                >
                  <p className="eyebrow">
                    {phase === "finished"
                      ? "ТВОЙ РЕЗУЛЬТАТ"
                      : "РЕЗУЛЬТАТ РАУНДА"}
                  </p>
                  <h2>
                    {phase === "finished"
                      ? `${total} из ${ROUND_COUNT * 100}`
                      : `${answer.score} из 100`}
                  </h2>
                  <p>
                    {phase === "finished"
                      ? "Все пять цветов пройдены. Сыграешь ещё?"
                      : "Сравни образец со своим ответом. Чем ближе цвета, тем больше очков."}
                  </p>
                  {answer?.timedOut && (
                    <p>
                      {answer.noChoice
                        ? "Время вышло. Цвет не выбран — 0 очков."
                        : "Время вышло. Засчитан последний выбранный оттенок."}
                    </p>
                  )}
                  {phase === "finished" ? (
                    <>
                      <div className="shade-final-stats">
                        <span>
                          Лучший результат{" "}
                          <strong>
                            {state.stats.best} / {ROUND_COUNT * 100}
                          </strong>
                        </span>
                        <span>
                          Партий сыграно <strong>{state.stats.played}</strong>
                        </span>
                      </div>
                      <div className="shade-round-scores">
                        {state.answers.map((item, i) => (
                          <span key={i}>
                            {i + 1}: {item.score}
                          </span>
                        ))}
                      </div>
                      <button
                        className="primary"
                        onClick={() => {
                          void beginOnline(true);
                        }}
                      >
                        Играть ещё →
                      </button>
                      <button
                        className="text-button shade-other-mode"
                        onClick={() => dispatch({ type: "menu" })}
                      >
                        Выбрать другой режим
                      </button>
                      <SaveResult run={ranked} game="colorfle" />
                    </>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => dispatch({ type: "next" })}
                    >
                      Следующий цвет →
                    </button>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </main>
      <footer className="color-footer">
        <span>Проверь своё чувство цвета.</span>
        <a href="/">Все игры Playne ↗</a>
        <FooterLinks />
      </footer>
      <dialog
        className="color-rules-dialog"
        ref={rules}
        aria-labelledby="color-rules-title"
      >
        <div className="dialog-top">
          <h2 id="color-rules-title">Как играть в «Оттенок»</h2>
          <button
            className="color-dialog-close"
            aria-label="Закрыть правила"
            onClick={() => rules.current?.close()}
          >
            ×
          </button>
        </div>
        <Rules />
        <button className="primary" onClick={() => rules.current?.close()}>
          Понятно
        </button>
      </dialog>
    </div>
  );
}
