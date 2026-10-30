import type { BrainGameId } from "./brainContent";
import { brainMoscowDate } from "./brain";
import { nextDaily, playCatalog, playMilestone } from "./playSuggestions";
import { usePlayProgress } from "./usePlayProgress";
import { PLAY_GOALS, reachGoal } from "./analytics";
import "./play-progress.css";

export default function PlayNextStep({
  game,
  runId,
  hideAction = false,
}: {
  game: BrainGameId;
  runId?: string;
  hideAction?: boolean;
}) {
  const { data, loading, error, refresh } = usePlayProgress(runId);
  if (loading && !data)
    return (
      <div className="play-next play-next-loading" role="status">
        Обновляем прогресс…
      </div>
    );
  if (!data)
    return (
      <div className="play-next">
        <a href="/brain/">К заданиям дня →</a>
        {error && (
          <button className="text-button" onClick={refresh}>
            Обновить прогресс
          </button>
        )}
      </div>
    );
  const completion = data.recentCompletions.find((item) => item.id === runId);
  const creditedToday =
    completion &&
    brainMoscowDate(new Date(completion.completedAt)) === data.day;
  const next = nextDaily(data, game) ?? nextDaily(data);
  const milestone = playMilestone(data.milestones);
  return (
    <section className="play-next" aria-label="Следующий шаг">
      <div className="play-next-heading">
        <strong>
          {creditedToday ? "Сегодняшний день засчитан" : "Твоя неделя в Playne"}
        </strong>
        <span>
          {Math.min(data.goal.completedDays, data.goal.days)} / {data.goal.days}{" "}
          дней
        </span>
      </div>
      {milestone && (
        <p className="play-next-milestone">
          <span aria-hidden="true">✓</span> {milestone}
        </p>
      )}
      {!next && <p>Задачи дня готовы. Новые — завтра.</p>}
      {next && !hideAction && (
        <a
          className="primary"
          href={next.href}
          onClick={() =>
            reachGoal(PLAY_GOALS.nextGame, {
              source: "result",
              from_game: game,
              game: next.game,
              action: next.action,
            })
          }
        >
          {next.action === "Продолжить" ? "Продолжить" : "Попробовать"} «
          {playCatalog[next.game].name}» <span aria-hidden="true">→</span>
        </a>
      )}
      {error && (
        <button className="text-button" onClick={refresh}>
          Обновить прогресс
        </button>
      )}
    </section>
  );
}
