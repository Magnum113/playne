import { describe, it, expect } from "vitest";
import {
  makeChallenge,
  validateAnswer,
  scoreUnits,
  initialNickname,
  validNickname,
  safeReturn,
} from "../server/scoring";
import { pairs, objects } from "../src/data";
describe("server-owned results", () => {
  it("ignores claimed points and recalculates size and color answers", () => {
    const challenge = makeChallenge("naglaz") as any;
    const pair = pairs.find((p) => p.id === challenge.pairIds[0])!;
    const guess = objects[pair.reference].size * 0.15;
    expect(
      validateAnswer("naglaz", challenge, 0, { guess, score: 100 }).score,
    ).not.toBe(100);
    expect(() =>
      validateAnswer("naglaz", challenge, 0, { guess: 1e20 }),
    ).toThrow();
    const colors = makeChallenge("colorfle") as any;
    expect(
      validateAnswer("colorfle", colors, 0, {
        choice: colors.targets[0],
        score: 0,
      }).score,
    ).toBe(100);
    expect(() =>
      validateAnswer("colorfle", colors, 0, {
        choice: { h: NaN, s: 50, v: 50 },
      }),
    ).toThrow();
  });
  it("accepts a valid circle but rejects fabricated scalar scores and invalid strokes", () => {
    const points = Array.from({ length: 361 }, (_, i) => ({
      x: 300 + 150 * Math.cos((i * Math.PI) / 180),
      y: 300 + 150 * Math.sin((i * Math.PI) / 180),
    }));
    expect(validateAnswer("circle", {}, 0, { points, score: 0 }).score).toBe(
      100,
    );
    expect(() => validateAnswer("circle", {}, 0, { score: 100 })).toThrow();
    expect(() =>
      validateAnswer("circle", {}, 0, {
        points: [
          { x: Infinity, y: 300 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
        ],
      }),
    ).toThrow();
    expect(scoreUnits([{ score: 99.9 }])).toBe(999);
  });
  it("uses verified panorama coordinates rather than coordinates in a submitted answer", () => {
    const c = {
      places: [{ name: "Test" }],
      panoramas: { 0: { actual: { lat: 0, lng: 0 } } },
    };
    expect(
      validateAnswer("geo", c, 0, {
        guess: { lat: 40, lng: 100 },
        actual: { lat: 40, lng: 100 },
        score: 100,
      }).score,
    ).toBeLessThan(5);
    expect(() =>
      validateAnswer("geo", { places: [], panoramas: {} }, 0, {
        guess: { lat: 0, lng: 0 },
      }),
    ).toThrow();
  });
  it("validates nickname text and return destinations", () => {
    expect(initialNickname({ last_name: "Иванов", first_name: "Иван" })).toBe(
      "Иванов Иван",
    );
    expect(initialNickname({})).toBe("Игрок");
    expect(validNickname("  Мой   ник ")).toBe("Мой ник");
    for (const n of [
      "x",
      "<script>",
      "https://spam.test",
      "a".repeat(41),
      "abc\u202e",
    ])
      expect(() => validNickname(n)).toThrow();
    for (const p of [
      "https://evil.test",
      "//evil.test",
      "/account/?return=https://evil.test",
      "/api/auth/yandex/callback",
    ])
      expect(safeReturn(p)).toBe("/account/");
    expect(
      safeReturn("/account/?claim=12345678-1234-1234-1234-123456789abc"),
    ).toContain("?claim=");
  });
});
