import { FLOW_COLORS } from "./flow";
// The same vector paths, gradients and proportions as WalkingAnt. Rasterise each
// gait pose once; a crowd then costs one cached image per worker, not an SVG tree.
const WIDTH = 48,
  HEIGHT = 72,
  FRAMES = 32,
  COLUMNS = 8;
const bob: number[] = [];
const paths = new Map<string, Path2D>();
function path(d: string) {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
}
export type FlowWorkerAtlas = {
  image: HTMLCanvasElement;
  cargo: HTMLCanvasElement;
  density: number;
};
const cache = new Map<string, FlowWorkerAtlas>();
export function flowWorkerAtlas(
  color: number,
  density: number,
): FlowWorkerAtlas {
  const key = `${color}:${density}`;
  const saved = cache.get(key);
  if (saved) return saved;
  const tileW = WIDTH * density,
    tileH = HEIGHT * density,
    image = document.createElement("canvas");
  image.width = tileW * COLUMNS;
  image.height = tileH * (FRAMES / COLUMNS);
  const ctx = image.getContext("2d")!;
  const paint = FLOW_COLORS[color];
  for (let frame = 0; frame < FRAMES; frame++) {
    const cycle = (frame / FRAMES) * 2,
      t = cycle < 1 ? cycle : 2 - cycle;
    // CSS ease-in-out (0.42,0,0.58,1), solved once into the sprite atlas.
    let low = 0,
      high = 1;
    for (let i = 0; i < 16; i++) {
      const m = (low + high) / 2,
        u = 1 - m,
        x = 3 * u * u * m * 0.42 + 3 * u * m * m * 0.58 + m * m * m;
      if (x < t) low = m;
      else high = m;
    }
    const m = (low + high) / 2,
      ease = 3 * (1 - m) * m * m + m * m * m;
    bob[frame] = -1.2 * ease;
    ctx.save();
    ctx.translate(
      (frame % COLUMNS) * tileW + 24 * density,
      Math.floor(frame / COLUMNS) * tileH + 48 * density,
    );
    ctx.scale(density, density);
    ctx.translate(0, -1.2 * ease);
    ctx.strokeStyle = paint.dark;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const stroke = (d: string, width = 2.3) => {
      ctx.lineWidth = width;
      ctx.stroke(path(d));
    };
    for (const [d, sign] of [
      ["m-4-6-9-7-5 2m22 12 10-1 4 5m-22 4-8 5-1 6", 1],
      ["m4-6 9-7 5 2m-22 12-10-1-4 5m22 4 8 5 1 6", -1],
    ] as const) {
      ctx.save();
      ctx.rotate(((-10 + 20 * ease) * sign * Math.PI) / 180);
      stroke(d);
      ctx.restore();
    }
    stroke("m-5-15-4-8-5-3m19 11 4-8 5-3", 1.8);
    // SVG objectBoundingBox radial gradients: preserve the elliptical gloss.
    const ellipse = (
      x: number,
      y: number,
      rx: number,
      ry: number,
      fill: string | CanvasGradient,
      width = 0,
    ) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (width) {
        ctx.lineWidth = width;
        ctx.stroke();
      }
    };
    const glossy = (cy: number, rx: number, ry: number) => {
      ctx.save();
      ctx.translate(-rx, cy - ry);
      ctx.scale(rx * 2, ry * 2);
      const g = ctx.createRadialGradient(0.3, 0.2, 0, 0.3, 0.2, 0.85);
      g.addColorStop(0, "#fffdf3b3");
      g.addColorStop(0.3, paint.hex);
      g.addColorStop(1, paint.dark);
      ctx.beginPath();
      ctx.ellipse(0.5, 0.5, 0.5, 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    glossy(10, 7.5, 10);
    ctx.globalAlpha = 0.35;
    stroke("M-5 13q5 3 10 0", 1.2);
    ctx.globalAlpha = 1;
    glossy(-1, 5, 7);
    glossy(-12, 8.5, 7.8);
    ctx.strokeStyle = "white";
    ctx.globalAlpha = 0.5;
    stroke("M-5-15q2-3 5-3", 1.8);
    ctx.globalAlpha = 1;
    ellipse(-4, -15, 2.2, 2.8, "#fffef4");
    ellipse(4, -15, 2.2, 2.8, "#fffef4");
    ellipse(-4, -16, 1.2, 1.2, "#34352f");
    ellipse(4, -16, 1.2, 1.2, "#34352f");
    ctx.restore();
  }
  const cargo = document.createElement("canvas");
  cargo.width = tileW;
  cargo.height = tileH;
  const c = cargo.getContext("2d")!;
  c.scale(density, density);
  c.translate(24, 48);
  for (const [d, fill] of [
    ["M-11-40 4-45 15-38 0-33Z", paint.hex],
    ["M-11-40 0-33 0-17-11-24Z", paint.dark],
    ["M0-33 15-38 15-22 0-17Z", paint.hex],
  ] as const) {
    c.fillStyle = fill;
    c.fill(path(d));
  }
  c.fillStyle = "#ffffff33";
  c.fill(path("M-11-40 4-45 15-38 0-33Z"));
  c.strokeStyle = "#ffffff99";
  c.lineWidth = 1.6;
  c.stroke(path("M-7-39H7"));
  const atlas = { image, cargo, density };
  cache.set(key, atlas);
  // Bound density variants after rotation/zoom. Current frames retain their atlas.
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return atlas;
}
export function drawFlowWorker(
  ctx: CanvasRenderingContext2D,
  atlas: FlowWorkerAtlas,
  stride: number,
  cargo: number,
) {
  const frame =
      ((Math.round((stride / 2) * FRAMES) % FRAMES) + FRAMES) % FRAMES,
    tileW = WIDTH * atlas.density,
    tileH = HEIGHT * atlas.density;
  ctx.drawImage(
    atlas.image,
    (frame % COLUMNS) * tileW,
    Math.floor(frame / COLUMNS) * tileH,
    tileW,
    tileH,
    -24,
    -48,
    WIDTH,
    HEIGHT,
  );
  if (cargo > 0) {
    ctx.save();
    ctx.globalAlpha *= cargo;
    const grow = 0.8 + 0.2 * cargo;
    ctx.translate(0, bob[frame] - 6 * (1 - cargo));
    ctx.scale(grow, grow);
    ctx.drawImage(atlas.cargo, -24, -48, WIDTH, HEIGHT);
    ctx.restore();
  }
}
