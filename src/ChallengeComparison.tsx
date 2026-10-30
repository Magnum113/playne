import { challengeScore, type PublicChallenge } from "./challenges";

export default function ChallengeComparison({
  reference,
  score,
}: {
  reference: PublicChallenge;
  score: number;
}) {
  const maximum = reference.maxScore || Math.max(score, reference.score, 1);
  return (
    <div
      className={`challenge-scores challenge-scores-${reference.game}`}
      aria-label="Сравнение результатов"
    >
      {[
        { name: "Ты", value: score, kind: "you" },
        {
          name: reference.nickname || "Друг",
          value: reference.score,
          kind: "friend",
        },
      ].map((player) => (
        <article
          key={player.kind}
          className={`challenge-player challenge-player-${player.kind}`}
        >
          <span className="challenge-player-name" title={player.name}>
            {player.name}
          </span>
          <strong className="challenge-player-score">
            {challengeScore({ ...reference, score: player.value })}
          </strong>
          <div
            className="challenge-score-track"
            role="meter"
            aria-label={player.name}
            aria-valuemin={0}
            aria-valuemax={maximum}
            aria-valuenow={player.value}
            aria-valuetext={challengeScore({
              ...reference,
              score: player.value,
            })}
          >
            <span
              style={{
                width: `${Math.max(0, Math.min(100, (player.value / maximum) * 100))}%`,
              }}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
