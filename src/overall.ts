export const OVERALL_GAME_POINTS = 1000;
export const PRESSURE_HALF_POINTS_LEVEL = 50;
export const OVERALL_VERSION = 3;
export const OVERALL_GAMES = [
  { id: "naglaz", name: "На глаз" },
  { id: "circle", name: "Круг" },
  { id: "colorfle", name: "Оттенок" },
  { id: "geo", name: "Где я?" },
  { id: "pressure", name: "Жми" },
  { id: "line", name: "Одной линией" },
  { id: "brain", name: "Разминка для ума" },
] as const;
export const OVERALL_MAX_POINTS = OVERALL_GAMES.length * OVERALL_GAME_POINTS;
export type OverallGame = (typeof OVERALL_GAMES)[number]["id"];
export const BRAIN_RANK_GAMES = [
  { id: "flash", name: "Вспышка" },
  { id: "rotate", name: "Поворот" },
  { id: "slide", name: "Передвинь" },
  { id: "dispatch", name: "Диспетчер" },
] as const;
export type ContributionGame =
  OverallGame | (typeof BRAIN_RANK_GAMES)[number]["id"];
export type OverallContribution = {
  game: ContributionGame;
  mode: string;
  score: number;
  points: number;
};
export type OverallEntry = {
  nickname: string;
  score: number;
  place: number;
  gamesPlayed: number;
  contributions: OverallContribution[];
  isMe: boolean;
};
export type OverallBoard = {
  game: "overall" | "brain";
  period: "all";
  version: number;
  page: number;
  limit: number;
  total: number;
  entries: OverallEntry[];
  mine: OverallEntry | null;
};
export const overallNumber = (value: number) => value.toLocaleString("ru-RU");
