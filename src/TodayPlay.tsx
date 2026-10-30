import StreakFlame from "./StreakFlame";
import { streakDays } from "./playStreaks";
import "./streak.css";
import BrainPreview from "./BrainPreview";
import LinePreview from "./LinePreview";
import type { GameId } from "./account";
import type { BrainGameId } from "./brainContent";
import { brainDateLabel } from "./brainProgress";
import { PLAY_GOALS, reachGoal } from "./analytics";
import {
  playCatalog,
  todaySuggestions,
  type PlaySuggestion,
} from "./playSuggestions";
import { usePlayProgress } from "./usePlayProgress";
import "./play-progress.css";

function Preview({ game }: { game: GameId }) {
  if (["flash", "rotate", "slide", "dispatch"].includes(game))
    return <BrainPreview game={game as BrainGameId} />;
  if (game === "line") return <LinePreview />;
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="play-symbol"
    >
      <circle cx="60" cy="60" r="47" fill="var(--panel)" />
      {game === "circle" ? (
        <path
          d="M91 58C95 79 80 94 60 93C37 93 26 77 28 59C26 38 44 26 61 28C79 27 94 43 91 58"
          stroke="var(--purple)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ) : game === "colorfle" ? (
        <>
          <rect
            x="30"
            y="30"
            width="42"
            height="42"
            rx="12"
            fill="var(--purple)"
          />
          <rect
            x="48"
            y="48"
            width="42"
            height="42"
            rx="12"
            fill="var(--mint)"
          />
          <circle cx="59" cy="59" r="7" fill="var(--panel)" />
        </>
      ) : game === "geo" ? (
        <>
          <circle cx="60" cy="60" r="30" stroke="var(--mint)" strokeWidth="3" />
          <ellipse
            cx="60"
            cy="60"
            rx="13"
            ry="30"
            stroke="var(--mint)"
            strokeWidth="3"
          />
          <path
            d="M30 60h60M35 46h50M35 74h50"
            stroke="var(--mint)"
            strokeWidth="3"
          />
        </>
      ) : game === "pressure" ? (
        <>
          <circle
            cx="60"
            cy="60"
            r="30"
            stroke="var(--purple)"
            strokeWidth="3"
          />
          <path
            d="m60 60 16-23"
            stroke="var(--mint)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="60" cy="60" r="5" fill="var(--mint)" />
        </>
      ) : (
        <>
          <path
            d="M31 83 49 34l18 49H31Z"
            fill="var(--purple-tint)"
            stroke="var(--purple)"
            strokeWidth="3"
          />
          <path
            d="M78 31v56m-7-50 7-7 7 7m-14 44 7 7 7-7"
            stroke="var(--mint)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

function Choice({
  item,
  secondary = false,
}: {
  item: PlaySuggestion;
  secondary?: boolean;
}) {
  const game = playCatalog[item.game];
  return (
    <a
      className={`play-choice${secondary ? " play-choice-secondary" : ""}`}
      href={item.href}
      onClick={() =>
        reachGoal(PLAY_GOALS.todayGame, {
          game: item.game,
          slot: secondary ? "secondary" : "primary",
          action: item.action,
        })
      }
    >
      <div className="play-choice-copy">
        <span className="play-choice-label">
          {secondary ? "Ещё одна игра" : item.label}
        </span>
        <h3>{game.name}</h3>
        <p>{game.hint}</p>
        <span className="play-choice-action">
          {item.action} <span aria-hidden="true">→</span>
        </span>
      </div>
      <div className="play-choice-art">
        <Preview game={item.game} />
      </div>
    </a>
  );
}

export default function TodayPlay() {
  const { data, day, loading, error, refresh } = usePlayProgress();
  const [primary, secondary] = todaySuggestions(day, data);
  return (
    <section
      className="today-play"
      aria-labelledby="today-play-title"
      aria-busy={loading || undefined}
    >
      <div className="today-play-heading">
        <div>
          <p className="eyebrow">{brainDateLabel(day)}</p>
          <h2 id="today-play-title">
            Сегодня в Playne<span className="brand-dot">.</span>
          </h2>
        </div>
        {data && (
          <a
            className="play-week-link"
            href="/brain/#play-week"
            onClick={() => reachGoal(PLAY_GOALS.weekOpen, { source: "home" })}
          >
            <span>Эта неделя</span>
            <strong>
              {Math.min(data.goal.completedDays, data.goal.days)} /{" "}
              {data.goal.days} <span>дня</span>
            </strong>
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
      {data?.streak && (
        <a className="today-streak" href="/leaderboard/?game=streak">
          <StreakFlame active={data.streak.current > 0} />
          {data.streak.current > 0
            ? `${streakDays(data.streak.current)} подряд`
            : "Зажги свою серию"}
          {data.streak.playedToday && <span> · сегодня ✓</span>}
        </a>
      )}
      {loading && !data ? (
        <div className="play-choices play-choices-loading" role="status">
          <span>Подбираем игры…</span>
        </div>
      ) : (
        <div className="play-choices">
          <Choice item={primary} />
          <Choice item={secondary} secondary />
        </div>
      )}
      {error && (
        <button className="text-button play-refresh" onClick={refresh}>
          Обновить рекомендации
        </button>
      )}
    </section>
  );
}
