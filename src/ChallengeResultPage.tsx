import { useEffect, useRef } from "react";
import { GameHeader } from "./SiteHeader";
import {
  challengePath,
  challengeRetryPath,
  type PublicChallenge,
} from "./challenges";
import type { ServerRun } from "./rankedQueue";
import { reachGoal, SHARE_GOALS, trackChallengeResult } from "./analytics";
import ChallengeComparison from "./ChallengeComparison";
import ShareResult from "./ShareResult";
import FooterLinks from "./FooterLinks";
import GameResultLayout from "./GameResultLayout";
import "./challenge.css";

export default function ChallengeResultPage({
  reference,
  run,
}: {
  reference: PublicChallenge;
  run: ServerRun;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    trackChallengeResult(
      run.id,
      reference.game,
      run.score ?? 0,
      reference.score,
    );
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [run.id, run.score, reference.game, reference.score]);
  const score = run.score ?? 0;
  const title =
    score > reference.score
      ? "Ты впереди!"
      : score === reference.score
        ? "Ничья"
        : "Друг впереди";
  return (
    <div className="app challenge-page">
      <GameHeader />
      <main className="challenge-results-main" id="challenge-results-main">
        <a className="challenge-game-link" href={challengePath(reference.game)}>
          ← {reference.gameName}
        </a>
        <GameResultLayout game={reference.game} mode={reference.mode}>
          <section
            className="challenge-results-panel"
            aria-labelledby="challenge-result-title"
          >
            <p className="eyebrow">ВЫЗОВ ДРУГА</p>
            <h1 id="challenge-result-title" tabIndex={-1} ref={heading}>
              {title}
            </h1>
            <ChallengeComparison reference={reference} score={score} />
            <div className="challenge-result-actions">
              <a
                className="primary"
                href={challengeRetryPath(reference, run.id)}
                onClick={() =>
                  reachGoal(SHARE_GOALS.retryClicked, { game: reference.game })
                }
              >
                Попробовать ещё <span aria-hidden="true">↻</span>
              </a>
              <ShareResult runId={run.id} />
            </div>
            <p className="challenge-retry-note">
              Те же задания. Новая попытка.
            </p>
          </section>
        </GameResultLayout>
      </main>
      <FooterLinks />
    </div>
  );
}
