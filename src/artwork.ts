// Generated artwork uses its original pixel aspect ratio. The scored dimension
// calibrates one axis; the other is derived, never stretched independently.
function art(
  id: string,
  imageWidth: number,
  imageHeight: number,
  crop: [number, number, number, number],
  axis: "x" | "y",
  size: number,
  measuredPixels?: number,
) {
  const scale = size / (measuredPixels ?? (axis === "x" ? crop[2] : crop[3]));
  return {
    width: crop[2] * scale,
    height: crop[3] * scale,
    illustration: { src: `art/${id}.png`, imageWidth, imageHeight, crop },
  };
}
export const artwork = {
  whale: art("whale", 1086, 362, [19, 86, 1047, 188], "x", 30),
  trex: art("trex", 1086, 362, [25, 20, 1037, 324], "x", 12),
  bus: art("bus", 864, 455, [34, 38, 788, 378], "x", 8.38),
  giraffe: art("giraffe", 512, 768, [22, 32, 457, 688], "y", 5),
  elephant: art("elephant", 817, 481, [24, 19, 764, 443], "y", 3.2),
  hoop: art("hoop", 613, 641, [59, 21, 521, 598], "y", 3.05, 436),
  motherland: art("motherland", 512, 768, [116, 11, 360, 738], "y", 85),
};
