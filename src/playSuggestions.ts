import type { GameId } from "./account";
import { DAILY_PLAY_GAMES, type PlayProgress } from "./playProgress";

export const playCatalog: Record<
  GameId,
  { name: string; path: string; skill: string; hint: string }
> = {
  naglaz: {
    name: "На глаз",
    path: "/naglaz/",
    skill: "Глазомер",
    hint: "Пять неожиданных сравнений",
  },
  circle: {
    name: "Круг",
    path: "/circle/",
    skill: "Точность",
    hint: "Нарисуй свой лучший круг",
  },
  colorfle: {
    name: "Оттенок",
    path: "/colorfle/",
    skill: "Цвет",
    hint: "Поймай нужный оттенок",
  },
  geo: {
    name: "Где я?",
    path: "/geo/",
    skill: "География",
    hint: "Найди место по панораме",
  },
  pressure: {
    name: "Жми",
    path: "/pressure/",
    skill: "Реакция",
    hint: "Проверь чувство момента",
  },
  line: {
    name: "Одной линией",
    path: "/one-line/",
    skill: "Логика",
    hint: "Соедини числа по порядку",
  },
  flash: {
    name: "Вспышка",
    path: "/brain/flash/",
    skill: "Память",
    hint: "Запомни узор из клеток",
  },
  rotate: {
    name: "Поворот",
    path: "/brain/rotate/",
    skill: "Пространство",
    hint: "Поверни фигуру в уме",
  },
  slide: {
    name: "Передвинь",
    path: "/brain/slide/",
    skill: "Планирование",
    hint: "Освободи красному блоку выход",
  },
  dispatch: {
    name: "Диспетчер",
    path: "/brain/dispatch/",
    skill: "Внимание",
    hint: "Отправь поезда по станциям",
  },
};

export type PlaySuggestion = {
  game: GameId;
  href: string;
  label: string;
  action: string;
};
const isDaily = (game: GameId) =>
  (DAILY_PLAY_GAMES as readonly string[]).includes(game);
function dailyOrder(day: string) {
  const offset =
    Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000) %
    DAILY_PLAY_GAMES.length;
  return [
    ...DAILY_PLAY_GAMES.slice(offset),
    ...DAILY_PLAY_GAMES.slice(0, offset),
  ];
}
function suggestion(
  game: GameId,
  data?: PlayProgress,
  favorite = false,
): PlaySuggestion {
  const status = isDaily(game)
    ? data?.daily[game as keyof PlayProgress["daily"]]
    : undefined;
  return {
    game,
    href: playCatalog[game].path,
    label:
      status && !status.completed
        ? "Партия начата"
        : favorite
          ? "Для тебя"
          : isDaily(game)
            ? "Задача дня"
            : "Попробуй сегодня",
    action: status && !status.completed ? "Продолжить" : "Играть",
  };
}

export function nextDaily(
  data: PlayProgress,
  exclude?: GameId,
): PlaySuggestion | null {
  const ordered = dailyOrder(data.day).filter((game) => game !== exclude);
  const pending = ordered.find(
    (game) => data.daily[game] && !data.daily[game]!.completed,
  );
  const favorite = data.favorites.find(
    (item) =>
      ordered.includes(item.game as (typeof ordered)[number]) &&
      !data.daily[item.game as keyof PlayProgress["daily"]]?.completed,
  )?.game;
  const game =
    pending ?? favorite ?? ordered.find((game) => !data.daily[game]?.completed);
  return game ? suggestion(game, data, favorite === game) : null;
}

export function todaySuggestions(
  day: string,
  data?: PlayProgress,
): [PlaySuggestion, PlaySuggestion] {
  const pending =
    data &&
    dailyOrder(day).find(
      (game) => data.daily[game] && !data.daily[game]!.completed,
    );
  const favorite = data?.favorites.find(
    (item) =>
      !isDaily(item.game) ||
      !data?.daily[item.game as keyof PlayProgress["daily"]]?.completed,
  );
  const allDone =
    data && DAILY_PLAY_GAMES.every((game) => data.daily[game]?.completed);
  let primary: PlaySuggestion;
  if (allDone) {
    const game = data?.favorites[0]?.game ?? "naglaz";
    primary = {
      game,
      href: playCatalog[game].path + (isDaily(game) ? "?mode=practice" : ""),
      label: "Все задачи дня готовы",
      action: "Сыграть ещё",
    };
  } else if (pending) primary = suggestion(pending, data);
  else if (
    favorite &&
    (!isDaily(favorite.game) ||
      !data?.daily[favorite.game as keyof PlayProgress["daily"]]?.completed)
  )
    primary = suggestion(favorite.game, data, true);
  else if (data && nextDaily(data)) primary = nextDaily(data)!;
  else if (
    data &&
    DAILY_PLAY_GAMES.every((game) => data.daily[game]?.completed)
  )
    primary = {
      game: "naglaz",
      href: "/naglaz/",
      label: "Все задачи дня готовы",
      action: "Сыграть ещё",
    };
  else primary = suggestion(dailyOrder(day)[0], data);
  const secondary = data
    ? nextDaily(data, primary.game)
    : suggestion(dailyOrder(day).find((game) => game !== primary.game)!);
  return [
    primary,
    secondary ??
      suggestion(primary.game === "circle" ? "colorfle" : "circle", data),
  ];
}

export function playMilestone(data: PlayProgress["milestones"]): string | null {
  if (data.completedWeeks >= 4) return "Четыре недели с выполненной целью";
  if (data.tenDayMonths > 0) return "Десять дней игры за месяц";
  if (data.completedWeeks >= 1) return "Первая неделя с выполненной целью";
  return null;
}
