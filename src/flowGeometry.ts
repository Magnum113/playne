/** Dense pictures share one square stage; older saved boards keep their geometry. */
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
    step,
    size: step - Math.max(0.65, step / 24),
    startX,
    startY,
    bottom,
    frameX: dense ? (540 - extent) / 2 - 15 : startX - 15,
    frameY: dense ? 6 : startY - 16,
    frameWidth: (dense ? extent : puzzle.width * step) + 30,
    frameHeight: (dense ? extent : puzzle.height * step) + 28,
    workerScale: dense ? Math.max(0.42, (0.72 * step) / 24) : 0.72,
  };
}
