import { SaveResult as Status, type RankedRun, type GameId } from "./account";
import ShareResult from "./ShareResult";
import ChallengeContext from "./ChallengeContext";
export function SaveResult({
  run,
  game,
  hideShare = false,
}: {
  run: RankedRun;
  game: GameId;
  hideShare?: boolean;
}) {
  const token =
    typeof window === "undefined"
      ? undefined
      : new URLSearchParams(window.location.search).get("challenge") ||
        undefined;
  const complete = ["complete", "saved", "save-error"].includes(
    run.state.status,
  );
  return (
    <>
      {token && complete && (
        <ChallengeContext
          game={game}
          token={token}
          completed
          runId={run.state.id}
          score={run.state.score}
          comparisonToken={run.comparisonToken}
        />
      )}
      {complete && !hideShare && <ShareResult runId={run.state.id} />}
      {token && complete ? (
        <p className="save-result">
          Сравнение сохранено. Результат не меняет рейтинг.
        </p>
      ) : (
        <Status run={run} game={game} />
      )}
    </>
  );
}
