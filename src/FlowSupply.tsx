import type { CSSProperties, RefObject } from "react";
import { FlowCrate } from "./FlowArt";
import { FlowQueueLinks } from "./FlowQueueLinks";
import {
  FLOW_COLORS,
  flowLaunchPackets,
  type FlowPuzzle,
  type FlowState,
} from "./flow";

/** Stable packet nodes move between future rows and the playable queue head. */
export function FlowSupply({
  puzzle,
  state,
  freeSlots,
  exposedColors,
  supply,
  onButton,
  onPreview,
  onLaunch,
}: {
  puzzle: FlowPuzzle;
  state: FlowState;
  freeSlots: number;
  exposedColors: ReadonlySet<number>;
  supply: RefObject<HTMLDivElement | null>;
  onButton: (lane: number, node: HTMLButtonElement | null) => void;
  onPreview: (color: number | null) => void;
  onLaunch: (lane: number) => void;
}) {
  const lanes = puzzle.lanes
    .map((packets, lane) => ({
      lane,
      packets: packets.slice(state.lanes[lane]),
    }))
    .filter((lane) => lane.packets.length);
  return (
    <div
      ref={supply}
      className="flow-supply flow-supply-dense flow-supply-live"
      style={
        { "--flow-live-lanes": Math.max(1, lanes.length) } as CSSProperties
      }
    >
      <FlowQueueLinks puzzle={puzzle} positions={state.lanes} supply={supply} />
      {lanes.map(({ lane, packets }, column) => {
        const group = flowLaunchPackets(puzzle, state, lane);
        const launchable = !!group && freeSlots >= group.length;
        return (
          <div
            className="flow-lane flow-lane-live"
            key={lane}
            style={{ "--queue-column": column } as CSSProperties}
          >
            {packets.slice(0, 3).map((packet, depth) => {
              const paint = FLOW_COLORS[packet.color],
                concealed = !!packet.mystery && depth > 0;
              const ready = depth === 0,
                accessible = exposedColors.has(packet.color);
              const label = ready
                ? `Очередь ${lane + 1}: ${paint.name} команда ${paint.symbol}, ${packet.count} кубиков. ${packet.link ? "Связанная пара, нужны 2 слота. " : ""}${accessible ? "Цвет доступен" : "Пока нет доступных кубиков этого цвета"}. Запустить`
                : concealed
                  ? "Скрытая команда"
                  : `${paint.name}, ${packet.count} кубиков${packet.link ? ", связанная пара" : ""}`;
              return (
                <div
                  key={packet.id}
                  className="flow-queue-packet"
                  data-flow-packet={packet.id}
                  data-flow-linked={packet.link}
                  data-depth={depth}
                  aria-label={ready ? undefined : label}
                  style={{ "--queue-depth": depth } as CSSProperties}
                >
                  <button
                    type="button"
                    className={
                      ready
                        ? `flow-launch${accessible ? "" : " needs-opening"}`
                        : "flow-future-crate"
                    }
                    data-flow-packet={ready ? packet.id : undefined}
                    disabled={!ready || !launchable}
                    aria-hidden={!ready || undefined}
                    tabIndex={ready ? 0 : -1}
                    aria-label={ready ? label : undefined}
                    title={
                      ready && packet.link
                        ? group
                          ? "Связанная пара · 2 слота"
                          : "Открой вторую коробку связки"
                        : undefined
                    }
                    ref={(node) => {
                      if (ready) onButton(lane, node);
                    }}
                    onPointerEnter={() => ready && onPreview(packet.color)}
                    onPointerLeave={() => onPreview(null)}
                    onPointerDown={() => ready && onPreview(packet.color)}
                    onFocus={() => ready && onPreview(packet.color)}
                    onBlur={() => onPreview(null)}
                    onClick={() => ready && onLaunch(lane)}
                  >
                    <FlowCrate
                      color={packet.color}
                      count={packet.count}
                      concealed={concealed}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
