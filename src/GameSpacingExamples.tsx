import { useState } from "react";
import { FlowAnt, FlowCrate, FlowScene } from "./FlowArt";
import { makeFlowPuzzle } from "./flow";
import FireButton from "./FireButton";

const puzzle = makeFlowPuzzle("level", 1);
const spacingRoles = [
  ["--game-gutter", "Поля игрового экрана"],
  ["--panel-inset", "Внутри карточки"],
  ["--compact-control-gap", "Компактные элементы"],
  ["--control-gap", "Соседние действия"],
  ["--control-group-gap", "Между группами"],
  ["--effect-control-gap", "Рядом с огненной кнопкой"],
  ["--effect-clearance", "Запас для эффекта"],
] as const;

/** Real game art and the shared action layout; no account, game or share requests. */
export default function GameSpacingExamples() {
  const [safe, setSafe] = useState(false);
  return (
    <div className="ds-game-spacing">
      <p className="ds-note">
        Фон до края, управление внутри полей. Это примеры: партия и приглашение
        не создаются.
      </p>
      <button
        type="button"
        className="secondary-button"
        aria-pressed={safe}
        onClick={() => setSafe((value) => !value)}
      >
        {safe ? "Скрыть safe area" : "Показать safe area"}
      </button>
      <div className="ds-spacing-previews">
        <div
          className="ds-spacing-stage"
          data-safe-area={safe}
          aria-label="Пример безопасных полей игры"
        >
          <div className="ds-spacing-hud">
            <button
              type="button"
              className="secondary-button"
              aria-label="Пауза в примере"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  d="M7 4v12M13 4v12"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
            </button>
            <strong>Уровень 1</strong>
            <button
              type="button"
              className="secondary-button"
              aria-label="Скорость в примере"
            >
              1×
            </button>
          </div>
          <FlowScene puzzle={puzzle} cells={puzzle.cells} preview />
          <div
            className="ds-spacing-queues"
            aria-label="Пример отступов между командами"
          >
            {[0, 1, 2, 3].map((color) => (
              <button
                type="button"
                key={color}
                aria-label={`Команда ${color + 1} в примере`}
              >
                <FlowCrate color={color} count={12 - color} />
              </button>
            ))}
          </div>
          <div className="ds-spacing-game-footer">
            Управление выше системной области
          </div>
        </div>
        <div
          className="ds-spacing-result"
          aria-label="Пример отступов действий после игры"
        >
          <FlowAnt color={1} size={48} />
          <h3>Готово!</h3>
          <p>Эффекту и фокусу тоже нужно место.</p>
          <div className="ui-action-stack ui-action-stack--effect">
            <button type="button" className="primary">
              Следующий уровень →
            </button>
            <FireButton aria-label="Пример кнопки вызова">
              Бросить вызов ↗
            </FireButton>
          </div>
          <button type="button" className="text-button ds-spacing-replay">
            Переиграть
          </button>
        </div>
      </div>
      <dl className="ds-spacing-roles">
        {spacingRoles.map(([token, title]) => (
          <div key={token}>
            <dt>{title}</dt>
            <dd>
              <i style={{ width: `var(${token})` }} />
              <code>{token}</code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
