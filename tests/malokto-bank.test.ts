import { describe, expect, it } from "vitest";
import { evaluateMalokto, MALOKTO_BANK_START, MALOKTO_PACKS, maloktoPack, normalizeRareAnswer } from "../server/malokto-bank";

describe("Мало кто — ежедневный банк", () => {
  it("contains 30 different packs of five unique prompts and unambiguous aliases", () => {
    expect(MALOKTO_PACKS).toHaveLength(30);
    const prompts = new Set<string>();
    for (const pack of MALOKTO_PACKS) {
      expect(pack).toHaveLength(5);
      expect(new Set(pack.map(task => task.category)).size).toBe(5);
      for (const task of pack) {
        expect(prompts.has(task.prompt), task.prompt).toBe(false);
        prompts.add(task.prompt);
        expect(task.answers.length, task.prompt).toBeGreaterThanOrEqual(2);
        const map = new Map<string, string>();
        for (const answer of task.answers) {
          expect([25, 45, 70, 100]).toContain(answer.score);
          for (const alias of [answer.name, ...answer.aliases]) {
            const key = normalizeRareAnswer(alias);
            expect(key, task.prompt).not.toBe("");
            expect(map.get(key) ?? answer.name, `${task.prompt}: ${alias}`).toBe(answer.name);
            map.set(key, answer.name);
            expect(evaluateMalokto(task, 1000, alias, 2000)).toMatchObject({ name: answer.name, score: answer.score });
          }
        }
        expect(Math.max(...task.answers.map(answer => answer.score)), task.prompt).toBe(100);
      }
    }
    expect(prompts.size).toBe(150);
    expect(maloktoPack(MALOKTO_BANK_START, MALOKTO_BANK_START)).toEqual(MALOKTO_PACKS[0]);
    expect(maloktoPack("2026-12-23", MALOKTO_BANK_START)).toBeUndefined();
  });

  it("accepts Cyrillic case, ё and dash variants without merging distinct letters", () => {
    const names = MALOKTO_PACKS[0][1];
    expect(evaluateMalokto(names, 0, "  ё ", 1000).name).toBe("Ё");
    expect(evaluateMalokto(names, 0, "е", 1000).name).toBe("Е");
    const geo = MALOKTO_PACKS.flat().find(task => task.answers.some(answer => answer.name === "Коста-Рика"))!;
    expect(evaluateMalokto(geo, 0, " КОСТА — РИКА ", 1000).name).toBe("Коста-Рика");
  });

  it("rejects unknown and empty answers before the deadline and returns zero after it", () => {
    const task = MALOKTO_PACKS[0][0];
    expect(() => evaluateMalokto(task, 0, "Москва", 29999)).toThrow("Попробуй другой");
    expect(() => evaluateMalokto(task, 0, null, 29999)).toThrow("Введи один ответ");
    expect(evaluateMalokto(task, 0, "Бразилия", 30000)).toEqual({ name: null, score: 0, elapsedMs: 30000 });
  });
});
