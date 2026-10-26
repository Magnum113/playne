import {
  makePressDeck,
  replayPressRun,
  appendPressBatch,
  replayEndlessPressRun,
  PRESSURE_RULES_VERSION,
} from "../src/pressure";
import { chooseRounds, legacyPairIds, objects, pairs } from "../src/data";
import { score } from "../src/game";
import { evaluateCircle } from "../src/circle";
import {
  randomTargets,
  shadeScore,
  validHSV,
  SHADE_SCORE_VERSION,
} from "../src/colorfle";
import {
  chooseGeoRounds,
  distanceKm,
  geoScore,
  geoFrom5000,
  geoWholeRound,
  validPoint,
  validGeoMode,
  geoIsTimed,
  geoIsLandmarks,
  type GeoMode,
} from "../src/geo";
export const GAME_NAMES = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
  pressure: "Жми",
} as const;
export type GameId = keyof typeof GAME_NAMES;
export const isGame = (v: unknown): v is GameId =>
  typeof v === "string" && Object.hasOwn(GAME_NAMES, v);
export const SCORE_VERSION = 1;
export const scoreVersion = (game: GameId) =>
  game === "geo"
    ? 4
    : game === "colorfle"
      ? SHADE_SCORE_VERSION
      : SCORE_VERSION;
// Convert old rounds into tenths before summing, so displayed rounds match the total.
export const GEO_V3_UNITS_SQL = `CASE WHEN game='geo' AND version=2 THEN (SELECT coalesce(sum(CASE WHEN (a->>'score')::numeric >= 5000 THEN 1000 ELSE LEAST(999,round((a->>'score')::numeric/5)) END),0)::integer FROM jsonb_array_elements(answers) AS a) ELSE score_units END`;
export const GEO_V4_UNITS_SQL = `CASE WHEN game='geo' AND version IN(2,3) THEN (SELECT coalesce(sum(CASE WHEN (a->>'score')::numeric >= CASE WHEN version=2 THEN 5000 ELSE 100 END THEN 1000 ELSE LEAST(99,round((a->>'score')::numeric/CASE WHEN version=2 THEN 50 ELSE 1 END))*10 END),0)::integer FROM jsonb_array_elements(answers) AS a) ELSE score_units END`;
export function geoProjection(run: any, viewerVersion: number) {
  if (
    run.game !== "geo" ||
    !(
      (viewerVersion === 3 && run.version === 2) ||
      (viewerVersion === 4 && [2, 3].includes(run.version))
    )
  )
    return run;
  const answers = run.answers.map((a: any) => ({
    ...a,
    score:
      viewerVersion === 4
        ? geoWholeRound(a.score, run.version)
        : geoFrom5000(a.score),
  }));
  return {
    ...run,
    version: viewerVersion,
    answers,
    score_units: run.score_units === null ? null : scoreUnits(answers),
  };
}
export function makeChallenge(
  game: GameId,
  recent: string[] = [],
  mode: GeoMode = "classic",
  supportedPairIds: readonly string[] = legacyPairIds,
  pressureRulesVersion = 1,
) {
  if (game === "pressure") {
    if (pressureRulesVersion === PRESSURE_RULES_VERSION) {
      const seed = Math.floor(Math.random() * 4294967296);
      const avoid = recent.slice(0, 90);
      return {
        seed,
        recent: avoid,
        rulesVersion: PRESSURE_RULES_VERSION,
        levels: appendPressBatch(seed, [], avoid),
      };
    }
    // Already open older clients may finish their original thirty-level run.
    return { levels: makePressDeck(Math.random, recent) };
  }
  if (game === "naglaz")
    return { pairIds: chooseRounds(recent, supportedPairIds).map((p) => p.id) };
  if (game === "colorfle")
    return { targets: randomTargets(Math.random, recent), mode, timers: {} };
  if (game === "geo")
    return {
      places: chooseGeoRounds(recent, Math.random, mode),
      panoramas: {},
      mode,
    };
  return {};
}
export function publicChallenge(game: GameId, challenge: any) {
  if (game === "geo")
    return {
      places: challenge.places,
      mode: validGeoMode(challenge.mode) ? challenge.mode : "classic",
    };
  return challenge;
}
export function validateAnswer(
  game: GameId,
  challenge: any,
  index: number,
  input: any,
  now = Date.now(),
  version = 4,
) {
  if (game === "pressure") {
    if (index !== 0) throw new Error("Некорректная попытка");
    if (challenge.rulesVersion === PRESSURE_RULES_VERSION)
      return replayEndlessPressRun(
        challenge.seed,
        challenge.recent,
        input?.rounds,
      );
    return replayPressRun(challenge.levels, input?.rounds);
  }
  if (game === "naglaz") {
    const pair = pairs.find((p) => p.id === challenge.pairIds[index]);
    if (
      !pair ||
      !Number.isFinite(input?.guess) ||
      input.guess <= 0 ||
      input.guess > 1e7
    )
      throw new Error("Некорректный размер");
    const ratio = input.guess / objects[pair.reference].size;
    if (ratio < 0.14999 || ratio > 1.65001)
      throw new Error("Размер вне диапазона");
    return {
      guess: input.guess,
      pairId: pair.id,
      score: score(input.guess, objects[pair.target].size),
    };
  }
  if (game === "colorfle") {
    if (!challenge.targets[index]) throw new Error("Некорректный цвет");
    const timed = challenge.mode === "timed";
    const timer = challenge.timers?.[index];
    if (timed && !Number.isFinite(timer?.deadline))
      throw new Error("Таймер ещё не запущен");
    const timedOut = timed && now >= timer.deadline;
    if (input?.expired && !timedOut) throw new Error("Время ещё не истекло");
    const choice = timedOut ? (timer.choice ?? null) : input?.choice;
    if (choice === null && timedOut)
      return { choice: null, score: 0, timedOut: true };
    if (!validHSV(choice)) throw new Error("Некорректный цвет");
    return {
      choice,
      score: shadeScore(choice, challenge.targets[index]),
      ...(timed ? { timedOut } : {}),
    };
  }
  if (game === "circle") {
    const pts = input?.points;
    if (
      !Array.isArray(pts) ||
      pts.length < 3 ||
      pts.length > 12000 ||
      pts.some(
        (p) =>
          !p ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 2 ||
          p.x > 598 ||
          p.y < 2 ||
          p.y > 598,
      )
    )
      throw new Error("Некорректная линия");
    const result = evaluateCircle(pts);
    if (!result.valid) throw new Error(result.message);
    return { score: result.score };
  }
  const panorama = challenge.panoramas?.[index];
  if (!panorama?.actual) throw new Error("Панорама не проверена");
  const actual = geoIsLandmarks(challenge.mode)
    ? { lat: challenge.places[index].lat, lng: challenge.places[index].lng }
    : panorama.actual;
  const timed = geoIsTimed(challenge.mode);
  if (timed && !Number.isFinite(panorama.deadline))
    throw new Error("Таймер ещё не запущен");
  const timedOut = timed && now >= panorama.deadline;
  if (input?.expired && !timedOut) throw new Error("Время ещё не истекло");
  const guess = timedOut ? (panorama.pin ?? null) : input?.guess;
  if (guess === null && timedOut)
    return {
      guess: null,
      actual,
      distance: null,
      score: 0,
      timedOut: true,
      location: challenge.places[index],
    };
  if (!guess || !validPoint(guess)) throw new Error("Некорректная точка");
  const distance = distanceKm(guess, actual);
  const points =
    version === 1
      ? distance <= 0.25
        ? 100
        : Math.min(99, Math.round(100 * Math.exp(-distance / 2000)))
      : version === 2
        ? distance <= 0.25
          ? 5000
          : Math.min(4999, Math.round(5000 * Math.exp(-distance / 2000)))
        : version === 3
          ? distance <= 0.25
            ? 100
            : geoFrom5000(
                Math.min(4999, Math.round(5000 * Math.exp(-distance / 2000))),
              )
          : geoScore(distance);
  return {
    guess: { lat: guess.lat, lng: guess.lng },
    actual,
    distance,
    score: points,
    timedOut,
    location: challenge.places[index],
  };
}
export function scoreUnits(answers: any[]) {
  return Math.round(answers.reduce((s, a) => s + a.score, 0) * 10);
}
export function validNickname(value: unknown) {
  if (typeof value !== "string") throw new Error("Укажи ник");
  const nick = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    [...nick].length < 2 ||
    [...nick].length > 40 ||
    /[<>\p{Cc}\p{Cf}]/u.test(nick) ||
    /https?:\/\/|www\./i.test(nick)
  )
    throw new Error("Ник: от 2 до 40 символов, без ссылок и служебных знаков");
  return nick;
}
export function initialNickname(profile: any) {
  const full =
    [profile.last_name, profile.first_name]
      .filter((x) => typeof x === "string" && x.trim())
      .join(" ") ||
    profile.real_name ||
    profile.display_name ||
    "Игрок";
  try {
    return validNickname([...String(full)].slice(0, 40).join(""));
  } catch {
    return "Игрок";
  }
}
export function safeReturn(value: unknown) {
  return typeof value === "string" &&
    /^\/(?:account|naglaz|circle|colorfle|geo|pressure|leaderboard)\/(?:\?(?:claim|saved)=[0-9a-f-]{36})?$/.test(
      value,
    )
    ? value
    : "/account/";
}
