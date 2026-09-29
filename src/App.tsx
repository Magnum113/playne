import { useCallback, useEffect, useRef, useState } from "react";
import Board from "./Board";
import Silhouette from "./Silhouette";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import { METRIKA_GOALS, reachGoal } from "./analytics";
import { objects, chooseRounds } from "./data";
import type { Pair } from "./data";
import {
  clamp,
  errorLabel,
  MAX_RATIO,
  meters,
  MIN_RATIO,
  readBest,
  ROUND_COUNT,
  saveBest,
  score,
} from "./game";
import type { Result } from "./game";

function Arrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Mark() {
  return (
    <svg width="27" height="27" viewBox="0 0 30 30" aria-hidden="true">
      <path d="M3 24V13h9v11" fill="#61d7c1" />
      <path d="M18 24V4h9v20" fill="#bea5f7" />
    </svg>
  );
}
function Hero() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 540 290">
        <defs>
          <pattern
            id="hero-grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M30 0H0V30"
              fill="none"
              stroke="var(--grid)"
              strokeWidth=".65"
            />
          </pattern>
        </defs>
        <rect width="540" height="290" fill="url(#hero-grid)" />
        <path d="M30 254H510" stroke="var(--line)" />
        <g color="var(--mint)">
          <Silhouette
            object={objects.eiffel}
            x={125}
            y={30}
            scale={224 / 330}
          />
        </g>
        <g color="var(--purple)">
          <Silhouette object={objects.rocket} x={357} y={114} scale={2} />
        </g>
        <path
          d="M341 103h44v158h-44Z"
          stroke="var(--purple)"
          strokeOpacity=".35"
          fill="none"
          strokeDasharray="4 5"
        />
        <rect x="375" y="94" width="20" height="20" rx="5" fill="#bea5f7" />
        <path
          d="m381 108 8-8m-6 0h6v6"
          fill="none"
          stroke="#151719"
          strokeWidth="1.5"
        />
        <text
          x="169"
          y="279"
          textAnchor="middle"
          fill="var(--mint)"
          fontSize="10"
          letterSpacing="2"
        >
          ОРИЕНТИР
        </text>
        <text
          x="366"
          y="279"
          textAnchor="middle"
          fill="var(--purple)"
          fontSize="10"
          letterSpacing="2"
        >
          ИЗМЕНИ РАЗМЕР
        </text>
      </svg>
    </div>
  );
}
export default function App() {
  const [screen, setScreen] = useState<"start" | "game" | "summary">("start");
  const [rounds, setRounds] = useState<Pair[]>([]);
  const [index, setIndex] = useState(0);
  const [ratio, setRatio] = useState(0.7);
  const [results, setResults] = useState<Result[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const finishReveal = useCallback(() => setRevealReady(true), []);
  const [best, setBest] = useState(readBest);
  const [oldBest, setOldBest] = useState(0);
  const [help, setHelp] = useState(false);
  const [touched, setTouched] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const total = results.reduce((sum, r) => sum + r.points, 0);
  useEffect(() => {
    if (help) dialog.current?.showModal();
    else dialog.current?.close();
  }, [help]);
  useEffect(() => {
    if (screen !== "start") heading.current?.focus();
  }, [screen, index]);
  function openHelp() {
    reachGoal(METRIKA_GOALS.rulesOpen, { screen });
    setHelp(true);
  }
  function start(source: "initial" | "restart") {
    if (source === "restart") {
      reachGoal(METRIKA_GOALS.gameRestart, { previous_score: total });
    }
    reachGoal(METRIKA_GOALS.gameStart, {
      source,
      round_count: ROUND_COUNT,
      previous_best: best,
    });
    setRounds(chooseRounds());
    setIndex(0);
    setResults([]);
    setRatio(0.45 + Math.random() * 0.55);
    setRevealed(false);
    setRevealReady(false);
    locked.current = false;
    setOldBest(best);
    setTouched(false);
    setScreen("game");
    window.scrollTo({ top: 0 });
  }
  function change(value: number) {
    if (!locked.current) {
      setRatio(clamp(value));
      setTouched(true);
    }
  }
  function submit() {
    if (locked.current) return;
    locked.current = true;
    const pair = rounds[index];
    const guess = objects[pair.reference].size * ratio;
    const target = objects[pair.target];
    const points = score(guess, target.size);
    setResults((prev) => [
      ...prev,
      {
        pairId: pair.id,
        guess,
        points,
      },
    ]);
    const roundParams = {
      round_number: index + 1,
      pair_id: pair.id,
      measurement: target.axis === "x" ? "length" : "height",
      points,
      guess_meters: Math.round(guess * 100) / 100,
      actual_meters: target.size,
    };
    reachGoal(METRIKA_GOALS.roundComplete, roundParams);
    if (points === 100) reachGoal(METRIKA_GOALS.perfectRound, roundParams);
    setRevealed(true);
  }
  function next() {
    if (!revealReady) return;
    if (index === ROUND_COUNT - 1) {
      const newBest = Math.max(best, total);
      reachGoal(METRIKA_GOALS.gameComplete, {
        score: total,
        previous_best: oldBest,
        new_record: total > oldBest,
        round_count: ROUND_COUNT,
      });
      setBest(newBest);
      saveBest(newBest);
      setScreen("summary");
      window.scrollTo({ top: 0 });
    } else {
      setIndex((i) => i + 1);
      setRatio(0.45 + Math.random() * 0.55);
      setRevealed(false);
      setRevealReady(false);
      locked.current = false;
    }
  }
  const pair = rounds[index];
  const reference = pair ? objects[pair.reference] : null;
  const target = pair ? objects[pair.target] : null;
  const last = results[index];
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Перейти к игре
      </a>
      <header className="header">
        <div className="brand">
          <Mark />
          <span>
            На глаз<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="game-header-actions">
          <a href="/" className="back-to-hub">
            Все игры
          </a>
          <ThemeToggle />
          <button className="help-button" onClick={openHelp}>
            <span className="question">?</span> Правила
          </button>
        </div>
      </header>
      <main id="main-content">
        {screen === "start" && (
          <section className="start-screen">
            <div className="intro">
              <p className="eyebrow">
                <span /> ИГРА В РАЗМЕРЫ
              </p>
              <h1>
                А насколько
                <br />
                <span>это большое?</span>
              </h1>
              <p className="lead">
                Подбери размер одного предмета
                <br className="desktop-break" /> рядом с другим.
              </p>
            </div>
            <Hero />
            <div className="start-bottom">
              <ol className="steps">
                <li>
                  <span>01</span>
                  <p>
                    Сравни предметы.<small>Размер ориентира указан.</small>
                  </p>
                </li>
                <li>
                  <span>02</span>
                  <p>
                    Измени размер.
                    <small>Потяни за угол или двигай ползунок.</small>
                  </p>
                </li>
                <li>
                  <span>03</span>
                  <p>
                    Проверь себя.<small>Чем точнее, тем больше очков.</small>
                  </p>
                </li>
              </ol>
              <div className="start-action">
                <button className="primary" onClick={() => start("initial")}>
                  Начать игру <Arrow />
                </button>
                <p>
                  5 раундов <span>·</span> до 500 очков
                </p>
                {best > 0 && (
                  <small>Рекорд на этом устройстве: {best} из 500</small>
                )}
              </div>
            </div>
          </section>
        )}
        {screen === "game" && reference && target && (
          <section className="game-screen">
            <div className="game-top">
              <div className="round-status">
                <span className="eyebrow">РАУНД {index + 1} ИЗ 5</span>
                <div className="progress-dots" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        i < index ? "done" : i === index ? "current" : ""
                      }
                    />
                  ))}
                </div>
              </div>
              <span className="score-total">
                Очки <strong>{total}</strong>
                <span>/ 500</span>
              </span>
            </div>
            <h1 ref={heading} tabIndex={-1} className="round-title">
              {pair.title}
            </h1>
            <Board
              key={pair.id}
              reference={reference}
              target={target}
              ratio={ratio}
              onChange={change}
              revealed={revealed}
              onRevealComplete={finishReveal}
            />
            <div className="object-labels">
              <div>
                <span className="object-role ref">● Ориентир</span>
                <h2>
                  {reference.name} <span>{meters(reference.size)}</span>
                </h2>
                <p>{reference.label}</p>
              </div>
              <div>
                <span className="object-role target">
                  {revealed
                    ? "● Результат"
                    : `● Подбери ${target.axis === "x" ? "длину" : "высоту"}`}
                </span>
                <h2>{target.name}</h2>
                <p>{target.label}</p>
              </div>
            </div>
            {!revealed ? (
              <div className="controls">
                <div className="slider-block">
                  <div className="slider-label">
                    <label htmlFor="size">Размер</label>
                    <span>
                      {!touched
                        ? "Потяни за угол или используй ползунок"
                        : "Сравни с ориентиром"}
                    </span>
                  </div>
                  <div className="range-row">
                    <button
                      className="step-button"
                      aria-label="Уменьшить размер"
                      disabled={ratio <= MIN_RATIO}
                      onClick={() => change(ratio - 0.025)}
                    >
                      −
                    </button>
                    <input
                      id="size"
                      type="range"
                      min={MIN_RATIO}
                      max={MAX_RATIO}
                      step="0.002"
                      value={ratio}
                      onChange={(e) => change(+e.target.value)}
                      aria-valuetext={`${Math.round(((ratio - MIN_RATIO) / (MAX_RATIO - MIN_RATIO)) * 100)}% диапазона`}
                      style={
                        {
                          "--fill": `${((ratio - MIN_RATIO) / (MAX_RATIO - MIN_RATIO)) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                    <button
                      className="step-button"
                      aria-label="Увеличить размер"
                      disabled={ratio >= MAX_RATIO}
                      onClick={() => change(ratio + 0.025)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button className="primary check" onClick={submit}>
                  Проверить <Arrow />
                </button>
              </div>
            ) : (
              <div className="answer" aria-live="polite">
                <p className="sr-only">
                  {revealReady
                    ? `${last.points} из 100. Твой размер: ${meters(last.guess)}. Правильный размер: ${meters(target.size)}. ${errorLabel(last.guess, target.size)}.`
                    : "Показываем правильный размер"}
                </p>
                <div className="result-actions">
                  <div className="result-legend">
                    <span>
                      <i className="guess-dot" />
                      Твой размер
                    </span>
                    <span>
                      <i className="actual-dot" />
                      Правильный размер
                    </span>
                  </div>
                  <button
                    className="primary"
                    onClick={next}
                    disabled={!revealReady}
                  >
                    {index === 4 ? "Посмотреть результат" : "Следующий раунд"}{" "}
                    <Arrow />
                  </button>
                </div>
                <div className="fact">
                  <p>{target.note}</p>
                  <a href={target.source} target="_blank" rel="noreferrer">
                    Источник размера ↗
                  </a>
                </div>
              </div>
            )}
          </section>
        )}
        {screen === "summary" && (
          <section className="summary">
            <p className="eyebrow">ПЯТЬ СРАВНЕНИЙ ПОЗАДИ</p>
            <h1 ref={heading} tabIndex={-1}>
              Результат
            </h1>
            <div className="final-score">
              {total}
              <span> / 500</span>
            </div>
            {oldBest > 0 && total > oldBest ? (
              <p className="record">Новый рекорд</p>
            ) : (
              <p className="best">
                Лучший результат на этом устройстве: {best}
              </p>
            )}
            <div className="result-list">
              {results.map((r, i) => {
                const p = rounds[i],
                  o = objects[p.target];
                return (
                  <div className="result-row" key={r.pairId}>
                    <span className="result-number">0{i + 1}</span>
                    <svg
                      viewBox={`0 0 ${o.width} ${o.height}`}
                      className="result-icon"
                      aria-hidden="true"
                    >
                      <Silhouette object={o} />
                    </svg>
                    <div className="result-description">
                      <h2>{o.name}</h2>
                      <p>{errorLabel(r.guess, o.size)}</p>
                    </div>
                    <strong>
                      {r.points}
                      <small> / 100</small>
                    </strong>
                  </div>
                );
              })}
            </div>
            <button className="primary" onClick={() => start("restart")}>
              Играть ещё <Arrow />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setScreen("start");
                window.scrollTo({ top: 0 });
              }}
            >
              К правилам игры
            </button>
          </section>
        )}
      </main>
      <footer>
        <PlayneBrand />
        <span>Разные предметы. Один глазомер.</span>
        <span className="footer-detail">Размеры — из открытых источников</span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setHelp(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              setHelp(false);
          }
        }}
        aria-labelledby="help-title"
      >
        <div className="dialog-top">
          <h2 id="help-title">Как играть</h2>
          <button
            className="close-button"
            aria-label="Закрыть правила"
            onClick={() => setHelp(false)}
          >
            ×
          </button>
        </div>
        <p>Подбери размер предмета рядом с ориентиром.</p>
        <ol>
          <li>Посмотри на бирюзовый предмет. Его размер указан под полем.</li>
          <li>
            Измени размер сиреневого предмета: потяни за угол или используй
            ползунок. Сам предмет можно передвинуть.
          </li>
          <li>
            Нажми «Проверить». Чем ближе размер к правильному, тем больше очков.
          </li>
        </ol>
        <p className="help-meta">5 раундов · до 100 очков за каждый</p>
        <button className="primary" onClick={() => setHelp(false)}>
          {screen === "game" ? "Вернуться к игре" : "Закрыть правила"}
        </button>
      </dialog>
    </div>
  );
}
