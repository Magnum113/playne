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
  it("uses the last server-accepted color after timeout and cannot improve the score late", () => {
    const red = { h: 0, s: 100, v: 100 },
      blue = { h: 240, s: 100, v: 100 };
    const challenge = {
      mode: "timed",
      targets: [red],
      timers: { 0: { deadline: 1000, choice: blue } },
    };
    expect(
      validateAnswer("colorfle", challenge, 0, { choice: red }, 999).score,
    ).toBe(100);
    expect(
      validateAnswer(
        "colorfle",
        challenge,
        0,
        { choice: red, expired: true },
        1000,
      ),
    ).toMatchObject({ choice: blue, timedOut: true });
    expect(
      validateAnswer(
        "colorfle",
        { ...challenge, timers: { 0: { deadline: 1000 } } },
        0,
        { choice: red },
        1001,
      ),
    ).toEqual({ choice: null, score: 0, timedOut: true });
    expect(() =>
      validateAnswer(
        "colorfle",
        challenge,
        0,
        { choice: red, expired: true },
        999,
      ),
    ).toThrow("Время ещё");
    expect(() =>
      validateAnswer(
        "colorfle",
        { ...challenge, timers: {} },
        0,
        { choice: red },
        999,
      ),
    ).toThrow("Таймер ещё");
  });
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
    ).toBeLessThan(500);
    expect(() =>
      validateAnswer("geo", { places: [], panoramas: {} }, 0, {
        guess: { lat: 0, lng: 0 },
      }),
    ).toThrow();
  });
  it("uses the server's last accepted pin on timeout and scores an unanswered timeout zero", () => {
    const panorama = {
      actual: { lat: 0, lng: 0 },
      deadline: 1000,
      pin: { lat: 0, lng: 0 },
    };
    const c = {
      mode: "timed",
      places: [{ name: "Test" }],
      panoramas: { 0: panorama },
    };
    expect(
      validateAnswer(
        "geo",
        c,
        0,
        { guess: { lat: 60, lng: 100 }, expired: true },
        1001,
      ).score,
    ).toBe(100);
    expect(() => validateAnswer("geo", c, 0, { expired: true }, 999)).toThrow(
      "Время ещё",
    );
    const noPin = {
      ...c,
      panoramas: { 0: { actual: { lat: 0, lng: 0 }, deadline: 1000 } },
    };
    expect(
      validateAnswer("geo", noPin, 0, { guess: { lat: 0, lng: 0 } }, 1001),
    ).toMatchObject({ score: 0, guess: null, distance: null, timedOut: true });
    expect(
      validateAnswer(
        "geo",
        { places: [{}], panoramas: { 0: { actual: { lat: 0, lng: 0 } } } },
        0,
        { guess: { lat: 0, lng: 0 } },
        0,
        1,
      ).score,
    ).toBe(100);
  });
  it("scores the landmark itself and requires a verified panorama before accepting answers", () => {
    for (const mode of ["landmarks", "landmarks-timed"] as const) {
      const challenge = makeChallenge("geo", [], mode) as any;
      expect(challenge.places.every((p: any) => p.id.startsWith("lm-"))).toBe(
        true,
      );
      const object = {
        lat: challenge.places[0].lat,
        lng: challenge.places[0].lng,
      };
      const camera = { lat: object.lat + 0.1, lng: object.lng };
      expect(() =>
        validateAnswer("geo", challenge, 0, { guess: object }),
      ).toThrow("Панорама не проверена");
      challenge.panoramas[0] = { actual: camera, deadline: 1000, pin: object };
      expect(
        validateAnswer("geo", challenge, 0, { guess: object }, 999),
      ).toMatchObject({ score: 100, actual: object, distance: 0 });
      expect(
        validateAnswer(
          "geo",
          challenge,
          0,
          { guess: camera, actual: camera, score: 100 },
          999,
        ).score,
      ).toBeLessThan(100);
      if (mode === "landmarks-timed") {
        expect(
          validateAnswer(
            "geo",
            challenge,
            0,
            { guess: camera, expired: true },
            1001,
          ),
        ).toMatchObject({
          score: 100,
          actual: object,
          guess: object,
          timedOut: true,
        });
      }
    }
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

describe("strict shade scale on the server", () => {
  it("does not accept a client's claimed high score for a visibly different color", () => {
    const target = { h: 210, s: 30, v: 98 };
    const answer = validateAnswer("colorfle", { targets: [target] }, 0, {
      choice: { ...target, v: 93 },
      score: 100,
    });
    expect(answer.score).toBe(77);
  });
});
