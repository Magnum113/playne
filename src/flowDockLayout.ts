import type { FlowPacket } from "./flow";

export type FlowDockTeam = {
  id: number;
  color: number;
  left: number;
  slot: number;
  link?: string;
};

/** A completed half still occupies its dock until the other half is delivered. */
export function flowDockRemaining(
  teams: readonly FlowDockTeam[],
  delivered: Readonly<Record<number, number>> = {},
) {
  const remaining = teams.map((team) => ({
    ...team,
    left: Math.max(0, team.left - (delivered[team.id] ?? 0)),
  }));
  const workingLinks = new Set(
    remaining
      .filter((team) => team.left > 0 && team.link)
      .map((team) => team.link),
  );
  return remaining.filter(
    (team) => team.left > 0 || (team.link && workingLinks.has(team.link)),
  );
}

/** Prefer a free adjacent pair; compact the old boxes only when holes are split. */
export function flowAllocateDocks(
  teams: readonly FlowDockTeam[],
  packets: readonly FlowPacket[],
  count: number,
) {
  if (
    !packets.length ||
    packets.length > 2 ||
    teams.length + packets.length > count
  )
    return null;
  const occupied = new Set(teams.map((team) => team.slot));
  let slots: number[] = [];
  for (let at = 0; at <= count - packets.length; at++) {
    const candidate = Array.from({ length: packets.length }, (_, i) => at + i);
    if (candidate.every((slot) => !occupied.has(slot))) {
      slots = candidate;
      break;
    }
  }
  let existing = [...teams];
  if (!slots.length) {
    existing = [...teams]
      .sort((a, b) => a.slot - b.slot)
      .map((team, slot) => ({ ...team, slot }));
    slots = packets.map((_, i) => existing.length + i);
  }
  return {
    slots,
    teams: [
      ...existing,
      ...packets.map((packet, index) => ({
        id: packet.id,
        color: packet.color,
        left: packet.count,
        link: packet.link,
        slot: slots[index],
      })),
    ],
  };
}
