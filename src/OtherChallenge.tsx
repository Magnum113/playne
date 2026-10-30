import { useEffect, useState, type ReactNode } from "react";
import { api } from "./account";
import {
  challengePath,
  challengeScore,
  type ChallengeGame,
  type PublicChallenge,
} from "./challenges";
import type { ServerRun } from "./rankedQueue";
import ChallengeContext from "./ChallengeContext";
import ShareResult from "./ShareResult";

export default function OtherChallenge({
  game,
  children,
}: {
  game: ChallengeGame;
  children: ReactNode;
}) {
  const [token] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("challenge"),
  );
  const [state, setState] = useState<{
    reference?: PublicChallenge;
    run?: ServerRun;
    error?: string;
  }>({});
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const reference = await api<PublicChallenge>(
          `/challenges/${encodeURIComponent(token)}`,
        );
        if (reference.game !== game)
          throw Error("Вызов относится к другой игре.");
        const params = new URLSearchParams(window.location.search);
        const id = params.get("result");
        let run: ServerRun | undefined;
        if (id) {
          run = await api<ServerRun>(`/games/${encodeURIComponent(id)}`);
          if (
            run.game !== game ||
            !run.completed ||
            run.challenge.comparisonToken !== token
          )
            throw Error("Для сравнения нужны те же задания.");
        }
        params.set("mode", reference.mode);
        if (active) {
          window.history.replaceState(
            null,
            "",
            challengePath(game) + "?" + params,
          );
          setState({ reference, run });
        }
      } catch (e) {
        if (active) setState({ error: (e as Error).message });
      }
    })();
    return () => {
      active = false;
    };
  }, [token, game]);
  if (!token) return <>{children}</>;
  if (state.error)
    return (
      <main className="community-panel other-challenge-result">
        <p role="alert">{state.error}</p>
        <a href={challengePath(game)}>Открыть обычную игру →</a>
      </main>
    );
  if (!state.reference)
    return (
      <main className="community-panel other-challenge-result" role="status">
        Загружаем вызов…
      </main>
    );
  if (state.run)
    return (
      <main className="community-panel other-challenge-result">
        <h1>{state.reference.gameName}</h1>
        <p className="challenge-result-score">
          {challengeScore({ ...state.reference, score: state.run.score ?? 0 })}
        </p>
        <ChallengeContext
          game={game}
          token={token}
          completed
          score={state.run.score}
          comparisonToken={state.run.challenge.comparisonToken}
        />
        <ShareResult runId={state.run.id} />
        <p>
          <a href={challengePath(game)}>Играть ещё →</a>
        </p>
      </main>
    );
  return (
    <>
      <div className="other-challenge-banner">
        <ChallengeContext game={game} token={token} />
      </div>
      {children}
    </>
  );
}
