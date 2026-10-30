export const CHALLENGE_GAMES = [
  "line",
  "flash",
  "rotate",
  "slide",
  "dispatch",
  "naglaz",
  "circle",
  "colorfle",
  "geo",
  "pressure",
] as const;
export type ChallengeGame = (typeof CHALLENGE_GAMES)[number];

/** Only the one result explicitly shared by its player is public. */
export type PublicChallenge = {
  token: string;
  url: string;
  imageUrl: string;
  game: ChallengeGame;
  gameName: string;
  nickname: string;
  score: number;
  maxScore: number;
  day: string;
  mode: import("./account").GameMode;
  isTodayDaily: boolean;
};

export type ChallengeStart =
  | { kind: "daily"; mode: "classic"; reference: PublicChallenge }
  | {
      kind: "comparison";
      mode: import("./account").GameMode;
      version: number;
      challenge: any;
      reference: PublicChallenge;
    };

export const challengePath = (game: ChallengeGame) =>
  game === "line"
    ? "/one-line/"
    : ["flash", "rotate", "slide", "dispatch"].includes(game)
      ? `/brain/${game}/`
      : `/${game}/`;
export const challengeScore = (
  data: Pick<PublicChallenge, "game" | "score" | "maxScore">,
) =>
  data.game === "circle"
    ? `${String(data.score).replace(".", ",")}%`
    : data.game === "pressure"
      ? `${data.score} очков`
      : `${data.score} / ${data.maxScore}`;
