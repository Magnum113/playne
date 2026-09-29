import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import {
  COLOR_WEIGHTS,
  HINT_LABELS,
  MAX_COLOR_TRIES,
  PALETTE,
  colorHints,
  colorOutcome,
  colorReducer,
  colorShareText,
  colorSimilarity,
  colorWon,
  loadColorSession,
  mixture,
  newColorSession,
  saveColorSession,
  validRecipe,
  type ColorHint,
  type Recipe,
} from "./colorfle";
import "./colorfle.css";

const symbols: Record<ColorHint, string> = {
  exact: "✓",
  present: "↔",
  absent: "×",
};
const percent = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

function RecipeView({
  recipe,
  hints,
}: {
  recipe: Recipe;
  hints?: ColorHint[];
}) {
  return (
    <div className="color-recipe-view">
      {recipe.map((id, slot) => (
        <div className="color-recipe-part" key={slot}>
          <span
            className="color-small-swatch"
            style={{ background: PALETTE[id].hex }}
            aria-hidden="true"
          />
          <span className="color-part-name">
            {PALETTE[id].name}
            <small>{COLOR_WEIGHTS[slot] * 100}%</small>
          </span>
          {hints && (
            <span className={`color-hint ${hints[slot]}`}>
              <b aria-hidden="true">{symbols[hints[slot]]}</b>
              <span>{HINT_LABELS[hints[slot]]}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Rules() {
  return (
    <div className="color-rules-copy">
      <p>
        Загаданный оттенок — смесь <strong>трёх разных цветов</strong> из
        палитры. Первый даёт <strong>50%</strong> смеси, второй —{" "}
        <strong>30%</strong>, третий — <strong>20%</strong>.
      </p>
      <ol>
        <li>Выбери цвет для каждой доли и нажми «Смешать».</li>
        <li>
          Сравни свою смесь с целью. Подсказки покажут, какие цвета подходят.
        </li>
        <li>
          Найди точный состав за шесть попыток. Угаданные места сохранятся в
          следующей попытке.
        </li>
      </ol>
      <div className="color-hint-key">
        {(["exact", "present", "absent"] as ColorHint[]).map((h) => (
          <div key={h}>
            <span className={`color-hint ${h}`}>
              <b aria-hidden="true">{symbols[h]}</b>
            </span>
            <p>
              <strong>{HINT_LABELS[h]}</strong>
              <br />
              {h === "exact"
                ? "Цвет и его доля угаданы."
                : h === "present"
                  ? "Цвет есть в смеси, но нужен в другом месте."
                  : "Этого цвета в составе нет."}
            </p>
          </div>
        ))}
      </div>
      <p>
        Чтобы изменить выбор, нажми на долю, затем на цвет. Если цвет уже
        выбран, он поменяется местами с текущим. Кнопка «Сравнить» в истории
        покажет любую прошлую смесь рядом с целью.
      </p>
      <p>
        Сходство показывает близость оттенков. Для победы нужно угадать{" "}
        <strong>все три цвета на своих местах</strong>, даже если смесь уже
        очень похожа.
      </p>
      <p>
        Здесь смешиваются экранные цвета, а не настоящие краски. Например, синий
        с жёлтым не обязательно дадут зелёный.
      </p>
      <p className="color-quiet">
        Без таймера. Новая задача после каждой игры. Прогресс и статистика
        сохраняются в этом браузере.
      </p>
    </div>
  );
}

export default function ColorfleGame() {
  const [state, dispatch] = useReducer(
    colorReducer,
    undefined,
    loadColorSession,
  );
  const [notice, setNotice] = useState("");
  const [comparison, setComparison] = useState<number | null>(null);
  const [shareFallback, setShareFallback] = useState(false);
  const rules = useRef<HTMLDialogElement>(null);
  const slots = useRef<(HTMLButtonElement | null)[]>([]);
  const roundBar = useRef<HTMLDivElement>(null);
  const lastAttempt = useRef<HTMLLIElement>(null);
  const previousGuessCount = useRef(state.guesses.length);
  const resultPanel = useRef<HTMLDivElement>(null);
  const outcome = colorOutcome(state);
  const finished = outcome !== "playing";
  const previousOutcome = useRef(outcome);
  const lastIndex = state.guesses.length - 1;
  const comparedIndex =
    comparison !== null && comparison <= lastIndex ? comparison : lastIndex;
  const compared = state.guesses[comparedIndex];
  const complete = validRecipe(state.draft);
  const repeated =
    complete && state.guesses.some((g) => colorWon(g, state.draft as Recipe));
  const knownAbsent = new Set(
    state.guesses.flatMap((g) => g.filter((id) => !state.secret.includes(id))),
  );

  useEffect(() => {
    saveColorSession(state);
  }, [state]);
  useEffect(() => {
    if (outcome !== "playing" && previousOutcome.current === "playing")
      resultPanel.current?.focus({ preventScroll: false });
    previousOutcome.current = outcome;
  }, [outcome]);
  useEffect(() => {
    if (state.started)
      roundBar.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [state.started, state.secret]);
  useEffect(() => {
    if (
      state.guesses.length > previousGuessCount.current &&
      outcome === "playing"
    ) {
      lastAttempt.current?.focus({ preventScroll: true });
      if (window.matchMedia("(min-width: 701px)").matches) {
        roundBar.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
      } else {
        lastAttempt.current?.scrollIntoView({
          block: "center",
          behavior: "instant",
        });
      }
    }
    previousGuessCount.current = state.guesses.length;
  }, [state.guesses.length, outcome]);
  function backToPalette() {
    roundBar.current?.scrollIntoView({ block: "start", behavior: "instant" });
    slots.current[state.active]?.focus({ preventScroll: true });
  }
  function choose(id: number) {
    dispatch({ type: "choose", color: id });
    setNotice("");
  }
  function submit() {
    if (!complete) {
      setNotice("Выбери три разных цвета.");
      return;
    }
    if (repeated) {
      setNotice("Этот состав уже проверен. Измени хотя бы одну долю.");
      return;
    }
    dispatch({ type: "submit" });
    setComparison(null);
    setNotice(
      colorWon(state.draft as Recipe, state.secret)
        ? "Точный состав найден."
        : `Попытка ${state.guesses.length + 1} проверена. Сходство — ${percent(colorSimilarity(state.draft as Recipe, state.secret))}. Подсказки — в истории.`,
    );
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || finished) return;
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      choose(Number(event.key) - 1);
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      dispatch({ type: "remove" });
      setNotice("");
    }
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(colorShareText(state));
      setNotice("Результат скопирован.");
      setShareFallback(false);
    } catch {
      setShareFallback(true);
      setNotice("Выдели и скопируй результат ниже.");
    }
  }
  function next() {
    dispatch({ type: "new", session: newColorSession(state) });
    setNotice("");
    setComparison(null);
    setShareFallback(false);
  }

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
          <ThemeToggle />
        </nav>
      </header>
      <main id="color-main" className="color-main">
        <div className="color-heading">
          <div>
            <p className="eyebrow">ТРИ ЦВЕТА. ОДИН ОТТЕНОК.</p>
            <h1>
              Оттенок<span className="brand-dot">.</span>
            </h1>
            <p>Найди цвета, из которых собрана смесь.</p>
          </div>
          <button
            className="help-button color-help"
            onClick={() => rules.current?.showModal()}
          >
            Как играть{" "}
            <span className="question" aria-hidden="true">
              ?
            </span>
          </button>
        </div>
        {!state.started ? (
          <section
            className="color-welcome"
            aria-labelledby="color-welcome-title"
          >
            <div className="color-welcome-art" aria-hidden="true">
              <span style={{ background: PALETTE[4].hex }}>50%</span>
              <span style={{ background: PALETTE[6].hex }}>30%</span>
              <span style={{ background: PALETTE[7].hex }}>20%</span>
              <b>→</b>
              <span
                className="color-welcome-mix"
                style={{ background: mixture([4, 6, 7]) }}
              >
                ?
              </span>
            </div>
            <h2 id="color-welcome-title">Из чего получился этот цвет?</h2>
            <p>
              В палитре девять цветов. В смеси — только три.
              <br /> Найди их и расставь по долям за шесть попыток.
            </p>
            <div className="color-welcome-steps">
              <p>
                <b>01</b> Выбери три цвета
              </p>
              <p>
                <b>02</b> Смешай и сравни
              </p>
              <p>
                <b>03</b> Используй подсказки
              </p>
            </div>
            <button
              className="primary"
              onClick={() => dispatch({ type: "start" })}
            >
              Начать игру <span aria-hidden="true">↗</span>
            </button>
            <small>Без таймера. Играй сколько хочешь.</small>
          </section>
        ) : (
          <>
            <div className="color-round-bar" ref={roundBar}>
              <span>
                {finished
                  ? outcome === "won"
                    ? "СОСТАВ НАЙДЕН"
                    : "ПОПЫТКИ ЗАКОНЧИЛИСЬ"
                  : `ПОПЫТКА ${state.guesses.length + 1} ИЗ ${MAX_COLOR_TRIES}`}
              </span>
              <div className="color-round-dots" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < state.guesses.length
                        ? "used"
                        : i === state.guesses.length && !finished
                          ? "current"
                          : ""
                    }
                  />
                ))}
              </div>
              <span className="color-win-count">Побед: {state.stats.wins}</span>
            </div>
            <div className="color-layout">
              <div className="color-workbench">
                <div className="color-compare" aria-label="Сравнение оттенков">
                  <div>
                    <span className="color-panel-label">Нужно получить</span>
                    <div
                      className="color-patch"
                      style={{ background: mixture(state.secret) }}
                      role="img"
                      aria-label="Загаданный оттенок"
                    />
                    <small>Найди его состав</small>
                  </div>
                  <div>
                    <span className="color-panel-label">
                      {compared
                        ? `Твоя смесь · ${comparedIndex + 1}`
                        : "Твоя смесь"}
                    </span>
                    <div
                      className={`color-patch ${!compared ? "color-patch-empty" : ""}`}
                      style={
                        compared ? { background: mixture(compared) } : undefined
                      }
                      role="img"
                      aria-label={
                        compared
                          ? `Смесь из попытки ${comparedIndex + 1}`
                          : "Здесь появится твоя смесь"
                      }
                    >
                      {!compared && <span aria-hidden="true">?</span>}
                    </div>
                    <small>
                      {compared
                        ? `Сходство ${percent(colorSimilarity(compared, state.secret))}`
                        : "Появится после попытки"}
                    </small>
                  </div>
                </div>
                {!finished ? (
                  <div className="color-editor" onKeyDown={keyboard}>
                    <div className="color-editor-title">
                      <h2>Твой состав</h2>
                      <button
                        className="color-text-button"
                        disabled={state.draft.every((id) => id === null)}
                        onClick={() => {
                          dispatch({ type: "clear" });
                          setNotice("");
                        }}
                      >
                        Сбросить выбор
                      </button>
                    </div>
                    <div className="color-slots" aria-label="Доли цветов">
                      {state.draft.map((id, slot) => (
                        <button
                          key={slot}
                          ref={(el) => {
                            slots.current[slot] = el;
                          }}
                          className={`color-slot ${state.active === slot ? "selected" : ""}`}
                          aria-pressed={state.active === slot}
                          aria-label={`Доля ${COLOR_WEIGHTS[slot] * 100}%: ${id === null ? "выбери цвет" : PALETTE[id].name}`}
                          onClick={() => {
                            dispatch({ type: "slot", slot });
                            setNotice("");
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "ArrowLeft" ||
                              e.key === "ArrowRight"
                            ) {
                              e.preventDefault();
                              const nextSlot =
                                (slot + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                              dispatch({ type: "slot", slot: nextSlot });
                              slots.current[nextSlot]?.focus();
                            }
                          }}
                        >
                          <b>{COLOR_WEIGHTS[slot] * 100}%</b>
                          <span
                            className={`color-slot-chip ${id === null ? "empty" : ""}`}
                            style={
                              id === null
                                ? undefined
                                : { background: PALETTE[id].hex }
                            }
                            aria-hidden="true"
                          >
                            {id === null ? "+" : null}
                          </span>
                          <span>
                            {id === null ? "Выбери цвет" : PALETTE[id].name}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="color-palette-instruction">
                      {complete
                        ? "Можно изменить любую долю или проверить смесь."
                        : `Выбери цвет для доли ${COLOR_WEIGHTS[state.active] * 100}%.`}
                    </p>
                    <div
                      className="color-palette"
                      aria-label="Палитра из девяти цветов"
                    >
                      {PALETTE.map((color, id) => {
                        const selectedSlot = state.draft.indexOf(id);
                        return (
                          <button
                            key={color.name}
                            className={`color-choice ${selectedSlot >= 0 ? "chosen" : ""} ${knownAbsent.has(id) ? "ruled-out" : ""}`}
                            aria-label={`${id + 1}. ${color.name}${knownAbsent.has(id) ? ", нет в смеси" : ""}`}
                            aria-pressed={selectedSlot >= 0}
                            onClick={() => choose(id)}
                          >
                            <span
                              className="color-choice-swatch"
                              style={{
                                background: color.hex,
                                color: color.ink,
                              }}
                            >
                              <span>{id + 1}</span>
                              <b>
                                {selectedSlot >= 0
                                  ? `${COLOR_WEIGHTS[selectedSlot] * 100}%`
                                  : knownAbsent.has(id)
                                    ? "×"
                                    : ""}
                              </b>
                            </span>
                            <span className="color-choice-name">
                              {color.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="primary color-submit"
                      disabled={!complete || repeated}
                      onClick={submit}
                    >
                      Смешать <span aria-hidden="true">→</span>
                    </button>
                    {repeated && (
                      <p className="color-repeat-note">
                        Этот состав уже есть в истории. Попробуй другой.
                      </p>
                    )}
                    <p className="color-keyboard-hint">
                      Клавиши 1–9 — цвета · Delete — убрать выбранный
                    </p>
                  </div>
                ) : (
                  <div
                    className={`color-result ${outcome}`}
                    ref={resultPanel}
                    tabIndex={-1}
                    aria-labelledby="color-result-title"
                  >
                    <p className="eyebrow">
                      {outcome === "won"
                        ? "ТОЧНО В ЦВЕТ"
                        : "ВОТ КАКОЙ БЫЛ СОСТАВ"}
                    </p>
                    <h2 id="color-result-title">
                      {outcome === "won"
                        ? `Получилось за ${state.guesses.length} из 6`
                        : "Этот оттенок не поддался"}
                    </h2>
                    <p>
                      {outcome === "won"
                        ? "Все три цвета на своих местах."
                        : "Посмотри ответ и попробуй новый цвет."}
                    </p>
                    <RecipeView recipe={state.secret} />
                    <div className="color-result-stats">
                      <span>
                        <strong>
                          {state.stats.wins} / {state.stats.played}
                        </strong>
                        побед
                      </span>
                      <span>
                        <strong>{state.stats.best ?? "—"}</strong>лучшее число
                        попыток
                      </span>
                    </div>
                    <button className="primary color-submit" onClick={next}>
                      Следующий оттенок <span aria-hidden="true">→</span>
                    </button>
                    <button
                      className="color-text-button color-share"
                      onClick={share}
                    >
                      Скопировать результат
                    </button>
                    {shareFallback && (
                      <textarea
                        className="color-share-text"
                        aria-label="Текст результата для копирования"
                        readOnly
                        value={colorShareText(state)}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    )}
                  </div>
                )}
                <p className="color-notice" role="status" aria-live="polite">
                  {notice}
                </p>
              </div>
              <section
                className="color-history"
                aria-labelledby="color-history-title"
              >
                <div className="color-history-heading">
                  <h2 id="color-history-title">Твои попытки</h2>
                  <span>{state.guesses.length} / 6</span>
                </div>
                {state.guesses.length === 0 ? (
                  <div className="color-history-empty">
                    <div aria-hidden="true">
                      <span>50</span>
                      <span>30</span>
                      <span>20</span>
                    </div>
                    <p>
                      Первая смесь — на глаз.
                      <br /> Дальше помогут подсказки.
                    </p>
                  </div>
                ) : (
                  <ol
                    className="color-attempts"
                    reversed
                    start={state.guesses.length}
                  >
                    {state.guesses
                      .map((guess, index) => ({ guess, index }))
                      .reverse()
                      .map(({ guess, index }) => (
                        <li
                          key={index}
                          ref={index === lastIndex ? lastAttempt : undefined}
                          tabIndex={-1}
                          aria-label={`Результат попытки ${index + 1}`}
                          className={index === comparedIndex ? "comparing" : ""}
                        >
                          <div className="color-attempt-heading">
                            <b>Попытка {index + 1}</b>
                            <button
                              className="color-compare-button"
                              aria-pressed={index === comparedIndex}
                              aria-label={`Сравнить попытку ${index + 1}, сходство ${percent(colorSimilarity(guess, state.secret))}`}
                              onClick={() => {
                                setComparison(index);
                                roundBar.current?.scrollIntoView({
                                  block: "start",
                                  behavior: "instant",
                                });
                                setNotice(
                                  `Рядом с целью показана смесь из попытки ${index + 1}.`,
                                );
                              }}
                            >
                              <i
                                style={{ background: mixture(guess) }}
                                aria-hidden="true"
                              />
                              {percent(colorSimilarity(guess, state.secret))}
                              <span>Сравнить</span>
                            </button>
                          </div>
                          <RecipeView
                            recipe={guess}
                            hints={colorHints(guess, state.secret)}
                          />
                          {!finished && index === lastIndex && (
                            <button
                              className="color-text-button color-return"
                              onClick={backToPalette}
                            >
                              К следующей попытке ↑
                            </button>
                          )}
                          {!finished && (
                            <button
                              className="color-text-button color-reuse"
                              onClick={() => {
                                dispatch({ type: "reuse", recipe: guess });
                                setNotice(
                                  "Состав возвращён в палитру. Измени нужные доли.",
                                );
                                roundBar.current?.scrollIntoView({
                                  block: "start",
                                  behavior: "instant",
                                });
                                slots.current[0]?.focus({
                                  preventScroll: true,
                                });
                              }}
                            >
                              Взять за основу ↗
                            </button>
                          )}
                        </li>
                      ))}
                  </ol>
                )}
                <div className="color-history-legend">
                  {(["exact", "present", "absent"] as ColorHint[]).map((h) => (
                    <span key={h} className={`color-hint ${h}`}>
                      <b aria-hidden="true">{symbols[h]}</b>
                      {HINT_LABELS[h]}
                    </span>
                  ))}
                </div>
                <p className="color-history-note">
                  Победа — точный состав.
                  <br /> Похожий оттенок ещё не значит, что всё угадано.
                </p>
              </section>
            </div>
          </>
        )}
      </main>
      <footer className="color-footer">
        <span>Проверь своё чувство цвета.</span>
        <a href="/">Все игры Playne ↗</a>
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
