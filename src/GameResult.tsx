import { SaveResult as Status, type RankedRun, type GameId } from "./account";
import NextGame from "./NextGame";
import ShareResult from "./ShareResult";
import ChallengeContext from "./ChallengeContext";
import { hasResultRecommendation } from "./resultRecommendation";
export function SaveResult({
  run,
  game,
  hideShare = false,
  day,
}: {
  run: RankedRun;
  game: GameId;
  hideShare?: boolean;
  day?: string;
}) {
  const token =
    typeof window === "undefined"
      ? undefined
      : new URLSearchParams(window.location.search).get("challenge") ||
        undefined;
  const complete = ["complete", "saved", "save-error"].includes(
    run.state.status,
  );
  const card = hasResultRecommendation(game);
  return (
    <>
      {token && complete && game !== "flow" && (
        <ChallengeContext
          game={game}
          token={token}
          completed
          runId={run.state.id}
          score={run.state.score}
          comparisonToken={run.comparisonToken}
        />
      )}
      {token && complete ? (
        <p className="save-result">
          Сравнение сохранено. Результат не меняет рейтинг.
        </p>
      ) : (
        <Status run={run} game={game} day={day} />
      )}
      {card && <NextGame game={game} runId={run.state.id} />}
      {complete && !hideShare && <ShareResult runId={run.state.id} />}
      {complete && !card && <NextGame game={game} />}
    </>
  );
}
