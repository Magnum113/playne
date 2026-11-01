// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  flowUnlocked,
  mergeFlowRecords,
  readFlowSave,
  validFlowAttempt,
  writeFlowSave,
} from "../src/flowStorage";
beforeEach(() => localStorage.clear());
describe("Рой: durable local progress", () => {
  it("survives corrupt saves and rejects corrupt game logs", () => {
    localStorage.setItem("playne:flow:v2:guest", "{oops");
    expect(readFlowSave("guest").active).toBeNull();
    expect(
      validFlowAttempt({
        id: crypto.randomUUID(),
        kind: "level",
        key: "1",
        actions: [{ type: "undo" }],
      }),
    ).toBe(false);
  });
  it("restores a valid active attempt and keeps accounts separate", () => {
    const save = readFlowSave("guest");
    save.active = {
      id: crypto.randomUUID(),
      kind: "level",
      key: "1",
      actions: [],
    };
    expect(writeFlowSave("guest", save)).toBe(true);
    expect(readFlowSave("guest").active).toEqual(save.active);
    expect(readFlowSave("other-player").active).toBeNull();
  });
  it("merges best records without unlocking gaps or trusting invalid stars", () => {
    const records = mergeFlowRecords(
      { "level:1": { score: 900, stars: 2 } },
      {
        "level:1": { score: 800, stars: 3 },
        "level:3": { score: 1000, stars: 3 },
        "level:37": { score: 1000, stars: 3 },
        "level:2": { score: Infinity, stars: 3 },
      },
    );
    expect(records["level:1"]).toEqual({ score: 900, stars: 2 });
    expect(records["level:37"]).toBeUndefined();
    expect(flowUnlocked(records)).toBe(2);
  });
});
