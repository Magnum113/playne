import type { CSSProperties } from "react";

export function FlowAtmosphere({ night }: { night: boolean }) {
  return (
    <div
      className={`flow-atmosphere${night ? " is-night" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: 7 }, (_, i) => (
        <span
          key={i}
          style={
            {
              "--mote-x": `${[6, 94, 12, 89, 8, 95, 17][i]}%`,
              "--mote-y": `${16 + i * 12}%`,
              "--mote-delay": `${-i * 1.7}s`,
              "--mote-time": `${6 + i * 0.8}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
export function FlowCelebration() {
  return (
    <div className="flow-celebration" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--confetti-x": `${Math.sin(i * 2.4) * (90 + (i % 5) * 28)}px`,
              "--confetti-y": `${-75 - (i % 7) * 27}px`,
              "--confetti-turn": `${i % 2 ? 350 : -330}deg`,
              "--confetti-color": ["#f9cb64", "#85d49c", "#c5a5ef", "#f2a587"][
                i % 4
              ],
              "--confetti-delay": `${(i % 6) * 30}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
