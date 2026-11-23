import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api, loginToPlay, useGuestTrial } from "./account";
import { GameIntro } from "./GameIntro";
import { GameHeader } from "./SiteHeader";
import { RoundDots } from "./ui";
import { RulesDialog } from "./RulesDialog";
import FooterLinks from "./FooterLinks";
import GameSearchAbout from "./GameSearchAbout";
import GameResultLayout from "./GameResultLayout";
import ShareResult from "./ShareResult";
import NextGame from "./NextGame";
import ChallengeContext, { readChallengeToken } from "./ChallengeContext";
import type { MaloktoDaily } from "./MaloktoCard";
import MaloktoDescent, { maloktoDepth } from "./MaloktoDescent";
import { MALOKTO_MAX, MALOKTO_ROUNDS, MALOKTO_ROUND_MS, maloktoBoardUrl, maloktoTiers, maloktoTime, type MaloktoAnswer, type MaloktoQuestion, type MaloktoReview } from "./malokto";
import { geoDailyLabel } from "./geoDaily";
import { PLAY_PROGRESS_UPDATED } from "./playProgress";
import "./malokto.css";

type Run = {
  id: string;
  game: string;
  challenge: { day: string };
  answers: MaloktoAnswer[];
  completed: boolean;
  published: boolean;
  score: number | null;
};
type Review = { players: number; beaten: number | null; rounds: MaloktoReview[] };
type AnswerResponse = { answer: MaloktoAnswer; completed: boolean; published: boolean; score: number | null };
type Phase = "welcome" | "ready" | "question" | "reveal" | "result";
const labelTier = (score: number) => maloktoTiers[score as keyof typeof maloktoTiers];
const readableError = (error: unknown) => error instanceof Error ? error.message : "Попробуй ещё раз.";

export default function MaloktoGame() {
  const access = useGuestTrial("malokto");
  const [daily, setDaily] = useState<MaloktoDaily>();
  const [dailyRetry, setDailyRetry] = useState(0);
  const [review, setReview] = useState<Review>();
  const [reviewFailed, setReviewFailed] = useState(false);
  const [reviewRetry, setReviewRetry] = useState(0);
  const [run, setRun] = useState<Run>();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [question, setQuestion] = useState<MaloktoQuestion>();
  const [value, setValue] = useState("");
  const [remaining, setRemaining] = useState(MALOKTO_ROUND_MS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token] = useState(readChallengeToken);
  const pending = useRef(false);
  const timeoutAttempted = useRef(false);
  const formInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rules = useRef<HTMLDialogElement>(null);
  const deadline = useRef(0);
  const index = run?.answers.length ?? 0;
  const last = run?.answers.at(-1);
  const finishedId = phase === "result" ? run?.id : undefined;
  const day = run?.challenge.day ?? daily?.day;
  const reading = remaining > MALOKTO_ROUND_MS;
  const needsLogin = !access.user && !!access.trial && !daily?.attempt;

  useEffect(() => {
    if (access.loading) return;
    let active = true;
    setError("");
    api<MaloktoDaily>("/malokto/daily")
      .then(data => { if (active) setDaily(data); })
      .catch(e => { if (active) setError(readableError(e)); });
    return () => { active = false; };
  }, [access.loading, access.user?.id, dailyRetry]);

  useEffect(() => {
    if (!finishedId) return;
    let active = true;
    setReviewFailed(false);
    api<Review>(`/games/${finishedId}/malokto/review`)
      .then(data => { if (active) setReview(data); })
      .catch(() => { if (active) setReviewFailed(true); });
    return () => { active = false; };
  }, [finishedId, reviewRetry]);

  useEffect(() => {
    if (access.loading || phase !== "welcome") return;
    const saved = new URLSearchParams(window.location.search).get("saved");
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved)) return;
    let active = true;
    api<Run>(`/games/${saved}`).then(data => {
      if (active && data.game === "malokto") {
        setRun(data);
        setPhase(data.completed ? "result" : "ready");
      }
    }).catch(() => { if (active) setError("Не удалось открыть сохранённую партию."); });
    return () => { active = false; };
  }, [access.loading, phase]);

  useEffect(() => {
    if (phase !== "welcome" && phase !== "question") heading.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    if (phase !== "question") return;
    if (reading) {
      heading.current?.focus({ preventScroll: true });
      return;
    }
    if (
      window.matchMedia("(pointer: fine)").matches &&
      (document.activeElement === heading.current || document.activeElement === document.body)
    ) {
      formInput.current?.focus({ preventScroll: true });
    }
  }, [phase, reading]);

  async function openQuestion(currentRun: Run, roundIndex: number) {
    const data = await api<MaloktoQuestion>(`/games/${currentRun.id}/malokto/start`, "POST", { index: roundIndex });
    const duration = Math.max(0, data.deadline - data.serverNow);
    deadline.current = performance.now() + duration;
    timeoutAttempted.current = false;
    setRemaining(duration);
    setQuestion(data);
    setValue("");
    setPhase("question");
  }

  async function begin() {
    if (pending.current) return;
    if (needsLogin) { loginToPlay("malokto"); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await api<Run>("/games", "POST", { game: "malokto", mode: "daily", ...(token && { challenge: token }) });
      setRun(data);
      if (data.completed) {
        setPhase("result");
      } else {
        try {
          await openQuestion(data, data.answers.length);
        } catch (e) {
          setPhase("ready");
          throw e;
        }
      }
    } catch (e) { setError(readableError(e)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function startRound() {
    if (pending.current || !run) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await openQuestion(run, index);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const current = await api<Run>(`/games/${run.id}`).catch(() => null);
        if (current && current.answers.length !== index) {
          setRun(current);
          if (current.completed) setPhase("result");
        } else setError(readableError(e));
      } else setError(readableError(e));
    } finally { pending.current = false; setBusy(false); }
  }

  const submit = useCallback(async (answer: string | null) => {
    if (pending.current || !run) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await api<AnswerResponse>(`/games/${run.id}/answers`, "POST", { index, answer: { text: answer } });
      setRun({ ...run, answers: [...run.answers, data.answer], completed: data.completed, published: data.published, score: data.score });
      setPhase("reveal");
      if (data.completed) window.dispatchEvent(new Event(PLAY_PROGRESS_UPDATED));
    } catch (e) {
      timeoutAttempted.current = answer === null;
      setError(readableError(e));
    } finally { pending.current = false; setBusy(false); }
  }, [run, index]);

  useEffect(() => {
    if (phase !== "question") return;
    const tick = () => {
      const ms = Math.max(0, deadline.current - performance.now());
      setRemaining(ms);
      if (ms === 0 && !pending.current && !timeoutAttempted.current) {
        timeoutAttempted.current = true;
        void submit(null);
      }
    };
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [phase, submit]);

  function send(event: FormEvent) {
    event.preventDefault();
    if (!reading && remaining && value.trim()) void submit(value.trim());
  }

  const score = run?.answers.reduce((sum, answer) => sum + answer.score, 0) ?? 0;
  const elapsed = run?.answers.reduce((sum, answer) => sum + answer.elapsedMs, 0) ?? 0;
  const expiredRound = remaining === 0;
  const inDescent = phase === "ready" || phase === "question" || phase === "reveal";
  const comparison = review?.beaten
    ? `Больше очков, чем у ${review.beaten}% участников дня`
    : score === MALOKTO_MAX ? "Максимум очков" : "Время ответов";
  return <div className={`app perception-app malokto-app${inDescent ? " is-descent" : ""}`}>
    <a className="skip-link" href="#main-content">Перейти к игре</a>
    <GameHeader account={!inDescent} />
    <main id="main-content" className="perception-main">
      {inDescent
        ? <h1 className="sr-only">Мало кто</h1>
        : <GameIntro title="Мало кто" eyebrow="ИГРА НА РЕДКИЕ ОТВЕТЫ" onRules={() => rules.current?.showModal()} />}
      {phase === "welcome" && <>
        <ChallengeContext game="malokto" token={token} />
        <section className="perception-welcome malokto-welcome">
          <MaloktoDescent variant="cover" />
          <div className="perception-welcome-copy">
            <p className="eyebrow">{day ? geoDailyLabel(day) : "КАЖДЫЙ ДЕНЬ"} · 5 ВОПРОСОВ</p>
            <h2>Что вспомнишь только ты?</h2>
            <p>Назови правильный ответ. Чем он необычнее, тем глубже спустится твой фонарь.</p>
            <div className="game-start-action">
              <button className="primary" onClick={() => void begin()} disabled={busy || access.loading || !daily?.available}>
                {daily?.attempt?.completed ? "Мой результат" : daily?.attempt ? "Продолжить" : needsLogin ? "Войти и играть" : "Начать игру"}
                <span aria-hidden="true">→</span>
              </button>
              <p className="game-start-caption">30 секунд на вопрос · до 500 очков</p>
            </div>
            {daily && !daily.available && <p>Новый набор пока недоступен.</p>}
            {error && <p role="status" className="malokto-error">{error} {!daily && <button className="text-button" onClick={() => setDailyRetry(n => n + 1)}>Повторить</button>}</p>}
            <a className="perception-board-link" href={maloktoBoardUrl(day)}>Рейтинг дня →</a>
          </div>
        </section>
        <GameSearchAbout game="malokto" />
      </>}
      {inDescent && <section className="perception-play malokto-play" aria-label="Погружение">
        <MaloktoDescent variant="play" score={score} gain={phase === "reveal" ? last?.score : 0} />
        <div className="perception-progress">
          <div className="malokto-progress-round">
            <RoundDots current={phase === "reveal" ? index - 1 : index} completed={index} total={MALOKTO_ROUNDS} />
            <small aria-hidden="true">{phase === "reveal" ? index : index + 1} / {MALOKTO_ROUNDS}</small>
          </div>
          <span>Очки <strong>{score}</strong><small>/ {MALOKTO_MAX}</small></span>
        </div>
        <div className="malokto-stage-content">
          {phase === "ready" && <div className="perception-ready malokto-ready">
            <p className="eyebrow">ВОПРОС {index + 1} ИЗ {MALOKTO_ROUNDS}</p>
            <h2 ref={heading} tabIndex={-1}>{index ? "Следующий вопрос" : "Первый вопрос"}</h2>
            <p>Сначала будет время прочитать вопрос. Затем — 30 секунд на ответ.</p>
            <button className="primary" disabled={busy} onClick={() => void startRound()}>Открыть вопрос <span aria-hidden="true">→</span></button>
          </div>}
          {phase === "question" && question && <div className="perception-task malokto-task">
            <div className="malokto-task-meta">
              <p className="eyebrow">{question.category}</p>
              <span className={reading ? "malokto-clock is-reading" : remaining < 6000 ? "malokto-clock is-low" : "malokto-clock"}>
                  {reading ? `Старт через ${Math.ceil((remaining - MALOKTO_ROUND_MS) / 1000)} с` : `${Math.ceil(remaining / 1000)} с`}
                </span>
            </div>
            <progress className="malokto-timer" max={MALOKTO_ROUND_MS} value={Math.min(remaining, MALOKTO_ROUND_MS)} aria-label="Оставшееся время" />
            <h2 ref={heading} tabIndex={-1}>{question.prompt}</h2>
            <form onSubmit={send}>
              <label htmlFor="malokto-answer">Твой ответ</label>
              <div className="malokto-input-row">
                <input id="malokto-answer" ref={formInput} value={value} onChange={event => setValue(event.target.value)}
                  name="answer" autoComplete="off" spellCheck={false} maxLength={100} disabled={reading} readOnly={expiredRound} enterKeyHint="send" />
                <button className="primary" disabled={busy || reading || expiredRound || !value.trim()}>Ответить <span aria-hidden="true">→</span></button>
              </div>
            </form>
            {expiredRound && <p role="status">Время вышло.</p>}
            {expiredRound && error && <button className="text-button" onClick={() => void submit(null)} disabled={busy}>Повторить отправку</button>}
          </div>}
          {phase === "reveal" && last && <div className="perception-ready malokto-ready malokto-reveal">
            <p className="eyebrow">ВОПРОС {index} ИЗ {MALOKTO_ROUNDS}</p>
            <h2 ref={heading} tabIndex={-1}>{last.name || "Время вышло"}</h2>
            <div className="malokto-round-points"><strong>+{last.score}</strong><span>{last.score ? `${labelTier(last.score)} · ещё ${maloktoDepth(last.score)} вглубь` : "Ответ не засчитан"}</span></div>
            <button className="primary" disabled={busy} onClick={() => { if (run?.completed) setPhase("result"); else void startRound(); }}>
              {run?.completed ? "Итог дня" : "Следующий вопрос"} <span aria-hidden="true">→</span>
            </button>
          </div>}
          {error && <p className="malokto-error" role="status">{error}</p>}
        </div>
      </section>}
      {phase === "result" && run && <GameResultLayout game="malokto" mode="daily" day={day} refreshKey={String(run.published)}>
        <section className="perception-finish malokto-result">
          <p className="eyebrow">{day && geoDailyLabel(day)} · ИТОГ ДНЯ</p>
          <h2 ref={heading} tabIndex={-1}>Твои редкие ответы</h2>
          <div className="perception-total"><strong>{score}</strong><span>из {MALOKTO_MAX}</span></div>
          <p className="perception-comparison">
            {comparison} · {maloktoTime(elapsed)}
          </p>
          <MaloktoDescent variant="result" score={score} />
          <ChallengeContext game="malokto" token={token} completed runDay={day} runMode="daily" score={score} runId={run.id} />
          {!run.published && !access.user && <button className="primary malokto-save"
            onClick={() => loginToPlay("malokto", run.id)}>Войти и сохранить в рейтинг</button>}
          <a className="perception-board-link" href={maloktoBoardUrl(day)}>Посмотреть рейтинг дня</a>
          <section className="malokto-breakdown" aria-label="Разбор ответов">
            <h3>Разбор ответов</h3>
            {review?.rounds.map((round, i) => <details key={i}>
              <summary><span className="malokto-review-index">{i + 1}</span><span>{round.answer.name ?? "Без ответа"}<small>{round.category}{round.answer.name && review.players > 0 ? ` · Совпадений ${round.matches}` : ""}</small></span><strong>+{round.answer.score}</strong><span className="malokto-review-chevron" aria-hidden="true">⌄</span></summary>
              <div className="malokto-review-detail">
                <p>{round.prompt}</p>
                {round.examples.length > 0 && <><h4>Что ещё подошло</h4><ul>{round.examples.map(example => <li key={example.name}><span>{example.name}</span><strong>+{example.score}</strong></li>)}</ul></>}
              </div>
            </details>)}
            {!review && (reviewFailed ? <button className="text-button" onClick={() => setReviewRetry(n => n + 1)}>Загрузить разбор ещё раз</button> : <p role="status">Загружаем разбор…</p>)}
          </section>
          {day === daily?.day && <ShareResult runId={run.id} />}
          <NextGame game="malokto" runId={run.id} />
        </section>
      </GameResultLayout>}
    </main>
    {!inDescent && <FooterLinks />}
    <RulesDialog dialogRef={rules} title="Как играть в «Мало кто»">
      <ol>
        <li>На каждый вопрос есть 30 секунд. Можно попробовать другой вариант, если ответ не нашёлся в справочнике.</li>
        <li>Первый принятый ответ приносит 25, 45, 70 или 100 очков. Каждое очко — четыре метра спуска. Редкость ответа задана заранее и одинакова для всех.</li>
        <li>В зачёт идёт одна партия в день. При равных очках выше тот, кто ответил быстрее.</li>
        <li>После партии можно посмотреть примеры и узнать, сколько участников дали такой же ответ.</li>
      </ol>
    </RulesDialog>
  </div>;
}
