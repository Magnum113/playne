import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_RECIPES,
  COLORFLE_KEY,
  PALETTE,
  PLAYABLE_RECIPES,
  colorHints,
  colorOutcome,
  colorReducer,
  colorShareText,
  colorSimilarity,
  loadColorSession,
  mixture,
  newColorSession,
  parseColorSession,
  saveColorSession,
  validRecipe,
  type ColorSession,
  type Recipe,
} from "../src/colorfle";
const playing = (): ColorSession => ({
  ...newColorSession(undefined, () => 0),
  secret: [0, 4, 7],
  started: true,
});
function submit(state: ColorSession, recipe: Recipe): ColorSession {
  return colorReducer(colorReducer(state, { type: "reuse", recipe }), {
    type: "submit",
  });
}
describe("color mixing and puzzles", () => {
  it("has 504 ordered recipes and only unambiguous target colors", () => {
    expect(ALL_RECIPES).toHaveLength(504);
    expect(PLAYABLE_RECIPES.length).toBeGreaterThan(450);
    for (const recipe of PLAYABLE_RECIPES) {
      expect(validRecipe(recipe)).toBe(true);
      expect(
        ALL_RECIPES.filter((r) => mixture(r) === mixture(recipe)),
      ).toHaveLength(1);
      expect(colorSimilarity(recipe, recipe)).toBe(100);
    }
  });
  it("mixes the RGB channels with 50/30/20 weights", () => {
    expect(mixture([0, 4, 7])).toBe("#bc979c");
    expect(mixture([4, 0, 7])).not.toBe(mixture([0, 4, 7]));
  });
  it("keeps similarity below 100 for wrong recipes", () => {
    for (const r of ALL_RECIPES)
      if (r.join() !== "0,4,7") {
        expect(colorSimilarity(r, [0, 4, 7])).toBeLessThan(100);
        expect(colorSimilarity(r, [0, 4, 7])).toBeGreaterThanOrEqual(0);
      }
  });
  it("never repeats the previous target and always uses three distinct colors", () => {
    for (const random of [() => 0, () => 0.5, () => 1]) {
      const a = newColorSession(undefined, random),
        b = newColorSession(a, random);
      expect(b.secret).not.toEqual(a.secret);
      expect(validRecipe(b.secret)).toBe(true);
    }
  });
  it("distinguishes exact positions, correct colors in other positions, and absent colors", () => {
    expect(colorHints([0, 7, 3], [0, 4, 7])).toEqual([
      "exact",
      "present",
      "absent",
    ]);
    expect(colorHints([7, 0, 4], [0, 4, 7])).toEqual([
      "present",
      "present",
      "present",
    ]);
  });
});
describe("game lifecycle", () => {
  it("selects a color, moves to an empty slot and swaps already selected colors", () => {
    let s = playing();
    s = colorReducer(s, { type: "choose", color: 0 });
    expect(s.draft).toEqual([0, null, null]);
    expect(s.active).toBe(1);
    s = colorReducer(s, { type: "choose", color: 4 });
    s = colorReducer(s, { type: "choose", color: 7 });
    s = colorReducer(s, { type: "slot", slot: 0 });
    s = colorReducer(s, { type: "choose", color: 7 });
    expect(s.draft).toEqual([7, 4, 0]);
    s = colorReducer(s, { type: "remove" });
    expect(s.draft).toEqual([null, 4, 0]);
  });
  it("does not spend an attempt on incomplete or repeated recipes", () => {
    const s = playing();
    expect(colorReducer(s, { type: "submit" })).toBe(s);
    const first = submit(s, [0, 1, 2]);
    const repeated = submit(first, [0, 1, 2]);
    expect(repeated.guesses).toHaveLength(1);
  });
  it("preserves confirmed positions and supports reusing an earlier guess", () => {
    const first = submit(playing(), [0, 7, 3]);
    expect(first.draft).toEqual([0, null, null]);
    expect(first.active).toBe(1);
    expect(
      colorReducer(first, { type: "reuse", recipe: first.guesses[0] }).draft,
    ).toEqual([0, 7, 3]);
  });
  it("ends a win once, updates statistics and starts a fresh playable puzzle", () => {
    const win = submit(submit(playing(), [1, 2, 3]), [0, 4, 7]);
    expect(colorOutcome(win)).toBe("won");
    expect(win.stats).toEqual({ played: 1, wins: 1, best: 2 });
    expect(colorReducer(win, { type: "submit" })).toBe(win);
    expect(colorReducer(win, { type: "choose", color: 1 })).toBe(win);
    const next = colorReducer(win, {
      type: "new",
      session: newColorSession(win, () => 0.4),
    });
    expect(next.stats).toEqual(win.stats);
    expect(next.guesses).toHaveLength(0);
    expect(next.started).toBe(true);
    expect(next.secret).not.toEqual(win.secret);
    const secondWin = submit(next, next.secret);
    expect(secondWin.stats).toEqual({ played: 2, wins: 2, best: 1 });
  });
  it("ends a loss after six tries, allows a win on the sixth, and prevents resetting active progress", () => {
    let s = playing();
    expect(colorReducer(s, { type: "new", session: newColorSession() })).toBe(
      s,
    );
    for (const r of ALL_RECIPES.slice(0, 5)) s = submit(s, r);
    const lastWin = submit(s, s.secret);
    expect(colorOutcome(lastWin)).toBe("won");
    expect(lastWin.stats.best).toBe(6);
    const lost = submit(s, ALL_RECIPES[5]);
    expect(colorOutcome(lost)).toBe("lost");
    expect(lost.stats).toEqual({ played: 1, wins: 0, best: null });
    expect(submit(lost, lost.secret)).toBe(lost);
  });
  it("rejects invalid palette IDs and duplicated colors", () => {
    const s = playing();
    expect(colorReducer(s, { type: "choose", color: PALETTE.length })).toBe(s);
    expect(colorReducer(s, { type: "reuse", recipe: [0, 0, 1] })).toBe(s);
  });
});
describe("progress and sharing", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("restores unfinished drafts and completed results without double-counting", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    });
    let s = submit(playing(), [0, 3, 4]);
    s = colorReducer(s, { type: "choose", color: 7 });
    saveColorSession(s);
    expect(loadColorSession()).toEqual(s);
    const win = submit(s, s.secret);
    saveColorSession(win);
    expect(loadColorSession().stats.wins).toBe(1);
    expect(
      colorReducer(loadColorSession(), { type: "submit" }).stats.wins,
    ).toBe(1);
    expect(values.has(COLORFLE_KEY)).toBe(true);
  });
  it("rejects corrupt storage and remains playable when storage is unavailable", () => {
    for (const raw of [
      "bad",
      "null",
      "{}",
      JSON.stringify({ ...playing(), secret: [0, 0, 0] }),
      JSON.stringify({ ...playing(), draft: [0, 0, null] }),
      JSON.stringify({ ...playing(), stats: { played: 0, wins: 1, best: 1 } }),
    ])
      expect(parseColorSession(raw)).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(validRecipe(loadColorSession().secret)).toBe(true);
    expect(() => saveColorSession(playing())).not.toThrow();
  });
  it("shares feedback and result without revealing the recipe", () => {
    const text = colorShareText(submit(playing(), [0, 4, 7]));
    expect(text).toContain("Собрал за 1 из 6");
    expect(text).toContain("🟩🟩🟩");
    expect(text).toContain("https://playne.ru/colorfle/");
    for (const color of PALETTE) expect(text).not.toContain(color.name);
  });
});
