import { GameHeader } from "./SiteHeader";
import ChallengeResultPage from "./ChallengeResultPage";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "./account";
import {
  challengePath,
  type ChallengeGame,
  type PublicChallenge,
} from "./challenges";
import type { ServerRun } from "./rankedQueue";
import ChallengeContext from "./ChallengeContext";

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
    const complete = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.game !== game || detail?.token !== token) return;
      api<ServerRun>(`/games/${encodeURIComponent(detail.id)}`)
        .then((run) => {
          if (
            active &&
            run.game === game &&
            run.completed &&
            run.challenge.comparisonToken === token
          )
            setState((previous) => ({ ...previous, run }));
        })
        .catch(() => {
          /* A reload can still recover the saved result. */
        });
    };
    window.addEventListener("playne:challenge-completed", complete);
    return () => {
      active = false;
      window.removeEventListener("playne:challenge-completed", complete);
    };
  }, [game, token]);
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
      <div className="app challenge-page">
        <GameHeader />
        <main className="challenge-results-main">
          <section className="challenge-results-panel">
            <p role="alert">{state.error}</p>
            <a href={challengePath(game)}>Открыть обычную игру →</a>
          </section>
        </main>
      </div>
    );
  if (!state.reference)
    return (
      <div className="app challenge-page">
        <GameHeader />
        <main className="challenge-results-main">
          <section className="challenge-results-panel" role="status">
            Загружаем вызов…
          </section>
        </main>
      </div>
    );
  if (state.run)
    return <ChallengeResultPage reference={state.reference} run={state.run} />;
  return (
    <>
      <div className="other-challenge-banner">
        <ChallengeContext game={game} token={token} />
      </div>
      {children}
    </>
  );
}
