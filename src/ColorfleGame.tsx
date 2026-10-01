import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import FooterLinks from "./FooterLinks";
import { SHADE_GOALS, reachGoal } from "./analytics";
import { shadeTransitionGoals } from "./gameAnalytics";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import { hsvToHex, loadShadeSession, newShadeSession, ROUND_COUNT, saveShadeSession, shadePhase, shadeReducer, shadeShareText, shadeTotal, type HSV, type ShadeAction } from "./colorfle";
import "./colorfle.css";

const colorText = (color: HSV) => hsvToHex(color).toUpperCase();
function Swatch({ label, color, hint, showHex = true }: { label: string; color: HSV; hint?: string; showHex?: boolean }) {
  return <div className="shade-swatch-card"><span className="shade-label">{label}</span><div className="shade-swatch" style={{ backgroundColor: hsvToHex(color) }} role="img" aria-label={showHex ? `${label}: ${colorText(color)}` : label} /><div className="shade-value">{showHex ? colorText(color) : "Подбери на глаз"}{hint && <span>{hint}</span>}</div></div>;
}
function Palette({ value, onChange }: { value: HSV; onChange: (c: HSV) => void }) {
  const square = useRef<HTMLDivElement>(null);
  const setPosition = (clientX: number, clientY: number) => {
    const box = square.current?.getBoundingClientRect();
    if (!box) return;
    onChange({ h: value.h, s: Math.round(Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * 100), v: Math.round((1 - Math.max(0, Math.min(1, (clientY - box.top) / box.height))) * 100) });
  };
  const pointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    if (event.type === "pointerdown" || event.currentTarget.hasPointerCapture(event.pointerId)) setPosition(event.clientX, event.clientY);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.shiftKey ? 10 : 1;
    const next = { ...value };
    if (event.key === "ArrowLeft") next.s = Math.max(0, next.s - delta);
    else if (event.key === "ArrowRight") next.s = Math.min(100, next.s + delta);
    else if (event.key === "ArrowUp") next.v = Math.min(100, next.v + delta);
    else if (event.key === "ArrowDown") next.v = Math.max(0, next.v - delta);
    else return;
    event.preventDefault(); onChange(next);
  };
  return <div className="shade-picker">
    <div className="shade-picker-heading"><h2>Подбери оттенок</h2><span>Выбери цвет на поле</span></div>
    <div ref={square} className="shade-square" style={{ backgroundColor: `hsl(${value.h} 100% 50%)` }} onPointerDown={pointer} onPointerMove={pointer} onKeyDown={keyboard} role="slider" tabIndex={0} aria-label="Насыщенность и яркость, стрелки для настройки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.s} aria-valuetext={`Насыщенность ${value.s} процентов, яркость ${value.v} процентов`}>
      <div className="shade-square-white" /><div className="shade-square-black" /><span className="shade-cursor" style={{ left: `${value.s}%`, top: `${100 - value.v}%`, backgroundColor: hsvToHex(value) }} />
    </div>
    <label className="shade-hue-label" htmlFor="shade-hue">Цветовой тон</label>
    <input id="shade-hue" className="shade-hue" type="range" min="0" max="359" value={value.h} onChange={(event) => onChange({ ...value, h: Number(event.target.value) })} aria-label="Цветовой тон" />
    <p className="shade-picker-tip">Двигай точку по полю и ползунок под ним. На клавиатуре — стрелки; Shift ускоряет шаг.</p>
  </div>;
}
function Rules() { return <div className="shade-rules-copy"><p>На экране показан цвет. Твоя задача — подобрать такой же оттенок на палитре.</p><ol><li>Передвигай точку по цветному полю, чтобы выбрать яркость и насыщенность.</li><li>Ползунком под полем меняй цветовой тон.</li><li>Нажми «Проверить». Увидишь оба цвета рядом и получишь от 0 до 100 очков.</li></ol><p>Всего пять раундов. Максимум — 500 очков. Таймера нет, а лучший результат сохраняется в этом браузере.</p></div>; }
export default function ColorfleGame() {
  const [state, update] = useReducer(shadeReducer, undefined, loadShadeSession);
  const current = useRef(state);
  const [notice, setNotice] = useState("");
  const [fallback, setFallback] = useState(false);
  const rules = useRef<HTMLDialogElement>(null);
  const result = useRef<HTMLElement>(null);
  const phase = shadePhase(state);
  const round = state.round;
  const answer = state.answers[round];
  const total = shadeTotal(state);
  function dispatch(action: ShadeAction) {
    const before = current.current, after = shadeReducer(before, action);
    if (before === after) return;
    current.current = after; update(action);
    shadeTransitionGoals(before, after, action).forEach(({ goal, params }) => reachGoal(goal, params));
  }
  useEffect(() => saveShadeSession(state), [state]);
  useEffect(() => { if (phase === "reveal" || phase === "finished") result.current?.focus(); }, [phase, round]);
  useEffect(() => { if (phase === "picking" && round > 0) document.querySelector(".shade-status")?.scrollIntoView({ block: "start", behavior: "instant" }); }, [round, phase]);
  async function share() {
    try { await navigator.clipboard.writeText(shadeShareText(state)); reachGoal(SHADE_GOALS.resultCopy, { score: total, method: "clipboard" }); setNotice("Результат скопирован."); setFallback(false); }
    catch { setFallback(true); setNotice("Выдели и скопируй результат ниже."); }
  }
  return <div className="app color-app">
    <a className="skip-link" href="#color-main">Перейти к игре</a>
    <header className="header"><PlayneBrand /><nav className="game-header-actions" aria-label="Навигация"><a className="back-to-hub" href="/">← Все игры</a><ThemeToggle /></nav></header>
    <main id="color-main" className="color-main">
      <div className="color-heading"><div><p className="eyebrow">ПОПАДИ В ЦВЕТ</p><h1>Оттенок<span className="brand-dot">.</span></h1><p>Подбери цвет как можно точнее.</p></div><button className="help-button color-help" onClick={() => { rules.current?.showModal(); reachGoal(SHADE_GOALS.rulesOpen); }}>Как играть <span className="question" aria-hidden="true">?</span></button></div>
      {phase === "welcome" ? <section className="shade-welcome"><div className="shade-welcome-art" aria-hidden="true"><span /><span /><span /></div><p className="eyebrow">ПЯТЬ РАУНДОВ · 500 ОЧКОВ</p><h2>Сможешь попасть в цвет?</h2><p>Смотри на образец и выбирай такой же оттенок на палитре. Чем ближе твой цвет, тем больше очков.</p><button className="primary" onClick={() => dispatch({ type: "start" })}>Начать игру <span aria-hidden="true">↗</span></button><small>Без таймера и регистрации.</small></section> : <>
        <div className="shade-status"><div><span className="eyebrow">{phase === "finished" ? "ИГРА ЗАВЕРШЕНА" : `РАУНД ${round + 1} ИЗ ${ROUND_COUNT}`}</span><div className="shade-dots" aria-hidden="true">{Array.from({ length: ROUND_COUNT }, (_, i) => <i key={i} className={i < state.answers.length ? "done" : i === round ? "active" : ""} />)}</div></div><div className="shade-score">Очки <strong>{total}</strong> <span>/ {ROUND_COUNT * 100}</span></div></div>
        <div className="shade-play-area"><section className="shade-board" aria-label="Сравнение цветов"><Swatch label="Образец" color={state.targets[round]} showHex={!!answer} /><Swatch label={answer ? "Твой ответ" : "Твой выбор"} color={answer?.choice ?? state.draft} hint={!answer && !state.touched ? "Пока не выбран" : undefined} /></section>
        {phase === "picking" ? <><Palette value={state.draft} onChange={(color) => dispatch({ type: "pick", color })} /><div className="shade-actions"><button className="primary" disabled={!state.touched} onClick={() => dispatch({ type: "submit" })}>Проверить <span aria-hidden="true">→</span></button><span>Один ответ на каждый раунд</span></div></> : <section className="shade-result" ref={result} tabIndex={-1} aria-live="polite"><p className="eyebrow">{phase === "finished" ? "ТВОЙ РЕЗУЛЬТАТ" : "РЕЗУЛЬТАТ РАУНДА"}</p><h2>{phase === "finished" ? `${total} из ${ROUND_COUNT * 100}` : `${answer.score} из 100`}</h2><p>{phase === "finished" ? "Все пять цветов пройдены. Сыграешь ещё?" : "Сравни образец со своим ответом. Чем ближе цвета, тем больше очков."}</p>{phase === "finished" ? <><div className="shade-final-stats"><span>Лучший результат <strong>{state.stats.best} / {ROUND_COUNT * 100}</strong></span><span>Партий сыграно <strong>{state.stats.played}</strong></span></div><div className="shade-round-scores">{state.answers.map((item, i) => <span key={i}>{i + 1}: {item.score}</span>)}</div><button className="primary" onClick={() => { dispatch({ type: "new", session: newShadeSession(state) }); setNotice(""); setFallback(false); }}>Играть ещё →</button><button className="shade-share" onClick={share}>Скопировать результат</button>{fallback && <textarea aria-label="Текст результата для копирования" readOnly value={shadeShareText(state)} onFocus={(event) => event.currentTarget.select()} onCopy={() => reachGoal(SHADE_GOALS.resultCopy, { score: total, method: "manual" })} />}</> : <button className="primary" onClick={() => dispatch({ type: "next" })}>Следующий цвет →</button>}</section>}
        </div><p className="shade-notice" role="status">{notice}</p>
      </>}
    </main>
    <footer className="color-footer"><span>Проверь своё чувство цвета.</span><a href="/">Все игры Playne ↗</a><FooterLinks /></footer>
    <dialog className="color-rules-dialog" ref={rules} aria-labelledby="color-rules-title"><div className="dialog-top"><h2 id="color-rules-title">Как играть в «Оттенок»</h2><button className="color-dialog-close" aria-label="Закрыть правила" onClick={() => rules.current?.close()}>×</button></div><Rules /><button className="primary" onClick={() => rules.current?.close()}>Понятно</button></dialog>
  </div>;
}
