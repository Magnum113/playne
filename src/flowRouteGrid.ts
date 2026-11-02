import type { FlowPoint } from "./flowPresentation";
/** Exact occupied-cell intersection, walking only the cells crossed by a line.
 * The tiny inset matches the cube corridor's existing boundary convention. */
export function flowSegmentClear(
  a: FlowPoint,
  b: FlowPoint,
  cells: readonly number[],
  grid: {
    width: number;
    height: number;
    startX: number;
    startY: number;
    step: number;
  },
) {
  const { width, height, startX, startY, step } = grid,
    dx = b.x - a.x,
    dy = b.y - a.y;
  const ax = Math.floor((a.x - startX) / step),
    ay = Math.floor((a.y - startY) / step),
    bx = Math.floor((b.x - startX) / step),
    by = Math.floor((b.y - startY) / step);
  const empty = (x: number, y: number) =>
    x < 0 || x >= width || y < 0 || y >= height || cells[y * width + x] < 0;
  if (
    (ax < 0 && bx < 0) ||
    (ax >= width && bx >= width) ||
    (ay < 0 && by < 0) ||
    (ay >= height && by >= height)
  )
    return true;
  if (
    Math.abs(ax - bx) + Math.abs(ay - by) <= 1 &&
    empty(ax, ay) &&
    empty(bx, by)
  )
    return true;
  let first = 0,
    last = 1;
  for (const [origin, delta, min, max] of [
    [a.x, dx, startX, startX + width * step],
    [a.y, dy, startY, startY + height * step],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < min || origin > max) return true;
    } else {
      const p = (min - origin) / delta,
        q = (max - origin) / delta;
      first = Math.max(first, Math.min(p, q));
      last = Math.min(last, Math.max(p, q));
    }
  }
  if (first > last) return true;
  const inside = first + Math.min(1e-10, Math.max(0, last - first) / 2);
  let column = Math.max(
      0,
      Math.min(width - 1, Math.floor((a.x + dx * inside - startX) / step)),
    ),
    row = Math.max(
      0,
      Math.min(height - 1, Math.floor((a.y + dy * inside - startY) / step)),
    );
  const sx = dx >= 0 ? 1 : -1,
    sy = dy >= 0 ? 1 : -1;
  for (let visited = 0; visited < width + height + 4; visited++) {
    if (column < 0 || column >= width || row < 0 || row >= height) break;
    if (cells[row * width + column] >= 0) {
      let enter = 0,
        exit = 1;
      for (const [origin, delta, min, max] of [
        [
          a.x,
          dx,
          startX + column * step + 0.00001,
          startX + (column + 1) * step - 0.00001,
        ],
        [
          a.y,
          dy,
          startY + row * step + 0.00001,
          startY + (row + 1) * step - 0.00001,
        ],
      ]) {
        if (Math.abs(delta) < 0.000001) {
          if (origin <= min || origin >= max) {
            enter = 2;
            break;
          }
        } else {
          const p = (min - origin) / delta,
            q = (max - origin) / delta;
          enter = Math.max(enter, Math.min(p, q));
          exit = Math.min(exit, Math.max(p, q));
        }
      }
      if (enter <= exit) return false;
    }
    const tx =
      Math.abs(dx) < 1e-12
        ? Infinity
        : (startX + (column + (sx > 0 ? 1 : 0)) * step - a.x) / dx;
    const ty =
      Math.abs(dy) < 1e-12
        ? Infinity
        : (startY + (row + (sy > 0 ? 1 : 0)) * step - a.y) / dy;
    const next = Math.min(tx, ty);
    if (!Number.isFinite(next) || next > last + 1e-12) break;
    if (tx <= ty) column += sx;
    if (ty <= tx) row += sy;
  }
  return true;
}
