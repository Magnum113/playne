// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  flowUnlocked,
  mergeFlowRecords,
  readFlowSave,
  validFlowAttempt,
  writeFlowSave,
} from "../src/flowStorage";
import { FLOW_VERSION, makeFlowPuzzle } from "../src/flow";
beforeEach(() => localStorage.clear());
describe("Рой: durable local progress", () => {
  it("survives corrupt saves and rejects corrupt game logs", () => {
    localStorage.setItem(`playne:flow:v${FLOW_VERSION}:guest`, "{oops");
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
  it("upgrades campaign progress without interpreting an old in-flight log as a new board", () => {
    const active = {
      id: crypto.randomUUID(),
      kind: "level",
      key: "4",
      actions: [
        { type: "launch", lane: makeFlowPuzzle("level", 4, 2).solution[0] },
      ],
    };
    const pending = {
      id: crypto.randomUUID(),
      kind: "level",
      key: "3",
      actions: makeFlowPuzzle("level", 3, 2).solution.map((lane) => ({
        type: "launch",
        lane,
      })),
    };
    const original = JSON.stringify({
      version: 2,
      records: {
        "level:1": { score: 1000, stars: 3 },
        "level:2": { score: 900, stars: 2 },
        "daily:2026-11-01": { score: 1000, stars: 3 },
      },
      active,
      pending: [pending],
      motion: false,
    });
    localStorage.setItem("playne:flow:v2:guest", original);
    const upgraded = readFlowSave("guest");
    expect(upgraded.version).toBe(FLOW_VERSION);
    expect(upgraded.records).toEqual({
      "level:1": { score: 1000, stars: 3 },
      "level:2": { score: 900, stars: 2 },
    });
    expect(upgraded.active).toMatchObject({
      version: FLOW_VERSION,
      kind: "level",
      key: "4",
      actions: [],
    });
    expect(upgraded.active?.id).not.toBe(active.id);
    expect(upgraded.restartedForUpgrade).toBe(true);
    expect(upgraded.pending).toEqual([{ ...pending, version: 2 }]);
    expect(upgraded.motion).toBe(false);
    expect(localStorage.getItem("playne:flow:v2:guest")).toBe(original);
    expect(writeFlowSave("guest", upgraded)).toBe(true);
    expect(readFlowSave("guest").active).toEqual(upgraded.active);
    expect(readFlowSave("guest").restartedForUpgrade).toBeUndefined();
    expect(readFlowSave("other-player").records).toEqual({});
  });
  it("preserves a token-scoped legacy comparison and completed pending logs exactly", () => {
    const token = "x".repeat(43),
      scope = `challenge:${token}:guest`;
    const active = {
      id: crypto.randomUUID(),
      challengeToken: token,
      kind: "level",
      key: "12",
      actions: [],
    };
    const original = JSON.stringify({
      version: 2,
      records: {},
      active,
      pending: [],
      motion: true,
    });
    localStorage.setItem(`playne:flow:v2:${scope}`, original);
    const migrated = readFlowSave(scope);
    expect(migrated.active).toEqual({ ...active, version: 2 });
    expect(migrated.restartedForUpgrade).toBeUndefined();
    expect(validFlowAttempt(migrated.active)).toBe(true);
    expect(readFlowSave(`challenge:${"y".repeat(43)}:guest`).active).toBeNull();
    expect(localStorage.getItem(`playne:flow:v2:${scope}`)).toBe(original);
  });
  it("does not restart a completed legacy attempt or resurrect an obsolete save over current data", () => {
    const active = {
      id: crypto.randomUUID(),
      kind: "level",
      key: "1",
      actions: makeFlowPuzzle("level", 1, 2).solution.map((lane) => ({
        type: "launch",
        lane,
      })),
    };
    localStorage.setItem(
      "playne:flow:v2:guest",
      JSON.stringify({ version: 2, active, records: {}, pending: [active] }),
    );
    expect(readFlowSave("guest").active).toBeNull();
    expect(readFlowSave("guest").pending[0]).toEqual({ ...active, version: 2 });
    const current = readFlowSave("guest");
    current.records = { "level:2": { score: 1000, stars: 3 } };
    writeFlowSave("guest", current);
    expect(readFlowSave("guest").records).toEqual(current.records);
    expect(validFlowAttempt({ ...active, version: 99 })).toBe(false);
  });
});
