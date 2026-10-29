export const OVERALL_GAME_POINTS = 1000;
export const PRESSURE_HALF_POINTS_LEVEL = 50;
export const OVERALL_VERSION = 2;
export const OVERALL_GAMES = [
  { id: "naglaz", name: "На глаз" },
  { id: "circle", name: "Круг" },
  { id: "colorfle", name: "Оттенок" },
  { id: "geo", name: "Где я?" },
  { id: "pressure", name: "Жми" },
  { id: "line", name: "Одной линией" },
] as const;
export const OVERALL_MAX_POINTS = OVERALL_GAMES.length * OVERALL_GAME_POINTS;
export type OverallGame = (typeof OVERALL_GAMES)[number]["id"];
export type OverallContribution = {
  game: OverallGame;
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
  game: "overall";
  period: "all";
  version: number;
  page: number;
  limit: number;
  total: number;
  entries: OverallEntry[];
  mine: OverallEntry | null;
};
export const overallNumber = (value: number) => value.toLocaleString("ru-RU");
