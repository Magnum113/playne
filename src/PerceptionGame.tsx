import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, useAuth, useGuestTrial, useRankedRun, SaveResult, loginToPlay } from "./account";
import type { ServerRun } from "./rankedQueue";
import { GameHeader } from "./SiteHeader";
import { GameIntro } from "./GameIntro";
import { RulesDialog } from "./RulesDialog";
import { RoundDots } from "./ui";
import FooterLinks from "./FooterLinks";
import GameSearchAbout from "./GameSearchAbout";
import GameResultLayout from "./GameResultLayout";
import GameLeaderboard from "./GameLeaderboard";
import NextGame from "./NextGame";
import ShareResult from "./ShareResult";
import ChallengeContext, { readChallengeToken } from "./ChallengeContext";
import PerceptionPreview from "./PerceptionPreview";
import PerceptionBoard from "./PerceptionBoard";
import { PERCEPTION_GOALS, reachGoal } from "./analytics";
import { PERCEPTION_KINDS, perceptionBoardUrl, perceptionDayLabel, perceptionNames, perceptionRules, type PerceptionAnswer, type PerceptionInput, type PerceptionTask } from "./perception";
import "./perception.css";

type DailyStatus = { day: string; attempt: { id: string; completed: boolean; score: number | null } | null };
type Phase = "welcome" | "ready" | "playing" | "round-result" | "finished";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Не удалось связаться с сервером. Попробуй ещё раз.";
const timeText = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default function PerceptionGame() {
  const ranked = useRankedRun("perception");
  const [challengeToken] = useState(readChallengeToken);
  const access = useGuestTrial("perception");
  const { user } = useAuth();
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [dailyError, setDailyError] = useState("");
  const [dailyRetry, setDailyRetry] = useState(0);
  const [run, setRun] = useState<ServerRun | null>(null);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [index, setIndex] = useState(0);
  const [task, setTask] = useState<PerceptionTask | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [value, setValue] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sound, setSound] = useState(true);
  const startAt = useRef(0);
  const pending = useRef(false);
  const lastInput = useRef<PerceptionInput | null>(null);
  const tapRef = useRef<number[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const oscillators = useRef<OscillatorNode[]>([]);
  const rules = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const tapButton = useRef<HTMLButtonElement>(null);
  const notified = useRef(new Set<string>());
  const answers = (run?.answers ?? []) as PerceptionAnswer[];
  const answer = answers[index];
  const day = run?.challenge.day ?? daily?.day;
  const kind = PERCEPTION_KINDS[index];
  const score = answers.reduce((sum, item) => sum + item.score, 0);
  const emit = (name: keyof typeof PERCEPTION_GOALS, params: Record<string, string | number | boolean> = {}, unique?: string) => {
    if (unique && notified.current.has(unique)) return;
    if (unique) notified.current.add(unique);
    reachGoal(PERCEPTION_GOALS[name], { game: "perception", mode: "daily", ...(day ? { day } : {}), ...params });
  };
  useEffect(() => {
    let alive = true;
    setDailyError("");
    api<DailyStatus>("/perception/daily").then(data => { if (alive) setDaily(data); }).catch(e => { if (alive) setDailyError(errorText(e)); });
    return () => { alive = false; };
  }, [dailyRetry, user?.id]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("saved");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let alive = true;
    void ranked.resume(id).then(data => {
      if (!alive || !data) return;
      setRun(data);
      setIndex(Math.min(data.answers?.length ?? 0, 4));
      if (data.completed) setPhase("finished");
    });
    return () => { alive = false; };
  }, []);
  useLayoutEffect(() => {
    if (phase === "welcome") return;
    const target = heading.current?.closest(".perception-task, .perception-ready, .perception-finish");
    if (target) {
      const box = target.getBoundingClientRect();
      // A timed stimulus must be visible before the first paint, even when
      // the previous screen's start button was far down a narrow viewport.
      if (box.top < 16 || box.bottom > window.innerHeight) {
        window.scrollTo({ top: Math.max(0, window.scrollY + box.top - 16), behavior: "instant" });
      }
    }
    heading.current?.focus({ preventScroll: true });
  }, [phase, index]);
  useEffect(() => {
    if (phase !== "playing" || !task) return;
    const end = task.kind === "count" ? task.durationMs : task.kind === "track" ? task.flightMs * task.visibleFraction : task.kind === "tempo" ? 800 + 4 * 60000 / task.bpm : 0;
    if (!end) return;
    let frame = 0;
    const tick = () => {
      const now = Math.max(0, performance.now() - startAt.current);
      setElapsed(Math.min(now, end));
      // Static answer screens need no continuous rerenders or battery use.
      if (now < end) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [phase, task]);
  useEffect(() => () => {
    for (const node of oscillators.current) { try { node.stop(); } catch { /* Already stopped. */ } }
    void audio.current?.close();
  }, []);
  useEffect(() => {
    if (phase !== "finished" || !run) return;
    emit("resultView", { score, signed_in: !!user }, `view:${run.id}:${!!user}`);
  }, [phase, run?.id, user?.id]);
  function prepareAudio() {
    if (!sound) return;
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Visual pulses are always available. */ }
  }
  function stopCues() {
    for (const node of oscillators.current) { try { node.stop(); } catch { /* Already stopped. */ } }
    oscillators.current = [];
  }
  function scheduleCues(item: PerceptionTask, alreadyElapsed: number) {
    stopCues();
    if (item.kind !== "tempo" || !sound || !audio.current) return;
    const context = audio.current;
    for (let i = 0; i < 4; i++) {
      const delay = (800 + i * 60000 / item.bpm - alreadyElapsed) / 1000;
      if (delay < 0) continue;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = 660;
      oscillator.connect(gain); gain.connect(context.destination);
      const time = context.currentTime + delay;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.12, time + .008); gain.gain.exponentialRampToValueAtTime(.001, time + .11);
      oscillator.start(time); oscillator.stop(time + .12);
      oscillators.current.push(oscillator);
    }
  }
  async function begin() {
    if (pending.current) return;
    if (access.blocked && !daily?.attempt) { loginToPlay("perception", access.trial?.id, "daily"); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const data = challengeToken ? await ranked.begin("daily", 1, challengeToken) : daily?.attempt ? await ranked.resume(daily.attempt.id) : await ranked.begin("daily");
      if (!data) return;
      setRun(data); setIndex(Math.min(data.answers?.length ?? 0, 4));
      if (data.completed) setPhase("finished");
      else { setPhase("ready"); emit("gameStart", { run_id: data.id, resumed: !!data.answers?.length }, `start:${data.id}`); }
    } catch (e) { setError(errorText(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function start() {
    if (pending.current) return;
    prepareAudio(); pending.current = true; setBusy(true); setError("");
    try {
      const data = await ranked.perceptionStart(index) as { task: PerceptionTask; startedAt: number; serverNow: number };
      const offset = Math.max(0, data.serverNow - data.startedAt);
      startAt.current = performance.now() - offset;
      setElapsed(offset); setTask(data.task);
      setValue(data.task.kind === "angle" ? data.task.initial : null);
      setTaps([]); tapRef.current = []; lastInput.current = null;
      scheduleCues(data.task, offset); setPhase("playing");
      emit("roundStart", { round: index + 1, kind, resumed: offset > 1000 }, `${run?.id}:round:${index}`);
    } catch (e) { setError(errorText(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(input: PerceptionInput) {
    if (pending.current || !task) return;
    input = lastInput.current ?? input;
    pending.current = true; setBusy(true); setError(""); lastInput.current = input; stopCues();
    try {
      const fresh = await ranked.brainAnswer(index, input);
      if (!fresh) throw new Error("Ответ сохранён, но ещё отправляется. Повтори отправку.");
      setRun(fresh);
      if (task.kind !== "tempo") setValue((fresh.answers![index] as PerceptionAnswer).guess);
      setPhase("round-result");
      emit("roundComplete", { round: index + 1, kind, score: fresh.answers![index].score, skipped: !!input.skipped }, `${fresh.id}:answered:${index}`);
      if (fresh.completed) emit("gameComplete", { score: fresh.score ?? fresh.answers!.reduce((sum, a) => sum + a.score, 0), run_id: fresh.id }, `${fresh.id}:complete`);
    } catch (e) { setError(errorText(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  function tap() {
    if (task?.kind !== "tempo" || pending.current || tapRef.current.length >= 8) return;
    const time = performance.now() - startAt.current;
    if (time < 800 + 3.5 * 60000 / task.bpm) return;
    const previous = tapRef.current.at(-1);
    if (previous !== undefined && time - previous < 80) return;
    const next = [...tapRef.current, time]; tapRef.current = next; setTaps(next);
    if (next.length === 8) void submit({ taps: next });
  }
  useEffect(() => {
    if (task?.kind !== "tempo" || phase !== "playing") return;
    const press = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.target instanceof HTMLInputElement || rules.current?.open) return;
      if (e.target instanceof HTMLButtonElement && e.target !== tapButton.current) return;
      e.preventDefault(); tap();
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [task, phase]);
  const canAnswer = task && value !== null && (task.kind !== "count" || (elapsed >= task.durationMs && Number.isInteger(value) && value >= 1 && value <= 150)) && (task.kind !== "track" || elapsed >= task.flightMs * task.visibleFraction);
  const goNext = () => { setError(""); if (index === 4) setPhase("finished"); else { setIndex(index + 1); setTask(null); setPhase("ready"); } };
  const openRules = () => { rules.current?.showModal(); emit("rulesOpen"); };
  const boardLink = perceptionBoardUrl(day);
  return <div className="app perception-app">
    <a className="skip-link" href="#main-content">Перейти к игре</a>
    <GameHeader />
    <main id="main-content" className="perception-main">
      <GameIntro title="Приметь" eyebrow="ПРОВЕРЬ ВОСПРИЯТИЕ" description={phase === "welcome" ? "Глазомер, память и ритм. Что тебя не подведёт?" : undefined} onRules={phase === "playing" ? undefined : openRules} />
      {phase === "welcome" ? <>
        <ChallengeContext game="perception" token={challengeToken} />
        <section className="perception-welcome">
          <PerceptionPreview />
          <div className="perception-welcome-copy">
            <p className="eyebrow">{daily ? perceptionDayLabel(daily.day) : "КАЖДЫЙ ДЕНЬ"} · 5 ЗАДАНИЙ</p>
            <h2>Насколько точно ты чувствуешь?</h2>
            <p>Посчитай на глаз, поймай ритм и найди точку. Каждый день — новая пятёрка для всех.</p>
            <div className="perception-skills" aria-label="Задания дня">{PERCEPTION_KINDS.map(k => <span key={k}>{perceptionNames[k]}</span>)}</div>
            <div className="game-start-action">
              <button className="primary" disabled={busy || access.loading || !daily} onClick={() => void begin()}>
                {busy ? "Загружаем…" : daily?.attempt?.completed ? "Мой результат" : daily?.attempt ? "Продолжить" : access.blocked ? "Войти и играть" : "Начать игру"}<span aria-hidden="true">→</span>
              </button>
              <p className="game-start-caption">Одна попытка · до 500 очков</p>
            </div>
            {(error || dailyError || ranked.state.message) && <div role="status" className="perception-error"><p>{error || dailyError || ranked.state.message}</p>{dailyError && <button className="text-button" onClick={() => setDailyRetry(n => n + 1)}>Повторить загрузку</button>}</div>}
            <a className="perception-board-link" href={boardLink} onClick={() => emit("leaderboardOpen", { source: "welcome" })}>Рейтинг дня →</a>
          </div>
        </section>
        <GameSearchAbout game="perception" />
      </> : phase === "finished" ? <GameResultLayout game="perception" mode="daily" day={day} refreshKey={ranked.state.status}>
        <section className="perception-finish">
          <p className="eyebrow">{day && perceptionDayLabel(day)} · ПЯТЬ ЗАДАНИЙ ПОЗАДИ</p>
          <h2 tabIndex={-1} ref={heading}>Твоя точность</h2>
          <div className="perception-total"><strong>{score}</strong><span>из 500</span></div>
          <div className="perception-summary">{answers.map((item, i) => <div key={i}>
            <span>{perceptionNames[PERCEPTION_KINDS[i]]}</span><div className="perception-score-bar"><i style={{ width: `${item.score}%` }} /></div><strong>{item.score}</strong>
          </div>)}</div>
          <p className="perception-finish-time">Время заданий: {timeText(answers.reduce((sum, a) => sum + (a.elapsedMs ?? 0), 0))}</p>
          <ChallengeContext game="perception" token={challengeToken} completed runDay={day} runMode="daily" runId={run?.id} score={score} />
          <SaveResult run={ranked} game="perception" day={day} compact />
          <a className="secondary perception-board-link" href={boardLink} onClick={() => emit("leaderboardOpen", { source: "result", score })}>Посмотреть рейтинг дня</a>
          <p className="perception-tomorrow">Новая пятёрка — завтра в 00:00 МСК.</p>
          <ShareResult runId={run?.id} />
          <NextGame game="perception" runId={run?.id} />
        </section>
        <div className="perception-mobile-rank"><GameLeaderboard game="perception" mode="daily" day={day} refreshKey={ranked.state.status} /></div>
      </GameResultLayout> : <section className="perception-play">
        <div className="perception-progress"><RoundDots current={index} total={5} completed={answers.length} /><span>Очки <strong>{score}</strong><small>/ 500</small></span></div>
        {phase === "ready" ? <div className="perception-ready">
          <span className="perception-step-number" aria-hidden="true">0{index + 1}</span>
          <p className="eyebrow">ЗАДАНИЕ {index + 1} ИЗ 5</p>
          <h2 tabIndex={-1} ref={heading}>{perceptionNames[kind]}</h2>
          <p>{perceptionRules[kind]}</p>
          {kind === "tempo" && <label className="perception-sound"><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> Звук метронома</label>}
          <button className="primary" onClick={() => void start()} disabled={busy}>{busy ? "Готовим…" : "Готов"}<span aria-hidden="true">→</span></button>
          <small>Время начнётся после нажатия.</small>
          {error && <p className="perception-error" role="status">{error}</p>}
        </div> : task && <div className="perception-task">
          <div className="perception-task-heading">
            <div><p className="eyebrow">{perceptionNames[kind]}</p><h2 ref={heading} tabIndex={-1}>
              {phase === "round-result" ? `${answer.score} из 100` : task.kind === "angle" ? `Выставь ${task.target}°` : task.kind === "split" ? `Отметь ${task.label} ${task.fromRight ? "справа" : "слева"}` : task.kind === "count" ? "Сколько точек?" : task.kind === "track" ? "Где окажется шар?" : "Удержи ритм"}
            </h2></div>
            <span className="perception-round-label">{index + 1} / 5</span>
          </div>
          <PerceptionBoard task={task} elapsed={elapsed} value={value} onChange={next => { if (!pending.current && !lastInput.current) setValue(next); }} result={phase === "round-result" ? answer : undefined} taps={taps} />
          <div className="perception-controls">
            {phase === "round-result" ? <>
              {answer.skipped ? <p className="perception-feedback">Задание пропущено</p> : task.kind === "count" ? <p className="perception-feedback">Твой ответ: <b>{answer.guess}</b> · Было точек: <b>{answer.actual}</b></p>
                : <><div className="perception-legend"><span>Твой ответ</span><span>Точное попадание</span></div><p className="perception-feedback">Отклонение: <b>{answer.error.toLocaleString("ru-RU")} {answer.unit}</b></p></>}
              <button className="primary" onClick={goNext}>{index === 4 ? "Итог дня" : "Дальше"}<span aria-hidden="true">→</span></button>
            </> : <>
              {task.kind === "count" && <label className="perception-count-label">Твоё число
                <input type="number" inputMode="numeric" min="1" max="150" value={value ?? ""} placeholder="?" disabled={elapsed < task.durationMs || busy || !!lastInput.current} onChange={e => setValue(e.target.value === "" ? null : Number(e.target.value))} onKeyDown={e => { if (e.key === "Enter" && canAnswer) void submit({ value: value! }); }} />
              </label>}
              {task.kind === "angle" && <p className="perception-hint">Потяни луч. Для точной настройки — стрелки на клавиатуре.</p>}
              {(task.kind === "track" || task.kind === "split") && <p className="perception-hint">{task.kind === "track" && elapsed < task.flightMs * task.visibleFraction ? "Следи за шаром…" : "Поставь отметку на линии. Её можно передвинуть."}</p>}
              {task.kind === "tempo" ? <>
                <button ref={tapButton} type="button" className="primary perception-tap" disabled={busy || taps.length >= 8 || elapsed < 800 + 3.5 * 60000 / task.bpm}
                  onPointerDown={e => { if (e.button === 0) { e.preventDefault(); tap(); } }}
                  onClick={e => { if (e.detail === 0) tap(); }}>
                  {taps.length >= 8 ? "Проверяем…" : `${elapsed < 800 + 3.5 * 60000 / task.bpm ? "Слушай" : "Нажимай"} · ${taps.length} / 8`}
                </button><span className="perception-hint">Или нажимай пробел</span>
              </> : <button className="primary" disabled={!canAnswer || busy || !!lastInput.current} onClick={() => void submit({ value: value! })}>{busy ? "Проверяем…" : "Проверить"}<span aria-hidden="true">→</span></button>}
              {error && <div role="status" className="perception-error"><p>{error}</p>{lastInput.current && <button className="text-button" disabled={busy} onClick={() => void submit(lastInput.current!)}>Отправить ещё раз</button>}</div>}
              <button className="text-button perception-skip" disabled={busy || !!lastInput.current} onClick={() => void submit({ skipped: true })}>Пропустить</button>
            </>}
          </div>
        </div>}
      </section>}
    </main>
    <FooterLinks />
    <RulesDialog dialogRef={rules} title="Как играть в «Приметь»"><ol>{PERCEPTION_KINDS.map(k => <li key={k}><strong>{perceptionNames[k]}.</strong> {perceptionRules[k]}</li>)}</ol><p>До 100 очков за задание, до 500 за день. Время не уменьшает очки: оно решает только при равном результате. Отсчёт идёт во время задания, включая перерыв и обновление страницы.</p><p>Пять одинаковых заданий для всех. Одна зачётная попытка в день; новые задания — в 00:00 по Москве. После входа через Яндекс результат сохранится в дневном рейтинге.</p></RulesDialog>
  </div>;
}
