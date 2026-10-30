import { useEffect, useRef } from "react";
import { GameHeader } from "./SiteHeader";
import {
  challengePath,
  challengeRetryPath,
  type PublicChallenge,
} from "./challenges";
import type { ServerRun } from "./rankedQueue";
import ChallengeComparison from "./ChallengeComparison";
import ShareResult from "./ShareResult";
import FooterLinks from "./FooterLinks";
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
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [run.id]);
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
            <a className="primary" href={challengeRetryPath(reference, run.id)}>
              Попробовать ещё <span aria-hidden="true">↻</span>
            </a>
            <ShareResult runId={run.id} />
          </div>
          <p className="challenge-retry-note">Те же задания. Новая попытка.</p>
        </section>
      </main>
      <FooterLinks />
    </div>
  );
}
