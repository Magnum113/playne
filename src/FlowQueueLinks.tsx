import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FLOW_COLORS, type FlowPuzzle } from "./flow";

type Connector = {
  id: string;
  color: string;
  path: string;
};

/** Physical bridges connect the visible commands, including diagonal future pairs. */
export function FlowQueueLinks({
  puzzle,
  positions,
  supply,
}: {
  puzzle: FlowPuzzle;
  positions: number[];
  supply: RefObject<HTMLDivElement | null>;
}) {
  const [links, setLinks] = useState<Connector[]>([]);
  const canvas = useRef<SVGSVGElement>(null);
  const positionKey = positions.join(":");
  useLayoutEffect(() => {
    // Child layout effects can precede the parent's ref attachment on a resume.
    const element = supply.current ?? canvas.current?.parentElement;
    if (!element) return;
    if (!puzzle.lanes.some((lane) => lane.some((packet) => packet.link))) {
      setLinks([]);
      return;
    }
    const measure = () => {
      const groups = new Map<
        string,
        { x: number; y: number; color: string; depth: number }[]
      >();
      puzzle.lanes.forEach((lane, column) =>
        lane
          .slice(positions[column], positions[column] + 3)
          .forEach((packet, depth) => {
            if (!packet.link) return;
            const node = element.querySelector<HTMLElement>(
              `[data-flow-packet="${packet.id}"]`,
            );
            if (!node) return;
            const bounds = node.getBoundingClientRect(),
              surface = element.getBoundingClientRect();
            const x = bounds.left - surface.left + bounds.width / 2;
            const y = bounds.top - surface.top + bounds.height / 2;
            const members = groups.get(packet.link) ?? [];
            members.push({
              x,
              y,
              depth,
              color:
                packet.mystery && depth > 0
                  ? "#9396a5"
                  : FLOW_COLORS[packet.color].hex,
            });
            groups.set(packet.link, members);
          }),
      );
      setLinks(
        [...groups].flatMap(([id, pair]) =>
          pair.length === 2
            ? [
                {
                  id,
                  color: pair[0].color,
                  // A long bridge above the front row must not appear to join
                  // the unrelated boxes between its two ends.
                  path:
                    Math.abs(pair[1].x - pair[0].x) >
                      (element.offsetWidth /
                        Math.max(
                          1,
                          puzzle.lanes.filter(
                            (lane, i) => lane.length > positions[i],
                          ).length,
                        )) *
                        1.5 && pair.every((point) => point.depth === 0)
                      ? (() => {
                          const [a, b] = [...pair].sort((a, b) => a.x - b.x);
                          return `M${a.x} ${a.y}V2Q${a.x} -6 ${a.x + 8} -6H${b.x - 8}Q${b.x} -6 ${b.x} 2V${b.y}`;
                        })()
                      : `M${pair[0].x} ${pair[0].y}L${pair[1].x} ${pair[1].y}`,
                },
              ]
            : [],
        ),
      );
    };
    measure();
    // Follow the actual moving endpoints through promotion and lane recentering.
    let frame = 0;
    const until = performance.now() + 360;
    const follow = () => {
      measure();
      if (performance.now() < until) frame = requestAnimationFrame(follow);
    };
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      frame = requestAnimationFrame(follow);
    if (typeof ResizeObserver === "undefined")
      return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [puzzle, positionKey, supply]);
  return (
    <svg
      ref={canvas}
      className="flow-queue-links"
      fill="none"
      aria-hidden="true"
    >
      {links.map((link) => (
        <g key={link.id}>
          <path d={link.path} stroke="#fff7e6" strokeWidth="13" />
          <path d={link.path} stroke={link.color} strokeWidth="8" />
        </g>
      ))}
    </svg>
  );
}
