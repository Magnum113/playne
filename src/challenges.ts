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
  "flow",
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
  flow?: {
    kind: "level" | "daily";
    key: string;
    stars: number;
    version?: 2 | 3 | 4;
  };
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
  game === "flow"
    ? "/swarm/"
    : game === "line"
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

export const challengeRetryPath = (reference: PublicChallenge, id: string) =>
  `${challengePath(reference.game)}?challenge=${encodeURIComponent(reference.token)}&retry=${encodeURIComponent(id)}${["naglaz", "circle", "pressure", "flow"].includes(reference.game) ? "" : "&mode=" + encodeURIComponent(reference.mode)}`;

export function challengeTask(data: PublicChallenge) {
  return data.flow
    ? data.flow.kind === "level"
      ? `Уровень ${data.flow.key}`
      : `Рой дня · ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(new Date(`${data.flow.key}T12:00:00Z`))}`
    : data.isTodayDaily
      ? "Сегодняшняя задача дня"
      : "Те же задания";
}
