import type { GameObject } from "./data";

// Most silhouettes share a left edge and baseline, like a ruler.
// Narrow towers/rockets need a gap: their smaller copy disappears in an overlay.
export function resultLayout(
  reference: GameObject,
  target: GameObject,
  ratio: number,
  width: number,
  height = 390,
) {
  const guessFactor = (reference.size * ratio) / target.size;
  const separate = target.axis === "y" && target.width / target.height < 0.25;
  const gap = separate ? 20 : 0;
  const widthExtent = separate ? guessFactor + 1 : Math.max(guessFactor, 1);
  const extent = Math.max(guessFactor, 1);
  const targetX = width * 0.52;
  const referenceCenter = width * 0.24;
  const scale = Math.min(
    Math.min(155, height - 115) / reference.height,
    (width * 0.4 - 30) / reference.width,
    (height - 130) / (target.height * extent),
    (width - targetX - 38 - gap) / (target.width * widthExtent),
  );
  return {
    scale,
    targetX,
    guessX: targetX + (separate ? target.width * scale + gap : 0),
    referenceCenter,
    guessScale: scale * guessFactor,
    answerScale: scale,
  };
}
