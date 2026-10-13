import { chooseRounds, objects, pairs } from "../src/data";
import { score } from "../src/game";
import { evaluateCircle } from "../src/circle";
import { randomTargets, shadeScore, validHSV } from "../src/colorfle";
import { chooseGeoRounds, distanceKm, geoScore, validPoint } from "../src/geo";
export const GAME_NAMES = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
} as const;
export type GameId = keyof typeof GAME_NAMES;
export const isGame = (v: unknown): v is GameId =>
  typeof v === "string" && Object.hasOwn(GAME_NAMES, v);
export const SCORE_VERSION = 1;
export function makeChallenge(game: GameId, recent: string[] = []) {
  if (game === "naglaz")
    return { pairIds: chooseRounds(recent).map((p) => p.id) };
  if (game === "colorfle") return { targets: randomTargets() };
  if (game === "geo") return { places: chooseGeoRounds(recent), panoramas: {} };
  return {};
}
export function publicChallenge(game: GameId, challenge: any) {
  if (game === "geo") return { places: challenge.places };
  return challenge;
}
export function validateAnswer(
  game: GameId,
  challenge: any,
  index: number,
  input: any,
) {
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
    if (!validHSV(input?.choice) || !challenge.targets[index])
      throw new Error("Некорректный цвет");
    return {
      choice: input.choice,
      score: shadeScore(input.choice, challenge.targets[index]),
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
  const actual = challenge.panoramas?.[index]?.actual;
  if (!actual || !input?.guess || !validPoint(input.guess))
    throw new Error("Некорректная точка");
  const distance = distanceKm(input.guess, actual);
  return {
    guess: { lat: input.guess.lat, lng: input.guess.lng },
    actual,
    distance,
    score: geoScore(distance),
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
    /^\/(?:account|naglaz|circle|colorfle|geo|leaderboard)\/(?:\?claim=[0-9a-f-]{36})?$/.test(
      value,
    )
    ? value
    : "/account/";
}
