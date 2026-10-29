import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { linePathState, updateLinePath, type LinePuzzle } from "./line";

export default function LineBoard({
  puzzle,
  path,
  onPathChange,
  disabled = false,
  onMessage,
}: {
  puzzle: LinePuzzle;
  path: number[];
  onPathChange: (path: number[]) => void;
  disabled?: boolean;
  onMessage?: (message: string) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const livePath = useRef(path);
  livePath.current = path;
  const pointer = useRef<number | null>(null);
  const [focused, setFocused] = useState(() =>
    Number(
      Object.keys(puzzle.numbers).find((c) => puzzle.numbers[Number(c)] === 1),
    ),
  );
  const count = puzzle.rows * puzzle.cols;
  function visit(cell: number, explain = false) {
    if (disabled || cell < 0 || cell >= count) return;
    const before = livePath.current;
    const after = updateLinePath(puzzle, before, cell);
    if (
      after.length === before.length &&
      after.every((v, i) => v === before[i])
    ) {
      if (explain && before.at(-1) !== cell)
        onMessage?.(
          linePathState(puzzle, [...before, cell]).message ??
            "Продолжи с конца линии.",
        );
      return;
    }
    livePath.current = after;
    onPathChange(after);
    onMessage?.("");
  }
  function hit(x: number, y: number) {
    const rect = board.current?.getBoundingClientRect();
    if (
      !rect ||
      x < rect.left ||
      x >= rect.right ||
      y < rect.top ||
      y >= rect.bottom
    )
      return -1;
    return (
      Math.floor(((y - rect.top) / rect.height) * puzzle.rows) * puzzle.cols +
      Math.floor(((x - rect.left) / rect.width) * puzzle.cols)
    );
  }
  function move(cell: number) {
    const tip = livePath.current.at(-1);
    if (tip === undefined || cell < 0) return;
    const row = Math.floor(cell / puzzle.cols),
      col = cell % puzzle.cols;
    const tipRow = Math.floor(tip / puzzle.cols),
      tipCol = tip % puzzle.cols;
    // Interpolate fast straight drags without permitting diagonal shortcuts.
    const step =
      row === tipRow
        ? Math.sign(col - tipCol)
        : col === tipCol
          ? Math.sign(row - tipRow) * puzzle.cols
          : 0;
    if (!step) return;
    for (
      let next = tip + step;
      step > 0 ? next <= cell : next >= cell;
      next += step
    ) {
      const oldTip = livePath.current.at(-1);
      visit(next);
      if (oldTip === livePath.current.at(-1)) break;
    }
  }
  function key(e: KeyboardEvent<HTMLButtonElement>, cell: number) {
    const shifts: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -puzzle.cols,
      ArrowDown: puzzle.cols,
    };
    if (e.key in shifts) {
      e.preventDefault();
      const next = cell + shifts[e.key];
      if (
        next < 0 ||
        next >= count ||
        ((e.key === "ArrowLeft" || e.key === "ArrowRight") &&
          Math.floor(next / puzzle.cols) !== Math.floor(cell / puzzle.cols))
      )
        return;
      setFocused(next);
      board.current
        ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
        ?.focus();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      const next = livePath.current.slice(0, -1);
      livePath.current = next;
      onPathChange(next);
    }
  }
  return (
    <div
      className="line-board"
      ref={board}
      role="group"
      aria-label={`Поле ${puzzle.rows} на ${puzzle.cols}. Соедини числа по порядку и заполни все клетки.`}
      style={
        {
          "--line-cols": puzzle.cols,
          aspectRatio: `${puzzle.cols}/${puzzle.rows}`,
        } as CSSProperties
      }
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (disabled || !e.isPrimary || e.button !== 0) return;
        const cell = hit(e.clientX, e.clientY);
        if (cell < 0) return;
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFocused(cell);
        board.current
          ?.querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`)
          ?.focus({ preventScroll: true });
        visit(cell, true);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId && !disabled)
          move(hit(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (pointer.current === e.pointerId) pointer.current = null;
      }}
      onPointerCancel={(e) => {
        if (pointer.current === e.pointerId) pointer.current = null;
      }}
      onLostPointerCapture={(e) => {
        if (pointer.current === e.pointerId) pointer.current = null;
      }}
    >
      {Array.from({ length: count }, (_, cell) => {
        const visited = path.includes(cell),
          tip = path.at(-1) === cell,
          number = puzzle.numbers[cell];
        return (
          <button
            key={cell}
            type="button"
            data-cell={cell}
            disabled={disabled}
            tabIndex={focused === cell ? 0 : -1}
            className={`line-cell${visited ? " is-visited" : ""}${tip ? " is-tip" : ""}`}
            aria-label={`Строка ${Math.floor(cell / puzzle.cols) + 1}, столбец ${(cell % puzzle.cols) + 1}${number ? `, число ${number}` : ""}${tip ? ", конец линии" : visited ? ", пройдено" : ""}`}
            aria-pressed={visited}
            onFocus={() => setFocused(cell)}
            onKeyDown={(e) => key(e, cell)}
            onClick={(e) => {
              if (e.detail === 0) visit(cell, true);
            }}
          >
            {number && <span className="line-number">{number}</span>}
            {tip && !number && <span className="line-tip-dot" />}
          </button>
        );
      })}
      <svg
        className="line-board-overlay"
        viewBox={`0 0 ${puzzle.cols * 100} ${puzzle.rows * 100}`}
        aria-hidden="true"
      >
        <polyline
          className="line-trace"
          points={path
            .map(
              (c) =>
                `${(c % puzzle.cols) * 100 + 50},${Math.floor(c / puzzle.cols) * 100 + 50}`,
            )
            .join(" ")}
        />
        {(puzzle.walls ?? []).map(([a, b]) => {
          const row = Math.floor(a / puzzle.cols),
            col = a % puzzle.cols;
          return a % puzzle.cols === b % puzzle.cols ? (
            <line
              className="line-wall"
              key={`${a}-${b}`}
              x1={col * 100 + 4}
              x2={col * 100 + 96}
              y1={(Math.min(row, Math.floor(b / puzzle.cols)) + 1) * 100}
              y2={(Math.min(row, Math.floor(b / puzzle.cols)) + 1) * 100}
            />
          ) : (
            <line
              className="line-wall"
              key={`${a}-${b}`}
              x1={(Math.min(col, b % puzzle.cols) + 1) * 100}
              x2={(Math.min(col, b % puzzle.cols) + 1) * 100}
              y1={row * 100 + 4}
              y2={row * 100 + 96}
            />
          );
        })}
      </svg>
    </div>
  );
}
