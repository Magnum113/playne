export const CHALLENGE_GAMES = ["line", "flash", "rotate", "slide", "dispatch"] as const;
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
  maxScore: 500;
  day: string;
  mode: "classic" | "practice";
  isTodayDaily: boolean;
};

export type ChallengeStart =
  | { kind: "daily"; mode: "classic"; reference: PublicChallenge }
  | { kind: "comparison"; mode: "practice"; version: 1; challenge: any; reference: PublicChallenge };
