import { gameNames, resultText, type GameId } from "./account";
import { brainGames } from "./brainContent";

export type AccountBest = { game: GameId; mode: string; score: number };

function RankArrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10h12m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The same scoreboard is used in the account and the design system. */
export function AccountBests({ best }: { best?: AccountBest[] }) {
  if (!best) return <p role="status">Загружаем результаты…</p>;
  const score = (game: GameId, mode: string) => {
    const value = best.find((b) => b.game === game && b.mode === mode);
    return value ? resultText(game, value.score) : null;
  };
  const result = (text: string | null) =>
    text === null ? (
      <span className="account-best-empty">Нет результата</span>
    ) : (
      <strong className="account-best-score">{text}</strong>
    );
  const row = (game: GameId, mode: string, label: string, context = "") => {
    const text = score(game, mode);
    return (
      <a
        className="account-best-row"
        href={`/leaderboard/?game=${game}&mode=${mode}&period=all`}
        aria-label={`${gameNames[game]}. ${context ? context + ". " : ""}${label}. ${text ?? "Нет результата"}. Открыть рейтинг`}
      >
        <span className="account-best-mode">{label}</span>
        {result(text)}
        <RankArrow />
      </a>
    );
  };
  return (
    <div className="account-bests">
      {(["naglaz", "circle", "pressure"] as const).map((game) => {
        const text = score(game, "classic");
        return (
          <a
            className="account-best-card account-best-card--single"
            key={game}
            href={`/leaderboard/?game=${game}&mode=classic&period=all`}
            aria-label={`${gameNames[game]}. ${text ?? "Нет результата"}. Открыть рейтинг`}
          >
            <span className="account-best-title">{gameNames[game]}</span>
            <span className="account-best-footer">
              {result(text)}
              <RankArrow />
            </span>
          </a>
        );
      })}
      <section
        className="account-best-card account-best-card--modes"
        aria-label="Результаты игры Оттенок"
      >
        <h3 className="account-best-title">Оттенок</h3>
        <div className="account-best-groups account-best-groups--shade">
          {row("colorfle", "classic", "Без таймера")}
          {row("colorfle", "timed", "На время")}
        </div>
      </section>
      <section
        className="account-best-card account-best-card--modes"
        aria-label="Результаты игры Одной линией"
      >
        <h3 className="account-best-title">Одной линией</h3>
        <div className="account-best-groups account-best-groups--shade">
          {row("line", "classic", "Задача дня")}
          {row("line", "practice", "Практика")}
        </div>
      </section>
      <section
        className="account-best-card account-best-card--modes"
        aria-label="Результаты игры Где я?"
      >
        <h3 className="account-best-title">Где я?</h3>
        <div className="account-best-groups">
          {(
            [
              ["classic", "timed", "Без перемещения"],
              ["moving", "moving-timed", "С перемещением"],
              ["landmarks", "landmarks-timed", "Достопримечательности"],
            ] as const
          ).map(([classic, timed, title]) => (
            <div className="account-best-group" key={classic}>
              <h4>{title}</h4>
              {row("geo", classic, "Без таймера", title)}
              {row("geo", timed, "На время", title)}
            </div>
          ))}
        </div>
      </section>
      <section
        className="account-best-card account-best-card--modes account-best-brain"
        aria-label="Результаты разминки для ума"
      >
        <h3 className="account-best-title">Разминка для ума</h3>
        <p className="account-best-brain-caption">
          Лучшие задачи дня. Практика сохраняется в истории.
        </p>
        <div className="account-best-groups account-best-groups--shade">
          {brainGames.map((game) => (
            <div key={game.id}>{row(game.id, "classic", game.name)}</div>
          ))}
        </div>
        <a className="account-best-brain-total" href="/leaderboard/?game=brain">
          Рейтинг разминки{" "}
          <strong>
            {Math.floor(
              brainGames.reduce(
                (total, game) =>
                  total +
                  (best.find(
                    (record) =>
                      record.game === game.id && record.mode === "classic",
                  )?.score ?? 0),
                0,
              ) / 2,
            ).toLocaleString("ru-RU")}{" "}
            / 1000
          </strong>
          <RankArrow />
        </a>
      </section>
    </div>
  );
}
