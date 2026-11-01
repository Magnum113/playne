import { describe, expect, it } from "vitest";
import {
  flowAllocateDocks,
  flowDockRemaining,
  type FlowDockTeam,
} from "../src/flowDockLayout";
import type { FlowPacket } from "../src/flow";

const team = (
  id: number,
  slot: number,
  left = 7,
  link?: string,
): FlowDockTeam => ({
  id,
  slot,
  left,
  color: id % 7,
  ...(link ? { link } : {}),
});
const pair: FlowPacket[] = [
  { id: 20, color: 0, count: 7, link: "new-pair" },
  { id: 21, color: 1, count: 9, link: "new-pair" },
];
const positions = (teams: FlowDockTeam[]) =>
  Object.fromEntries(teams.map((item) => [item.id, item.slot]));

describe("physical docks keep linked boxes together", () => {
  it("closes fragmented holes so a new pair occupies neighbouring slots", () => {
    const existing = [team(1, 0), team(2, 2, 11), team(3, 4, 5)];
    const snapshot = structuredClone(existing);
    const result = flowAllocateDocks(existing, pair, 5)!;
    expect(result.slots).toEqual([3, 4]);
    expect(positions(result.teams)).toEqual({ 1: 0, 2: 1, 3: 2, 20: 3, 21: 4 });
    expect(result.teams.find((item) => item.id === 2)?.left).toBe(11);
    expect(result.teams.slice(-2).map((item) => item.link)).toEqual([
      "new-pair",
      "new-pair",
    ]);
    expect(existing).toEqual(snapshot);
  });

  it("keeps an existing pair adjacent while moving other boxes out of its way", () => {
    const existing = [
      team(1, 0, 0, "old-pair"),
      team(2, 1, 8, "old-pair"),
      team(3, 3, 4),
    ];
    const result = flowAllocateDocks(existing, pair, 5)!;
    expect(result.slots).toEqual([3, 4]);
    const oldPair = result.teams.filter((item) => item.link === "old-pair");
    expect(oldPair.map((item) => item.slot)).toEqual([0, 1]);
    expect(oldPair.map((item) => item.left)).toEqual([0, 8]);
    expect(result.teams.find((item) => item.id === 3)?.slot).toBe(2);
  });

  it("uses an already adjacent gap without moving any current team", () => {
    const existing = [
      team(1, 0),
      team(2, 3, 8, "old-pair"),
      team(3, 4, 2, "old-pair"),
    ];
    const result = flowAllocateDocks(existing, pair, 5)!;
    expect(result.slots).toEqual([1, 2]);
    expect(result.teams.slice(0, existing.length)).toEqual(existing);
    expect(positions(result.teams)).toEqual({ 1: 0, 2: 3, 3: 4, 20: 1, 21: 2 });
  });

  it("holds a delivered half at zero until its linked partner has also delivered", () => {
    const existing = [
      team(1, 0, 2, "old-pair"),
      team(2, 1, 7, "old-pair"),
      team(3, 3, 1),
    ];
    const halfway = flowDockRemaining(existing, { 1: 2, 2: 3, 3: 1 });
    expect(halfway.map((item) => [item.id, item.left, item.slot])).toEqual([
      [1, 0, 0],
      [2, 4, 1],
    ]);
    expect(flowDockRemaining(existing, { 1: 2, 2: 7, 3: 1 })).toEqual([]);
    expect(existing.map((item) => item.left)).toEqual([2, 7, 1]);
  });

  it("releases completed pairs independently, even when another pair still works", () => {
    const existing = [
      team(1, 0, 1, "done-pair"),
      team(2, 1, 2, "done-pair"),
      team(3, 2, 3, "busy-pair"),
      team(4, 3, 4, "busy-pair"),
    ];
    expect(
      flowDockRemaining(existing, { 1: 1, 2: 2, 3: 3, 4: 2 }).map((item) => [
        item.id,
        item.left,
      ]),
    ).toEqual([
      [3, 0],
      [4, 2],
    ]);
  });

  it("does not admit a pair into one free slot, including a held completed half", () => {
    const held = flowDockRemaining(
      [
        team(1, 0, 2, "old-pair"),
        team(2, 1, 7, "old-pair"),
        team(3, 2),
        team(4, 4),
      ],
      { 1: 2 },
    );
    expect(held).toHaveLength(4);
    expect(flowAllocateDocks(held, pair, 5)).toBeNull();
  });

  it("puts a single command into a free hole without compacting other boxes", () => {
    const existing = [team(1, 0), team(2, 2), team(3, 4)];
    const result = flowAllocateDocks(
      existing,
      [{ id: 30, color: 3, count: 7 }],
      5,
    )!;
    expect(result.slots).toEqual([1]);
    expect(result.teams.slice(0, existing.length)).toEqual(existing);
    expect(positions(result.teams)).toEqual({ 1: 0, 2: 2, 3: 4, 30: 1 });
  });
});
