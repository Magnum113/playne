import { describe, expect, it } from "vitest";
import { createPerceptionTasks, evaluatePerception, perceptionDay, PERCEPTION_KINDS } from "../src/perception";

describe("Приметь: daily stimuli and accuracy", () => {
  it("is stable per day and varies all five tasks over a full year", () => {
    const seen = PERCEPTION_KINDS.map(() => new Set<string>());
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
      const tasks = createPerceptionTasks(day);
      expect(tasks).toEqual(createPerceptionTasks(day));
      expect(tasks.map(t => t.kind)).toEqual([...PERCEPTION_KINDS]);
      tasks.forEach((t, index) => seen[index].add(JSON.stringify(t)));
      for (const t of tasks) {
        if (t.kind === "count") {
          expect(t.dots.length).toBeGreaterThanOrEqual(42);
          expect(t.dots.length).toBeLessThanOrEqual(82);
          expect(t.dots.every(p => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1)).toBe(true);
        }
        if (t.kind === "track") expect(t.startX + t.travel).toBeGreaterThan(0);
        if (t.kind === "track") expect(t.startX + t.travel).toBeLessThan(1);
      }
    }
    for (const set of seen) expect(set.size).toBeGreaterThan(15);
  });
  it("changes on Moscow midnight, independent of local browser timezone", () => {
    expect(perceptionDay(new Date("2026-11-12T20:59:59.999Z"))).toBe("2026-11-12");
    expect(perceptionDay(new Date("2026-11-12T21:00:00.000Z"))).toBe("2026-11-13");
  });
  it("gives 100 only to exact answers and reduces nearby and far guesses", () => {
    const tasks = createPerceptionTasks("2026-11-12");
    for (const t of tasks) {
      if (t.kind === "tempo") continue;
      const value = t.kind === "count" ? t.dots.length : t.kind === "angle" ? t.target : t.kind === "track" ? t.startX + t.travel : t.fromRight ? 1-t.fraction : t.fraction;
      const near = t.kind === "count" ? value + 1 : t.kind === "angle" ? value + 1 : value + .002;
      const far = t.kind === "count" ? 140 : t.kind === "angle" ? (value + 120) % 360 : value > .5 ? 0 : 1;
      expect(evaluatePerception(t, { value }).score).toBe(100);
      expect(evaluatePerception(t, { value: near }).score).toBeLessThan(100);
      expect(evaluatePerception(t, { value: far }).score).toBeLessThan(evaluatePerception(t, { value: near }).score);
      expect(evaluatePerception(t, { skipped: true }).score).toBe(0);
      expect(() => evaluatePerception(t, { value: NaN })).toThrow();
    }
  });
  it("scores rhythm by timing and rejects nonsequential/incomplete taps", () => {
    const t = { kind: "tempo", bpm: 100, cues: 4, beats: 8 } as const;
    const taps = Array.from({ length: 8 }, (_, i) => 800 + (4+i)*600);
    expect(evaluatePerception(t, { taps }).score).toBe(100);
    expect(evaluatePerception(t, { taps: taps.map(v => v+200) }).score).toBeLessThan(50);
    expect(() => evaluatePerception(t, { taps: [100, 200] })).toThrow();
    expect(() => evaluatePerception(t, { taps: taps.slice().reverse() })).toThrow();
    expect(() => evaluatePerception(t, { taps: [...taps.slice(0,7), Infinity] })).toThrow();
  });
});
