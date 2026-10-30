import { brainGames } from "./brainContent";

export type RandomGameChoice = { name: string; href: string };

/** The same public start screens offered by the homepage catalog. */
export const randomGameChoices: readonly RandomGameChoice[] = [
  { name: "На глаз", href: "/naglaz/" },
  { name: "Круг", href: "/circle/" },
  { name: "Оттенок", href: "/colorfle/" },
  { name: "Где я?", href: "/geo/" },
  { name: "Достопримечательности", href: "/geo/?mode=landmarks" },
  { name: "Жми", href: "/pressure/" },
  { name: "Одной линией", href: "/one-line/" },
  ...brainGames.map(({ name, path }) => ({ name, href: path })),
];

export function chooseRandomGame(
  previousHref?: string | null,
  random: () => number = Math.random,
): RandomGameChoice {
  const choices = randomGameChoices.filter(({ href }) => href !== previousHref);
  const draw = random();
  const index = Number.isFinite(draw)
    ? Math.max(0, Math.min(choices.length - 1, Math.floor(draw * choices.length)))
    : 0;
  return choices[index];
}
