import type { CSSProperties } from "react";
import { FlowCrate } from "./FlowArt";
import { FLOW_COLORS } from "./flow";
import type { FlowDockTeam } from "./flowDockLayout";

export function FlowDocks({
  teams,
  count,
  working,
  launching,
  full,
  onSlot,
  closing = new Set<number>(),
}: {
  teams: FlowDockTeam[];
  count: number;
  working: ReadonlySet<number>;
  launching: ReadonlySet<number>;
  full: boolean;
  onSlot: (slot: number, element: HTMLDivElement | null) => void;
  closing?: ReadonlySet<number>;
}) {
  const pairs = new Map<string, FlowDockTeam[]>();
  for (const team of teams)
    if (team.link)
      pairs.set(team.link, [...(pairs.get(team.link) ?? []), team]);
  return (
    <div
      className={`flow-docks${full ? " is-full" : ""}`}
      role="group"
      aria-label={`Доки: ${count - teams.length} свободно из ${count}`}
      style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flow-dock flow-dock-base"
          ref={(element) => onSlot(i, element)}
          aria-hidden={teams.some((team) => team.slot === i) || undefined}
          aria-label={
            teams.some((team) => team.slot === i) ? undefined : "Свободный док"
          }
        />
      ))}
      {[...pairs].flatMap(([id, members]) => {
        if (members.length !== 2) return [];
        const pair = [...members].sort((a, b) => a.slot - b.slot),
          slot = pair[0].slot;
        return (
          <span
            key={id}
            className={`flow-dock-bridge${pair.some((team) => launching.has(team.slot)) ? " is-arriving" : ""}${pair.every((team) => closing.has(team.id)) ? " is-closing" : ""}`}
            data-dock-link={id}
            aria-hidden="true"
            style={{
              left: `calc(${((slot + 0.5) / count) * 100}% + var(--flow-dock-gap, 8px) * ${(slot - (count - 1) / 2) / count})`,
              width: `calc(${100 / count}% + var(--flow-dock-gap, 8px) * ${1 / count})`,
              background: `linear-gradient(90deg, ${FLOW_COLORS[pair[0].color].hex}, ${FLOW_COLORS[pair[1].color].hex})`,
            }}
          />
        );
      })}
      {teams.map((team) => (
        <div
          key={team.id}
          className={`flow-dock flow-dock-occupant is-waiting${working.has(team.id) ? " is-working" : ""}${launching.has(team.slot) ? " is-launching" : ""}${team.left === 0 ? " is-complete" : ""}${closing.has(team.id) ? " is-closing" : ""}`}
          data-dock-packet={team.id}
          data-dock-slot={team.slot}
          data-dock-pair={team.link}
          aria-label={`${FLOW_COLORS[team.color].name} команда: осталось ${team.left}${team.link ? ". Связанная пара" : ""}${team.left === 0 ? (closing.has(team.id) ? ". Закрывается" : team.link ? ". Ждёт вторую команду" : "") : ""}`}
          style={{
            left: `calc(${(team.slot / count) * 100}% + var(--flow-dock-gap, 8px) * ${team.slot / count})`,
            width: `calc(${100 / count}% - var(--flow-dock-gap, 8px) * ${(count - 1) / count})`,
          }}
        >
          <FlowCrate
            color={team.color}
            count={team.left}
            blank={team.left === 0}
          />
          {closing.has(team.id) && (
            <span className="flow-dock-sparks" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <i
                  key={i}
                  style={{ "--spark-angle": `${i * 60}deg` } as CSSProperties}
                />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
