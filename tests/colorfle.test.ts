import { describe, expect, it } from "vitest";
import { hsvToHex, newShadeSession, parseShadeSession, ROUND_COUNT, shadePhase, shadeReducer, shadeScore, shadeTotal } from "../src/colorfle";
const red = { h: 0, s: 100, v: 100 };
const blue = { h: 240, s: 100, v: 100 };
describe("Оттенок", () => {
  it("converts the palette coordinates to the color the player sees", () => {
    expect(hsvToHex(red)).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 100, v: 100 })).toBe("#00ff00");
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe("#000000");
  });
  it("gives an exact match 100 and a distant choice less", () => {
    expect(shadeScore(red, red)).toBe(100);
    expect(shadeScore(blue, red)).toBeLessThan(50);
  });
  it("plays five rounds, reveals each submitted choice, and saves one record", () => {
    let state = { ...newShadeSession(), targets: Array(ROUND_COUNT).fill(red) };
    state = shadeReducer(state, { type: "start" });
    expect(shadePhase(state)).toBe("picking");
    for (let i = 0; i < ROUND_COUNT; i++) {
      expect(shadeReducer(state, { type: "submit" })).toBe(state);
      state = shadeReducer(state, { type: "pick", color: red });
      state = shadeReducer(state, { type: "submit" });
      expect(state.answers[i].score).toBe(100);
      if (i < ROUND_COUNT - 1) {
        expect(shadePhase(state)).toBe("reveal");
        expect(shadeReducer(state, { type: "submit" })).toBe(state);
        state = shadeReducer(state, { type: "next" });
      }
    }
    expect(shadePhase(state)).toBe("finished");
    expect(shadeTotal(state)).toBe(500);
    expect(state.stats).toEqual({ played: 1, best: 500 });
    expect(parseShadeSession(JSON.stringify(state))).toEqual(state);
    expect(shadeReducer(state, { type: "submit" })).toBe(state);
  });
  it("rejects corrupt saved answers and old game state", () => {
    expect(parseShadeSession('{"version":1}')).toBeNull();
    const state = newShadeSession();
    expect(parseShadeSession(JSON.stringify({ ...state, round: 4 }))).toBeNull();
    expect(parseShadeSession(JSON.stringify({ ...state, targets: [red] }))).toBeNull();
  });
});
