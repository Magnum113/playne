import { describe, expect, it } from "vitest";
import { hsvToHex, newShadeSession, parseShadeSession, ROUND_COUNT, shadePhase, shadeReducer, shadeScore, shadeTotal, SHADE_COLORS, randomTargets, type ShadeSession } from "../src/colorfle";
const red = { h: 0, s: 100, v: 100 };
const blue = { h: 240, s: 100, v: 100 };
describe("Оттенок", () => {
  it("offers 150 distinct colors and excludes recent parties until the pool is exhausted", () => {
    const hex = SHADE_COLORS.map(hsvToHex);
    expect(new Set(hex).size).toBe(150);
    const recent: string[] = [];
    for (let i = 0; i < 30; i++) {
      const next = randomTargets(Math.random, recent).map(hsvToHex);
      expect(new Set(next).size).toBe(5);
      expect(next.some(c => recent.includes(c))).toBe(false);
      recent.unshift(...next);
    }
    const next = randomTargets(Math.random, recent).map(hsvToHex);
    expect(next.some(c => recent.slice(0,5).includes(c))).toBe(false);
    expect(randomTargets(() => .2)).not.toEqual(randomTargets(() => .8));
  });
  it("automatically ends timed rounds including untouched ones and counts the party once", () => {
    let state = shadeReducer(newShadeSession(undefined, Math.random, "timed"), { type: "start" });
    state = shadeReducer(state, { type: "submit", expired: true });
    expect(state.answers[0]).toMatchObject({score:0,timedOut:true,noChoice:true});
    expect(shadeReducer(state, { type: "submit", expired:true })).toBe(state);
    expect(parseShadeSession(JSON.stringify(state))).toEqual(state);
    for (let i=1; i<5; i++) {
      state = shadeReducer(state,{type:"next"});
      state = shadeReducer(state,{type:"pick", color:state.targets[i]});
      state = shadeReducer(state,{type:"submit",expired:true});
    }
    expect(shadeTotal(state)).toBe(400);
    const classic = shadeReducer(shadeReducer(state,{type:"menu"}),{type:"mode",mode:"classic"});
    expect(classic.stats.best).toBe(0);
    const timed = shadeReducer(classic,{type:"mode",mode:"timed"});
    expect(timed.stats).toEqual({best:400,played:1});
  });
  it("converts the palette coordinates to the color the player sees", () => {
    expect(hsvToHex(red)).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 100, v: 100 })).toBe("#00ff00");
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe("#000000");
  });
  it("gives an exact match 100 and a distant choice less", () => {
    expect(shadeScore(red, red)).toBe(100);
    expect(shadeScore(blue, red)).toBeLessThan(50);
  });
  it("reconciles an expired answer with the server's last choice and corrects the local record", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    let state: ShadeSession = {...newShadeSession(undefined, Math.random, "timed"), rankedId:id, targets:Array(5).fill(red)};
    state = shadeReducer(state,{type:"start"});
    for(let i=0;i<5;i++) {
      state = shadeReducer(state,{type:"pick",color:red});
      state = shadeReducer(state,{type:"submit",expired:true});
      if(i<4) state = shadeReducer(state,{type:"next"});
    }
    expect(state.stats.best).toBe(500);
    state = shadeReducer(state,{type:"verified",index:4,id,answer:{choice:null,score:0,timedOut:true}});
    expect(state.stats).toEqual({best:400,played:1});
    expect(parseShadeSession(JSON.stringify(state))).toEqual(state);
    expect(shadeReducer(state,{type:"verified",index:4,id:"another-run",answer:{choice:red,score:100}})).toBe(state);
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
