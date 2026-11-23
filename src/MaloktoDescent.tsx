import type { CSSProperties } from "react";
import { MALOKTO_MAX } from "./malokto";

const METRES_PER_POINT = 4;
const depthLabels = ["Вход в пещеру", "Зелёные жилы", "Кристальный грот", "Аметистовый зал", "Сердце породы"];
const particles = [
  [15, 22, 3, 0], [71, 31, 2, 1], [81, 65, 4, 2], [32, 79, 2, 3],
  [55, 17, 3, 4], [20, 62, 4, 3], [69, 84, 2, 0], [44, 35, 2, 2],
];

export function maloktoDepth(score: number) {
  return (score * METRES_PER_POINT).toLocaleString("ru-RU") + " м";
}

type DescentProps = {
  variant: "card" | "cover" | "play" | "result";
  score?: number;
  gain?: number;
};

export default function MaloktoDescent({ variant, score = 0, gain = 0 }: DescentProps) {
  const fraction = Math.min(1, Math.max(0, score / MALOKTO_MAX));
  const isPreview = variant === "card" || variant === "cover";
  const depth = Math.min(depthLabels.length - 1, Math.floor(fraction * depthLabels.length));
  const position = isPreview ? 0.22 : fraction;
  const style = {
    "--camera-position": `${position * 100}%`,
    "--near-shift": `${position * -78}%`,
    "--probe-position": `${32 + position * 33}%`,
    "--play-probe-top": `${30 + position * 40}%`,
    "--play-mobile-probe-top": `${30 + position * 16}svh`,
    "--glow-alpha": 0.28 + position * 0.53,
    "--depth-progress": `${fraction * 100}%`,
    "--rings-scale": 1 + gain / 85,
  } as CSSProperties;

  return (
    <div className={`malokto-scene malokto-scene--${variant}`} style={style} aria-hidden={isPreview || undefined}>
      <div className="malokto-landscape" aria-hidden="true">
        <div className="malokto-scene-art" />
        <div className="malokto-scene-fog" />
        <div className="malokto-scene-walls"><i /><i /></div>
        <div className="malokto-specks">
          {particles.map(([x, y, size, lag]) => <i key={x} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, animationDelay: `-${lag}s` }} />)}
        </div>
        <div className={gain ? "malokto-probe is-descending" : "malokto-probe"}>
          <div className="malokto-probe-light" />
          {gain > 0 && <div key={score} className={`malokto-probe-pulse${gain >= 70 ? " is-rare" : ""}`} />}
          <img src="/art/malokto/lantern.webp" width="360" height="360" alt="" decoding="async" loading={variant === "card" ? "lazy" : undefined} />
        </div>
      </div>
      {isPreview ? (
        <span className="malokto-scene-badge"><i /> {variant === "cover" ? "Вход в пещеру" : "Редкие ответы ведут глубже"}</span>
      ) : (
        <div className="malokto-depth">
          <div className="malokto-depth-meter" aria-hidden="true"><span /></div>
          <div className="malokto-depth-text">
            <span>{depthLabels[depth]}</span>
            <strong>{maloktoDepth(score)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
