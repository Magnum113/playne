import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  dispatchSnapshot,
  normalizeShape,
  replaySlideMoves,
  rotateShape,
  rotationAlignment,
  type BrainCell,
  type DispatchAction,
  type DispatchRound,
  type PublicFlashRound,
  type PublicRotateRound,
  type SlideMove,
  type SlideRound,
} from "./brain";
export { default as BrainPreview } from "./BrainPreview";

export function FlashBoard({
  round,
  phase,
  selected,
  onChange,
  disabled = false,
  correctCells,
}: {
  round: PublicFlashRound;
  phase: "show" | "answer" | "result";
  selected: number[];
  onChange: (cells: number[]) => void;
  disabled?: boolean;
  correctCells?: number[];
}) {
  const targets =
    phase === "show"
      ? (round.cells ?? [])
      : phase === "result"
        ? (correctCells ?? [])
        : [];
  return (
    <div className="brain-flash-wrap">
      <div
        className="brain-flash-grid"
        style={{ "--brain-cols": round.cols } as CSSProperties}
        aria-label={
          phase === "show"
            ? "Запомни подсвеченные клетки"
            : "Поле для выбора клеток"
        }
      >
        {Array.from({ length: round.rows * round.cols }, (_, cell) => {
          const chosen = selected.includes(cell),
            target = targets.includes(cell);
          const marker =
            phase === "result"
              ? chosen && target
                ? "✓"
                : target
                  ? "○"
                  : chosen
                    ? "×"
                    : ""
              : chosen
                ? "✓"
                : "";
          const suffix =
            phase === "result"
              ? target
                ? chosen
                  ? ", верно"
                  : ", пропущена"
                : chosen
                  ? ", лишняя"
                  : ""
              : "";
          return (
            <button
              type="button"
              key={cell}
              className={`brain-flash-cell${target ? " is-target" : ""}${chosen ? " is-chosen" : ""}${phase === "result" && chosen && !target ? " is-wrong" : ""}${phase === "show" ? " is-showing" : ""}`}
              aria-label={`Ряд ${Math.floor(cell / round.cols) + 1}, столбец ${(cell % round.cols) + 1}${suffix}`}
              aria-pressed={phase === "show" ? undefined : chosen}
              disabled={disabled || phase !== "answer"}
              onClick={() =>
                onChange(
                  chosen
                    ? selected.filter((c) => c !== cell)
                    : selected.length < round.count
                      ? [...selected, cell]
                      : selected,
                )
              }
            >
              <span aria-hidden="true">{marker}</span>
            </button>
          );
        })}
      </div>
      {phase === "result" && (
        <p className="brain-board-note">
          ✓ Совпало · ○ Пропущено · × Лишняя клетка
        </p>
      )}
    </div>
  );
}

function Shape({
  cells,
  outline = false,
}: {
  cells: BrainCell[];
  outline?: boolean;
}) {
  const normalized = normalizeShape(cells);
  const width = Math.max(...normalized.map((c) => c[0])) + 1;
  const height = Math.max(...normalized.map((c) => c[1])) + 1;
  const unit = Math.min(128 / width, 128 / height);
  return (
    <g
      transform={`translate(${(160 - width * unit) / 2} ${(160 - height * unit) / 2})`}
    >
      {normalized.map(([x, y]) => (
        <rect
          key={`${x}:${y}`}
          x={x * unit + 1.5}
          y={y * unit + 1.5}
          width={unit - 3}
          height={unit - 3}
          rx="4"
          fill={outline ? "none" : "var(--purple)"}
          stroke={outline ? "var(--mint)" : "var(--panel)"}
          strokeWidth={outline ? 3 : 1}
        />
      ))}
    </g>
  );
}

export function RotateBoard({
  round,
  disabled,
  onAnswer,
  result = false,
}: {
  round: PublicRotateRound;
  disabled?: boolean;
  onAnswer: (same: boolean) => void;
  result?: boolean;
}) {
  const alignment = result
    ? rotationAlignment(round.shapeA, round.shapeB)
    : null;
  return (
    <div className="brain-rotate-wrap">
      <div className="brain-shape-pair">
        <figure>
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label="Первая фигура из клеток"
          >
            <Shape cells={round.shapeA} />
          </svg>
          <figcaption>Фигура 1</figcaption>
        </figure>
        <figure>
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label="Вторая фигура из клеток"
          >
            <Shape cells={round.shapeB} />
          </svg>
          <figcaption>Фигура 2</figcaption>
        </figure>
      </div>
      {result ? (
        <div className="brain-rotation-correction">
          <p>
            <strong>
              {alignment?.mirrored
                ? "Это зеркальное отражение."
                : "Фигуры совпадают после поворота."}
            </strong>
          </p>
          {alignment && (
            <>
              <svg
                viewBox="0 0 160 160"
                role="img"
                aria-label="Фигуры совмещены: заливка — первая, контур — вторая"
              >
                <Shape
                  cells={rotateShape(
                    round.shapeA,
                    alignment.turns,
                    alignment.mirrored,
                  )}
                />
                <Shape cells={round.shapeB} outline />
              </svg>
              <p>
                {alignment.mirrored ? "Отражение и " : ""}поворот на{" "}
                {alignment.turns * 90}°. Заливка и контур совместились.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="brain-binary-controls">
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() => onAnswer(true)}
          >
            Та же фигура <span aria-hidden="true">↻</span>
          </button>
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() => onAnswer(false)}
          >
            Зеркальная <span aria-hidden="true">↔</span>
          </button>
        </div>
      )}
    </div>
  );
}

const carColours = [
  "var(--mint)",
  "var(--purple)",
  "var(--orange)",
  "var(--actual)",
];
export function SlideBoard({
  round,
  moves,
  onChange,
  disabled = false,
  onMessage,
}: {
  round: SlideRound;
  moves: SlideMove[];
  onChange: (moves: SlideMove[]) => void;
  disabled?: boolean;
  onMessage?: (message: string) => void;
}) {
  const state = replaySlideMoves(round, moves);
  const [selected, setSelected] = useState("R");
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    delta: number;
  } | null>(null);
  const dragDelta = useRef(0);
  const selectedCar = state.cars.find((c) => c.id === selected);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    axis: "x" | "y";
    unit: number;
    pointer: number;
  } | null>(null);
  function move(carId: string, delta: number) {
    if (disabled || !delta) return;
    // Check the actual step from the current position before merging its trace.
    const candidate = [...moves, { carId, delta }];
    const result = replaySlideMoves(round, candidate);
    if (result.valid) {
      const previous = moves.at(-1);
      const combined = (previous?.delta ?? 0) + delta;
      const next =
        previous?.carId === carId
          ? combined === 0
            ? moves.slice(0, -1)
            : [...moves.slice(0, -1), { carId, delta: combined }]
          : candidate;
      if (!replaySlideMoves(round, next).valid) return;
      onChange(next);
      onMessage?.(
        result.solved
          ? "Красная машина у выхода. Можно записать решение или улучшить путь."
          : `Машина ${carId}: ${Math.abs(delta)} ${delta > 0 ? "вперёд" : "назад"}.`,
      );
    } else onMessage?.("Путь занят или машина у края. Попробуй другой ход.");
  }
  function pointerDown(
    event: PointerEvent<HTMLButtonElement>,
    id: string,
    axis: "x" | "y",
  ) {
    if (
      disabled ||
      event.button !== 0 ||
      event.isPrimary === false ||
      drag.current
    )
      return;
    setSelected(id);
    dragDelta.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      axis,
      x: event.clientX,
      y: event.clientY,
      unit: (board.current?.getBoundingClientRect().width ?? 300) / 6,
      pointer: event.pointerId,
    };
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointer || disabled) return;
    const desired = Math.max(
      -5,
      Math.min(
        5,
        Math.round(
          (start.axis === "x"
            ? event.clientX - start.x
            : event.clientY - start.y) / start.unit,
        ),
      ),
    );
    let delta = 0;
    for (let step = 1; step <= Math.abs(desired); step++) {
      const candidate = step * Math.sign(desired);
      if (
        !replaySlideMoves(round, [
          ...moves,
          { carId: start.id, delta: candidate },
        ]).valid
      )
        break;
      delta = candidate;
    }
    dragDelta.current = delta;
    setDragPreview({ id: start.id, delta });
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointer) return;
    drag.current = null;
    setDragPreview(null);
    const delta = dragDelta.current;
    if (delta) move(start.id, delta);
  }
  return (
    <div className="brain-slide-wrap">
      <div
        className="brain-parking"
        ref={board}
        aria-label="Парковка 6 на 6. Выбери машину и сдвигай вдоль её оси."
      >
        <div className="brain-parking-grid" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <span className="brain-parking-exit" aria-hidden="true">
          →
        </span>
        {state.cars.map((car, i) => (
          <button
            key={car.id}
            type="button"
            className={`brain-car${car.id === "R" ? " is-red" : ""}${selected === car.id ? " is-selected" : ""}`}
            style={
              {
                left: `${((car.x + (dragPreview?.id === car.id && car.axis === "x" ? dragPreview.delta : 0)) / 6) * 100}%`,
                top: `${((car.y + (dragPreview?.id === car.id && car.axis === "y" ? dragPreview.delta : 0)) / 6) * 100}%`,
                width: `${((car.axis === "x" ? car.length : 1) / 6) * 100}%`,
                height: `${((car.axis === "y" ? car.length : 1) / 6) * 100}%`,
                "--car-colour":
                  car.id === "R"
                    ? "var(--danger)"
                    : carColours[i % carColours.length],
              } as CSSProperties
            }
            aria-label={`Машина ${car.id}${car.id === "R" ? ", красная, к выходу" : ""}. ${car.axis === "x" ? "По горизонтали" : "По вертикали"}. Ряд ${car.y + 1}, столбец ${car.x + 1}`}
            aria-pressed={selected === car.id}
            disabled={disabled}
            onPointerDown={(e) => pointerDown(e, car.id, car.axis)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={(event) => {
              if (drag.current?.pointer !== event.pointerId) return;
              drag.current = null;
              setDragPreview(null);
            }}
            onClick={() => {
              if (!drag.current) setSelected(car.id);
            }}
            onFocus={() => {
              if (!drag.current || drag.current.id === car.id)
                setSelected(car.id);
            }}
            onKeyDown={(e) => {
              const delta =
                car.axis === "x"
                  ? e.key === "ArrowRight"
                    ? 1
                    : e.key === "ArrowLeft"
                      ? -1
                      : 0
                  : e.key === "ArrowDown"
                    ? 1
                    : e.key === "ArrowUp"
                      ? -1
                      : 0;
              if (delta) {
                e.preventDefault();
                move(car.id, delta);
              }
            }}
          >
            <span>
              {car.id}
              <small aria-hidden="true">{car.axis === "x" ? "↔" : "↕"}</small>
            </span>
          </button>
        ))}
      </div>
      <div
        className="brain-car-controls"
        aria-label="Сдвинуть выбранную машину"
      >
        <p>
          Машина <strong>{selected}</strong>
        </p>
        <div>
          {(
            [
              [-1, "x", "←", "влево"],
              [1, "x", "→", "вправо"],
              [-1, "y", "↑", "вверх"],
              [1, "y", "↓", "вниз"],
            ] as const
          ).map(([delta, axis, symbol, label]) => (
            <button
              key={label}
              className="secondary-button"
              disabled={disabled || selectedCar?.axis !== axis}
              aria-label={`Сдвинуть машину ${selected} ${label} на клетку`}
              onClick={() => move(selected, delta)}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
      <p className="brain-board-note">
        Перетаскивай машину или выбери её и нажимай стрелки. Клавиатура: стрелки
        на выбранной машине.
      </p>
    </div>
  );
}

const stationLetters = ["A", "B", "C"];
const stationColours = ["var(--mint)", "var(--purple)", "var(--orange)"];
function StationShape({
  station,
  x = 0,
  y = 0,
  size = 25,
}: {
  station: number;
  x?: number;
  y?: number;
  size?: number;
}) {
  const fill = stationColours[station];
  return station === 0 ? (
    <circle cx={x} cy={y} r={size} fill={fill} />
  ) : station === 1 ? (
    <rect
      x={x - size}
      y={y - size}
      width={size * 2}
      height={size * 2}
      rx={size / 4}
      fill={fill}
    />
  ) : (
    <path
      d={`M${x} ${y - size * 1.1}l${size * 1.1} ${size * 2}h${-size * 2.2}z`}
      fill={fill}
    />
  );
}

export function DispatchBoard({
  round,
  actions,
  onChange,
  startedAt,
  serverOffset,
  disabled = false,
  finished = false,
}: {
  round: DispatchRound;
  actions: DispatchAction[];
  onChange: (actions: DispatchAction[]) => void;
  startedAt: number;
  serverOffset: number;
  disabled?: boolean;
  finished?: boolean;
}) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Date.now() + serverOffset - startedAt),
  );
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    if (finished) {
      setElapsed(round.durationMs);
      return;
    }
    let frame = 0;
    const tick = () => {
      const time = Math.max(0, Date.now() + serverOffset - startedAt);
      setElapsed(Math.min(time, round.durationMs));
      if (time < round.durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [round.durationMs, startedAt, serverOffset, finished]);
  const snapshot = dispatchSnapshot(
    round,
    actions,
    Math.max(0, Math.min(elapsed, round.durationMs)),
  );
  function toggle(which: 0 | 1) {
    const current = actionsRef.current;
    const atMs = Math.max(
      0,
      current.at(-1)?.atMs ?? 0,
      Math.floor(Date.now() + serverOffset - startedAt),
    );
    if (
      disabled ||
      finished ||
      elapsed >= round.durationMs ||
      atMs >= round.durationMs ||
      !round.activeSwitches.includes(which)
    )
      return;
    const state = dispatchSnapshot(round, current, atMs);
    const next = [
      ...current,
      {
        atMs,
        switch: which,
        position: (state.switches[which] === 0 ? 1 : 0) as 0 | 1,
      },
    ];
    actionsRef.current = next;
    onChange(next);
  }
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.repeat &&
        !document.querySelector("dialog[open]") &&
        ["1", "2"].includes(e.key)
      ) {
        e.preventDefault();
        toggleRef.current(e.key === "1" ? 0 : 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="brain-dispatch-wrap">
      <svg
        className="brain-railway"
        viewBox="0 0 640 360"
        role="img"
        aria-label={`Движение поездов. Прибыло ${snapshot.arrived} из ${round.trains.length}, верно ${snapshot.correct}. Управление стрелками под полем.`}
      >
        <rect
          x="2"
          y="2"
          width="636"
          height="356"
          rx="24"
          fill="var(--hover)"
        />
        <path
          d="M20 180H380V60H600M380 180H600M180 180V300H600"
          stroke="var(--line-strong)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 180H380V60H600M380 180H600M180 180V300H600"
          stroke="var(--panel)"
          strokeWidth="5"
          strokeDasharray="5 9"
          fill="none"
        />
        <path
          d={snapshot.switches[0] === 1 ? "M150 180H180V214" : "M150 180H214"}
          stroke="var(--text)"
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={snapshot.switches[1] === 0 ? "M350 180H380V146" : "M350 180H414"}
          stroke="var(--text)"
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
        />
        {([0, 1] as const).map((n) => (
          <g key={n}>
            <circle
              cx={n ? 380 : 180}
              cy="222"
              r="18"
              fill="var(--panel)"
              stroke="var(--text)"
              strokeWidth="2"
            />
            <text
              x={n ? 380 : 180}
              y="229"
              fill="var(--text)"
              textAnchor="middle"
              fontSize="22"
              fontWeight="700"
            >
              {n + 1}
            </text>
          </g>
        ))}
        {round.stations.map((station) => (
          <g key={station}>
            <StationShape
              station={station}
              x={600}
              y={[60, 180, 300][station]}
              size={27}
            />
            <text
              x="600"
              y={[68, 188, 308][station]}
              fill="var(--panel)"
              textAnchor="middle"
              fontSize="25"
              fontWeight="750"
            >
              {stationLetters[station]}
            </text>
          </g>
        ))}
        {snapshot.trains
          .filter((t) => !t.arrived)
          .map((train) => (
            <g key={train.id} transform={`translate(${train.x} ${train.y})`}>
              <rect
                x="-26"
                y="-24"
                width="52"
                height="48"
                rx="12"
                fill="var(--panel)"
                stroke="var(--text)"
                strokeWidth="2"
              />
              <StationShape station={train.destination} size={19} />
              <text
                y="7"
                textAnchor="middle"
                fill="var(--panel)"
                fontSize="23"
                fontWeight="750"
              >
                {stationLetters[train.destination]}
              </text>
            </g>
          ))}
      </svg>
      <div className="brain-switches">
        {([0, 1] as const).map((which) => (
          <button
            key={which}
            type="button"
            className="secondary-button"
            disabled={
              disabled ||
              finished ||
              elapsed >= round.durationMs ||
              !round.activeSwitches.includes(which)
            }
            onClick={() => toggle(which)}
            aria-label={`Стрелка ${which + 1}. Сейчас ${which === 0 ? (snapshot.switches[0] === 1 ? "к C" : "к стрелке 2") : snapshot.switches[1] === 0 ? "к A" : "к B"}. Переключить.`}
          >
            <span>
              Стрелка {which + 1} <kbd>{which + 1}</kbd>
            </span>
            <strong>
              {which === 0
                ? snapshot.switches[0] === 1
                  ? "↓ к C"
                  : "→ к стрелке 2"
                : snapshot.switches[1] === 0
                  ? "↑ к A"
                  : "→ к B"}
            </strong>
          </button>
        ))}
      </div>
      <p className="brain-train-count" role="status">
        Прибыло {snapshot.arrived} / {round.trains.length} · Верно{" "}
        {snapshot.correct}
      </p>
      <p className="brain-board-note">
        {!round.activeSwitches.includes(0)
          ? "В этой волне стрелка 1 закреплена. Переключай стрелку 2. "
          : ""}
        A ● круг · B ■ квадрат
        {round.stations.includes(2) ? " · C ▲ треугольник" : ""}. Путь
        выбирается при проезде стрелки.
      </p>
    </div>
  );
}
