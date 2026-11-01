/** Dense artwork keeps its native grid while the active stage matches the reference. */
export function flowGeometry(puzzle: {
  width: number;
  height: number;
  version?: number;
  id?: string;
}) {
  const dense = puzzle.version === 4 || puzzle.id?.endsWith(":v4");
  const extent = 432;
  const step = dense
    ? Math.min(24, extent / Math.max(puzzle.width, puzzle.height))
    : 24;
  const startX = (540 - puzzle.width * step) / 2;
  const startY = 22 + (dense ? (extent - puzzle.height * step) / 2 : 0);
  const bottom = dense ? 22 + extent : startY + puzzle.height * step;
  return {
    reference: !!dense,
    viewBox: dense
      ? { x: 10, y: -10, width: 520, height: 610 }
      : { x: 0, y: 0, width: 540, height: bottom + 132 },
    step,
    size: step - Math.max(0.65, step / 24),
    startX,
    startY,
    bottom,
    homeY: bottom + (dense ? 89 : 66),
    frameX: dense ? 10 : startX - 15,
    frameY: dense ? -10 : startY - 16,
    frameWidth: dense ? 520 : puzzle.width * step + 30,
    frameHeight: dense ? 510 : puzzle.height * step + 28,
    // Ants remain readable as the picture's native resolution increases.
    workerScale: dense ? 0.85 : 0.72,
  };
}
