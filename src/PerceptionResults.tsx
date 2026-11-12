import { useEffect, useState } from "react";
import { api } from "./account";
import {
  PERCEPTION_KINDS, perceptionNames,
  type PerceptionAnswer, type PerceptionComparison, type PerceptionKind,
} from "./perception";

function grade(score: number) {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

const format = (value: number) => value.toLocaleString("ru-RU");
const phaseText = (phase: number) => phase === 0
  ? "В такт"
  : `${phase < 0 ? "Раньше" : "Позже"} на ${format(Math.abs(phase))} мс`;

export function perceptionFeedback(kind: PerceptionKind, answer: PerceptionAnswer, detailed = false) {
  if (answer.skipped) return "Пропуск";
  if (kind === "tempo" && answer.rhythm) {
    const { phase, jitter, shiftedBeats } = answer.rhythm;
    const timing = `${phaseText(phase)} · ±${format(jitter)} мс`;
    if (!detailed || shiftedBeats === 0) return timing;
    const beats = Math.abs(shiftedBeats);
    const unit = ["удар", "удара", "ударов"][pluralIndex(beats)];
    return `${timing} · Вступление на ${format(beats)} ${unit} ${shiftedBeats > 0 ? "позже" : "раньше"}`;
  }
  if (answer.error === 0) return "Точно";
  if (kind === "split") return `Мимо на ${format(answer.error)}%`;
  if (kind === "angle") return `Мимо на ${format(answer.error)}°`;
  const unit = kind === "count" ? ["точку", "точки", "точек"][pluralIndex(answer.error)] : answer.unit;
  return `Мимо на ${format(answer.error)} ${unit}`;
}

function pluralIndex(number: number) {
  const last = number % 10;
  const teen = number % 100;
  return last === 1 && teen !== 11 ? 0 : last >= 2 && last <= 4 && (teen < 12 || teen > 14) ? 1 : 2;
}

function Radar({ answers }: { answers: PerceptionAnswer[] }) {
  const vertex = (index: number, radius: number) => {
    const angle = index * 2 * Math.PI / PERCEPTION_KINDS.length - Math.PI / 2;
    return [150 + Math.cos(angle) * radius, 124 + Math.sin(angle) * radius];
  };
  const points = (radius: (index: number) => number) =>
    PERCEPTION_KINDS.map((_, index) => vertex(index, radius(index)).join(",")).join(" ");
  const scores = PERCEPTION_KINDS.map((_, index) => answers[index]?.score ?? 0);
  return <svg className="perception-radar" viewBox="0 0 300 232" role="img"
    aria-label={scores.map((score, index) => `${perceptionNames[PERCEPTION_KINDS[index]]} ${score} из 100`).join(", ")}>
    {[20, 40, 60, 80].map(radius => <polygon key={radius} points={points(() => radius)}
      fill="none" stroke="var(--line-strong)" strokeOpacity=".55" />)}
    {PERCEPTION_KINDS.map((kind, index) => {
      const [x, y] = vertex(index, 80);
      const [labelX, labelY] = vertex(index, 109);
      return <g key={kind}>
        <line x1="150" y1="124" x2={x} y2={y} stroke="var(--line-strong)" strokeOpacity=".55" />
        <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central">{perceptionNames[kind]}</text>
      </g>;
    })}
    <polygon points={points(index => scores[index] * .8)} fill="var(--purple)" fillOpacity=".18"
      stroke="var(--purple)" strokeWidth="2.5" strokeLinejoin="round" />
    {scores.map((score, index) => {
      const [x, y] = vertex(index, score * .8);
      return <circle key={index} cx={x} cy={y} r="3" fill="var(--purple)" />;
    })}
  </svg>;
}

export default function PerceptionResults({ answers, score, runId }: {
  answers: PerceptionAnswer[];
  score: number;
  runId?: string;
}) {
  const [comparison, setComparison] = useState<{ id: string; data: PerceptionComparison | null } | null>(null);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    void api<PerceptionComparison>(`/games/${runId}/perception/comparison`).then(data => {
      if (active) setComparison({ id: runId, data });
    }).catch(() => {
      if (active) setComparison({ id: runId, data: null });
    });
    return () => { active = false; };
  }, [runId]);
  const stats = comparison?.id === runId ? comparison?.data : undefined;
  const overallGrade = grade(Math.round(score / PERCEPTION_KINDS.length));
  return <>
    <div className="perception-total">
      <strong>{score}</strong><span>из 500</span>
      <b className="perception-grade" aria-label={`Оценка ${overallGrade}`}>
        {overallGrade}
      </b>
    </div>
    <p className="perception-comparison" role="status">
      {stats === undefined ? "Сравниваем с другими игроками…"
        : stats === null ? "Сравнение временно недоступно"
        : stats.players === 0 ? "Пока это первая завершённая партия дня"
        : <>Выше {stats.beaten}% из {format(stats.players)} {["результата", "результатов", "результатов"][pluralIndex(stats.players)]} за день
            {" · "}Среднее {format(stats.averageScore ?? 0)} из 500</>}
    </p>
    <Radar answers={answers} />
    <table className="perception-result-table" role="table" aria-label="Результаты пяти заданий">
      <thead className="sr-only">
        <tr><th scope="col">Задание</th><th scope="col">Разбор</th><th scope="col">Очки</th><th scope="col">Оценка</th></tr>
      </thead>
      <tbody role="rowgroup">
        {answers.map((answer, index) => {
          const kind = PERCEPTION_KINDS[index];
          return <tr key={kind} role="row">
            <th scope="row" role="rowheader">{perceptionNames[kind]}</th>
            <td className="perception-result-detail" role="cell">
              {perceptionFeedback(kind, answer, true)}
              {!!stats?.players && !answer.skipped && <span className="perception-result-percentile">
                · Выше {stats.rounds[index]}%
              </span>}
            </td>
            <td className="perception-result-score" role="cell">{answer.score}</td>
            <td className="perception-result-grade" role="cell">{grade(answer.score)}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </>;
}
