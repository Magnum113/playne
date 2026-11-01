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
  it.each([2, 3] as const)(
    "does not restart a completed v%s attempt or resurrect its save over current data",
    (version) => {
      const active = {
        id: crypto.randomUUID(),
        kind: "level",
        key: "1",
        actions: makeFlowPuzzle("level", 1, version).solution.map((lane) => ({
          type: "launch",
          lane,
        })),
      };
      localStorage.setItem(
        `playne:flow:v${version}:guest`,
        JSON.stringify({ version, active, records: {}, pending: [active] }),
      );
      expect(readFlowSave("guest").active).toBeNull();
      expect(readFlowSave("guest").pending[0]).toEqual({ ...active, version });
      const current = readFlowSave("guest");
      current.records = { "level:2": { score: 1000, stars: 3 } };
      writeFlowSave("guest", current);
      expect(readFlowSave("guest").records).toEqual(current.records);
      expect(validFlowAttempt({ ...active, version: 99 })).toBe(false);
    },
  );
  it("prefers v3 progress and preserves the exact versions of mixed pending results", () => {
    const active = {
      id: crypto.randomUUID(),
      version: 3,
      kind: "level",
      key: "21",
      actions: [
        { type: "launch", lane: makeFlowPuzzle("level", 21, 3).solution[0] },
      ],
    };
    const pending = ([2, 3] as const).map((version) => ({
      id: crypto.randomUUID(),
      version,
      kind: "level",
      key: "2",
      actions: makeFlowPuzzle("level", 2, version).solution.map((lane) => ({
        type: "launch",
        lane,
      })),
    }));
    const previous = JSON.stringify({
      version: 3,
      records: {
        "level:1": { score: 1000, stars: 3 },
        "daily:2026-11-01": { score: 1000, stars: 3 },
      },
      active,
      pending,
      motion: false,
    });
    localStorage.setItem("playne:flow:v3:guest", previous);
    localStorage.setItem(
      "playne:flow:v2:guest",
      JSON.stringify({
        version: 2,
        records: { "level:20": { score: 1000, stars: 3 } },
      }),
    );
    const upgraded = readFlowSave("guest");
    expect(upgraded.records).toEqual({ "level:1": { score: 1000, stars: 3 } });
    expect(upgraded.active).toMatchObject({
      version: FLOW_VERSION,
      kind: "level",
      key: "21",
      actions: [],
    });
    expect(upgraded.active?.id).not.toBe(active.id);
    expect(upgraded.pending).toEqual(pending);
    expect(upgraded.pending.every(validFlowAttempt)).toBe(true);
    expect(upgraded.motion).toBe(false);
    expect(localStorage.getItem("playne:flow:v3:guest")).toBe(previous);
    expect(writeFlowSave("guest", upgraded)).toBe(true);
    expect(readFlowSave("guest").pending).toEqual(pending);
  });
  it.each([2, 3] as const)(
    "preserves a version %s challenge stored inside a v3 container",
    (version) => {
      const token = "z".repeat(43),
        scope = `challenge:${token}:guest`;
      const active = {
        id: crypto.randomUUID(),
        version,
        kind: "level",
        key: "3",
        challengeToken: token,
        actions: [],
      };
      localStorage.setItem(
        `playne:flow:v3:${scope}`,
        JSON.stringify({ version: 3, active, records: {}, pending: [] }),
      );
      const migrated = readFlowSave(scope);
      expect(migrated.active).toEqual(active);
      expect(migrated.restartedForUpgrade).toBeUndefined();
      expect(validFlowAttempt(migrated.active)).toBe(true);
    },
  );
  it("does not resurrect older v2 data over a newer empty v3 guest snapshot", () => {
    localStorage.setItem(
      "playne:flow:v3:guest",
      JSON.stringify({
        version: 3,
        records: {},
        active: null,
        pending: [],
        motion: true,
      }),
    );
    localStorage.setItem(
      "playne:flow:v2:guest",
      JSON.stringify({
        version: 2,
        records: { "level:1": { score: 1000, stars: 3 } },
      }),
    );
    expect(readFlowSave("guest").records).toEqual({});
    expect(readFlowSave("guest").active).toBeNull();
  });
});
