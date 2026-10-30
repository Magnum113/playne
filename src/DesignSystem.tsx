import { EmailConsent } from "./EmailPreferences";
import { AccountBests } from "./AccountBests";
import { OverallStandings, OverallRules } from "./OverallLeaderboard";
import { type OverallBoard, type OverallEntry } from "./overall";
import RandomGame from "./RandomGame";
import RecordCelebration from "./RecordCelebration";
import CategoryGlyph, { type CategoryKind } from "./CategoryGlyph";
import { MarkerWord, DailySpark } from "./HandDrawn";
import useCardMotion from "./useCardMotion";
import {
  GuestTrialPanel,
  ResultStatus,
  type ResultStatusKind,
} from "./ResultStatus";
import { TextField, FieldFeedback } from "./FormField";
import { RulesDialog } from "./RulesDialog";
import DesignNavigation from "./DesignNavigation";
import ActivityExamples from "./ActivityExamples";
import ReturnExamples from "./ReturnExamples";
import { DesignPrinciples, ComponentContracts } from "./DesignPrinciplesPanel";
import { GameIntro, GameRecord, GameStartAction } from "./GameIntro";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { resultText } from "./account";
import {
  GameHeader,
  HeaderAccount,
  PlayneBrand,
  PlayneMark,
  ThemeToggle,
  DestroyWebsiteLink,
} from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import FooterSignupExamples from "./FooterSignupExamples";
import GameRankingExamples from "./GameRankingExamples";
import { ModeChoice, RoundDots, StatusMessage } from "./ui";
import { SizePreview, CirclePreview, ColorPreview } from "./Hub";
import GeoPreview from "./GeoPreview";
import LandmarkPreview from "./LandmarkPreview";
import { PressurePreview, PressureTimer } from "./PressureGame";
import LinePreview from "./LinePreview";
import { lineRules, lineScoreText } from "./lineContent";
import { BrainFeature } from "./BrainHub";
import { Palette, Swatch } from "./ColorfleGame";
import Board from "./Board";
import Silhouette from "./Silhouette";
import { objects } from "./data";
import { meters } from "./game";
import { evaluateCircle, circlePercent, type CirclePoint } from "./circle";
import { type HSV, hsvToHex, shadeScore } from "./colorfle";
import {
  componentInventory,
  designSections,
  tokenGroups,
} from "./designCatalog";
import "./design-system.css";
import {
  GEO_MODES,
  geoCanMove,
  geoIsLandmarks,
  geoIsTimed,
  geoModeFor,
  geoModeName,
  type GeoMode,
} from "./geo";

function Section({
  id,
  children,
}: {
  id: (typeof designSections)[number][0];
  children: ReactNode;
}) {
  const index = designSections.findIndex((s) => s[0] === id);
  return (
    <section className="ds-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="ds-section-heading">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <h2 id={`${id}-title`} tabIndex={-1}>
          {designSections[index][1]}
        </h2>
      </div>
      {children}
    </section>
  );
}
function Sample({
  title,
  source,
  children,
  wide = false,
}: {
  title: string;
  source?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`ds-sample${wide ? " ds-wide" : ""}`}>
      <div className="ds-sample-title">
        <h3>{title}</h3>
        {source && <code>{source}</code>}
      </div>
      <div className="ds-sample-body">{children}</div>
    </div>
  );
}
function useTokenValues(tokens: readonly string[]) {
  const [values, setValues] = useState<Record<string, string>>({});
  const names = tokens.join(" ");
  useEffect(() => {
    const read = () => {
      const css = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(
          names
            .split(" ")
            .map((token) => [token, css.getPropertyValue(token).trim()]),
        ),
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [names]);
  return values;
}
function Tokens() {
  const values = useTokenValues(
    tokenGroups.flatMap((group) => [...group.tokens]),
  );
  return (
    <>
      {tokenGroups.map((group) => (
        <div className="ds-token-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="ds-swatches">
            {group.tokens.map((token) => (
              <div className="ds-color" key={token}>
                <span
                  className="ds-color-surface"
                  style={{ background: `var(${token})` }}
                />
                <code>{token}</code>
                <span>{values[token] || "Значение из темы"}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
const spacingTokens = [1, 2, 3, 4, 5, 6, 8, 12, 16].map(
  (step) => `--space-${step}`,
);
const radiusTokens = [
  ["--radius-control", "Кнопка и поле"],
  ["--radius-inner", "Вложенная карточка"],
  ["--radius-panel", "Карточка и окно"],
  ["--radius-large", "Большой блок"],
] as const;
function LayoutTokens() {
  const values = useTokenValues([
    ...spacingTokens,
    ...radiusTokens.map(([token]) => token),
  ]);
  return (
    <div className="ds-grid">
      <Sample
        title="Шаг отступов"
        source="design-tokens.css · действующие значения"
      >
        <div className="ds-spacing">
          {spacingTokens.map((token) => (
            <div key={token}>
              <span>
                <code>{token}</code>
                <small>{values[token]}</small>
              </span>
              <i style={{ width: `var(${token})` }} />
            </div>
          ))}
        </div>
      </Sample>
      <Sample
        title="Скругления"
        source="design-tokens.css · действующие значения"
      >
        <div className="ds-radius-list">
          {radiusTokens.map(([token, title]) => (
            <div key={token} style={{ borderRadius: `var(${token})` }}>
              <strong>{values[token] || "Из токена"}</strong>
              <span>{title}</span>
              <code>{token}</code>
            </div>
          ))}
        </div>
      </Sample>
    </div>
  );
}
function ButtonExamples() {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <div className="ds-grid">
        <Sample title="Основная кнопка" source=".primary">
          <div className="ds-control-stack">
            <button
              className="primary"
              onClick={() => setNotice("Кнопка работает.")}
            >
              Начать игру <span aria-hidden="true">→</span>
            </button>
            <button
              className="primary"
              data-preview-state="hover"
              onClick={() => setNotice("Состояние наведения.")}
            >
              Наведение
            </button>
            <button
              className="primary"
              data-preview-state="focus"
              onClick={() => setNotice("Для настоящего фокуса нажми Tab.")}
            >
              Фокус с клавиатуры
            </button>
            <button
              className="primary"
              data-preview-state="active"
              onClick={() => setNotice("Состояние нажатия.")}
            >
              Нажатие
            </button>
            <button className="primary" disabled>
              Недоступно
            </button>
          </div>
        </Sample>
        <Sample title="Второстепенные действия" source="ui.css">
          <div className="ds-control-stack">
            <button
              className="secondary-button"
              onClick={() => setNotice("Второстепенное действие выполнено.")}
            >
              Попробовать ещё
            </button>
            <button
              className="text-button"
              onClick={() => setNotice("Текстовая кнопка работает.")}
            >
              Вернуться к играм
            </button>
            <button
              className="danger-button"
              onClick={() =>
                setNotice("Это демонстрация. Никакие данные не удаляются.")
              }
            >
              Удалить данные
            </button>
            <button
              className="primary"
              disabled={busy}
              aria-busy={busy}
              onClick={() => {
                setBusy(true);
                setNotice("");
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  setBusy(false);
                  setNotice("Сохранено. Это пример без отправки данных.");
                }, 1200);
              }}
            >
              {busy && <span className="ui-spinner" aria-hidden="true" />}
              {busy ? "Сохраняем…" : "Проверить загрузку"}
            </button>
          </div>
        </Sample>
        <Sample title="Ссылки" source="style.css">
          <div className="ds-control-stack">
            <a href="#results">Перейти к результатам</a>
            <a className="back-to-hub" href="/">
              ← Все игры
            </a>
            <a
              href="https://playne.ru/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть Playne в новой вкладке ↗
            </a>
            <DestroyWebsiteLink />
          </div>
        </Sample>
        <Sample title="Кнопки с иконками" source="SiteHeader.tsx">
          <div className="ds-inline">
            <ThemeToggle />
            <HeaderAccount />
            <button
              className="help-button"
              onClick={() =>
                setNotice("Правила открываются в разделе «Модальные окна».")
              }
            >
              <span className="question" aria-hidden="true">
                ?
              </span>
              Правила
            </button>
            <button
              className="color-dialog-close"
              aria-label="Пример кнопки закрытия"
              onClick={() =>
                setNotice("Кнопка закрытия: область нажатия 44 × 44.")
              }
            >
              ×
            </button>
            <button
              className="pressure-pause"
              aria-label="Пример паузы"
              onClick={() => setNotice("Пауза: пример состояния есть ниже.")}
            >
              Ⅱ
            </button>
          </div>
        </Sample>
      </div>
      <p className="ds-live-note" role="status">
        {notice ||
          "Кнопки можно нажимать. Примеры не меняют аккаунт и результаты игр."}
      </p>
    </>
  );
}
function Forms() {
  const [nickname, setNickname] = useState(""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [mode, setMode] = useState("classic"),
    [size, setSize] = useState(70);
  return (
    <div className="ds-grid">
      <Sample
        title="Поле с подсказкой и ошибкой"
        source="FormField.tsx · TextField"
      >
        <form
          className="nickname-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const valid =
              nickname.trim().length >= 2 && nickname.trim().length <= 40;
            setError(valid ? "" : "Введи от 2 до 40 символов.");
            setSaved(valid);
            if (!valid) e.currentTarget.querySelector("input")?.focus();
          }}
        >
          <TextField
            id="ds-nickname"
            label="Ник в рейтинге"
            autoComplete="off"
            placeholder="Например, Любопытный"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setSaved(false);
              setError("");
            }}
            hint="От 2 до 40 символов. Данные остаются только в этом примере."
            error={error}
            maxLength={40}
          />
          <button type="submit" className="primary">
            Сохранить ник
          </button>
          <FieldFeedback
            message={saved ? "Ник сохранён в примере." : undefined}
          />
        </form>
      </Sample>
      <Sample title="Выбор режима" source="ModeChoice">
        <ModeChoice
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "classic",
              label: "Без таймера",
              description: "В своём темпе",
            },
            {
              value: "timed",
              label: "На время",
              description: "30 секунд на раунд",
            },
          ]}
        />
        <ModeChoice
          value="classic"
          onChange={() => {}}
          disabled
          legend="Загрузка режима"
          options={[
            {
              value: "classic",
              label: "Без таймера",
              description: "Пока недоступен",
            },
            {
              value: "timed",
              label: "На время",
              description: "Пока недоступен",
            },
          ]}
        />
      </Sample>
      <Sample title="Ползунок и точная настройка" source=".range-row" wide>
        <label className="ds-field-label" htmlFor="ds-size">
          Размер предмета: {size}%
        </label>
        <div className="range-row">
          <button
            className="step-button"
            aria-label="Уменьшить размер"
            onClick={() => setSize((n) => Math.max(15, n - 1))}
          >
            −
          </button>
          <input
            id="ds-size"
            type="range"
            style={
              { "--fill": `${((size - 15) / 150) * 100}%` } as CSSProperties
            }
            min="15"
            max="165"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <button
            className="step-button"
            aria-label="Увеличить размер"
            onClick={() => setSize((n) => Math.min(165, n + 1))}
          >
            +
          </button>
        </div>
        <p className="ds-note">
          Доступны мышь, касание и стрелки на клавиатуре.
        </p>
      </Sample>
    </div>
  );
}
function Navigation() {
  const [game, setGame] = useState("Общий"),
    [period, setPeriod] = useState("Всё время"),
    [page, setPage] = useState(1);
  return (
    <>
      <div className="rank-games" role="group" aria-label="Пример выбора игры">
        {[
          "Общий",
          "На глаз",
          "Круг",
          "Оттенок",
          "Где я?",
          "Жми",
          "Одной линией",
          "Разминка для ума",
        ].map((name) => (
          <button
            key={name}
            className={
              name === "Разминка для ума" ? "rank-game-brain" : undefined
            }
            aria-pressed={game === name}
            onClick={() => {
              setGame(name);
              if (name === "Общий") setPeriod("Всё время");
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="rank-toolbar">
        {game === "Общий" ? (
          <span>За всё время</span>
        ) : (
          <div
            className="rank-period"
            role="group"
            aria-label="Пример выбора периода"
          >
            {["Неделя", "Всё время"].map((name) => (
              <button
                key={name}
                aria-pressed={period === name}
                onClick={() => setPeriod(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <span>
          {game} · {period}
        </span>
      </div>
      <div className="rank-pagination">
        <button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
          ← Назад
        </button>
        <span role="status">Страница {page} из 3</span>
        <button disabled={page === 3} onClick={() => setPage((n) => n + 1)}>
          Дальше →
        </button>
      </div>
      <p className="ds-note">
        Ссылки в оглавлении ведут к разделам; клавиша Tab показывает общий
        контур фокуса.
      </p>
    </>
  );
}
const gameCards = [
  {
    name: "На глаз",
    label: "ГЛАЗОМЕР",
    kind: "size" as CategoryKind,
    path: "/naglaz/",
    description: "Сравни размеры предметов.",
    Preview: SizePreview,
    detail: "5 раундов · 500 очков",
  },
  {
    name: "Круг",
    label: "ТОЧНОСТЬ",
    kind: "circle" as CategoryKind,
    path: "/circle/",
    description: "Нарисуй круг одним движением.",
    Preview: CirclePreview,
    detail: "Одна линия · 100% точности",
  },
  {
    name: "Оттенок",
    label: "ЧУВСТВО ЦВЕТА",
    kind: "color" as CategoryKind,
    path: "/colorfle/",
    description: "Подбери цвет на палитре.",
    Preview: ColorPreview,
    detail: "5 цветов · 500 очков",
  },
  {
    name: "Где я?",
    label: "ГЕОГРАФИЯ",
    kind: "geo" as CategoryKind,
    path: "/geo/",
    description: "Угадай место по панораме.",
    Preview: GeoPreview,
    detail: "5 мест · 500 очков",
  },
  {
    name: "Достопримечательности",
    label: "ЗНАМЕНИТЫЕ МЕСТА",
    kind: "landmark" as CategoryKind,
    path: "/geo/?mode=landmarks",
    description: "Найди известные места на карте.",
    Preview: LandmarkPreview,
    detail: "Отдельный режим и рейтинг",
  },
  {
    name: "Жми",
    label: "ВНИМАТЕЛЬНОСТЬ",
    kind: "reaction" as CategoryKind,
    path: "/pressure/",
    description: "Следуй правилу. Не ошибись.",
    Preview: PressurePreview,
    detail: "До первой ошибки",
  },
  {
    name: "Одной линией",
    label: "ЛОГИКА И МАРШРУТЫ",
    kind: "line" as CategoryKind,
    path: "/one-line/",
    description: "Соедини числа и заполни каждую клетку.",
    Preview: LinePreview,
    detail: "5 полей дня · 500 очков",
  },
];
function ComparisonDemo() {
  const [ratio, setRatio] = useState(0.7),
    [revealed, setRevealed] = useState(false),
    [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <>
      <Board
        reference={objects.eiffel}
        target={objects.rocket}
        ratio={ratio}
        revealed={revealed}
        onChange={setRatio}
        onRevealComplete={onReady}
      />
      <div className="ds-inline ds-demo-actions">
        <label className="ds-grow">
          Масштаб
          <input
            aria-label="Масштаб в примере сравнения"
            type="range"
            min=".15"
            max="1.65"
            step=".01"
            value={ratio}
            disabled={revealed}
            onChange={(e) => setRatio(Number(e.target.value))}
          />
        </label>
        <button
          className="primary"
          disabled={revealed && !ready}
          onClick={() => {
            if (revealed) {
              setRevealed(false);
              setReady(false);
              setRatio(0.7);
            } else setRevealed(true);
          }}
        >
          {revealed
            ? ready
              ? "Сбросить пример"
              : "Сравниваем…"
            : "Показать ответ"}
        </button>
      </div>
    </>
  );
}
function CircleDemo() {
  const [points, setPoints] = useState<CirclePoint[]>([]),
    [result, setResult] = useState("");
  const drawing = useRef<number | null>(null),
    stroke = useRef<CirclePoint[]>([]);
  function point(e: PointerEvent<SVGSVGElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - b.left) / b.width) * 600,
      y: ((e.clientY - b.top) / b.height) * 600,
    };
  }
  return (
    <>
      <div className="circle-surface ds-circle-demo">
        <svg
          className="circle-board"
          viewBox="0 0 600 600"
          role="img"
          aria-label="Демонстрационное поле круга"
          tabIndex={0}
          onPointerDown={(e) => {
            if (!e.isPrimary || e.button !== 0) return;
            drawing.current = e.pointerId;
            stroke.current = [point(e)];
            setPoints(stroke.current);
            setResult("");
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drawing.current !== e.pointerId) return;
            stroke.current = [...stroke.current, point(e)];
            setPoints(stroke.current);
          }}
          onPointerUp={(e) => {
            if (drawing.current !== e.pointerId) return;
            drawing.current = null;
            const r = evaluateCircle([...stroke.current, point(e)]);
            setResult(r.valid ? circlePercent(r.score) : r.message);
          }}
          onPointerCancel={() => {
            drawing.current = null;
            setResult("Начни линию заново.");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setPoints([]);
              setResult("");
            }
          }}
        >
          <circle className="circle-center-ring" cx="300" cy="300" r="12" />
          <circle className="circle-center" cx="300" cy="300" r="4" />
          {points.length > 1 && (
            <path
              className="circle-stroke"
              d={points
                .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                .join(" ")}
            />
          )}
        </svg>
      </div>
      <div className="ds-inline ds-demo-actions">
        <span className="ds-grow" role="status">
          {result || "Обведи точку. Этот круг не попадёт в рейтинг."}
        </span>
        <button
          className="secondary-button"
          onClick={() => {
            setPoints([]);
            setResult("");
          }}
        >
          Ещё раз
        </button>
      </div>
    </>
  );
}
function PressureDemo() {
  const [state, setState] = useState("normal"),
    [held, setHeld] = useState(false),
    [fraction, setFraction] = useState(65);
  return (
    <>
      <div className="ds-inline ds-press-states">
        {[
          ["normal", "Обычная"],
          ["success", "Верно"],
          ["failure", "Ошибка"],
          ["pause", "Пауза"],
        ].map(([id, label]) => (
          <button
            className="secondary-button"
            key={id}
            aria-pressed={state === id}
            onClick={() => setState(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {state === "pause" ? (
        <div className="pressure-pause-screen">
          <p className="eyebrow">ПАУЗА</p>
          <h3>Продолжим?</h3>
          <p>Текущий уровень начнётся заново.</p>
          <button className="primary" onClick={() => setState("normal")}>
            Продолжить →
          </button>
        </div>
      ) : (
        <div
          className={`pressure-button-wrap ds-pressure-demo${state === "success" ? " is-success" : state === "failure" ? " is-failure" : ""}${fraction < 25 ? " urgent" : ""}`}
        >
          <PressureTimer fraction={fraction / 100} />
          <span className="pressure-housing" aria-hidden="true" />
          <span className="pressure-button-base" aria-hidden="true" />
          <button
            className={`pressure-button${held ? " is-held" : ""}`}
            aria-label="Демонстрационная кнопка Жми"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setHeld(true);
            }}
            onPointerUp={() => setHeld(false)}
            onPointerCancel={() => setHeld(false)}
            onLostPointerCapture={() => setHeld(false)}
            onKeyDown={(e) => {
              if ([" ", "Enter"].includes(e.key)) {
                e.preventDefault();
                setHeld(true);
              }
            }}
            onKeyUp={(e) => {
              if ([" ", "Enter"].includes(e.key)) {
                e.preventDefault();
                setHeld(false);
              }
            }}
            onBlur={() => setHeld(false)}
          >
            <span className="pressure-button-face">
              <span className="pressure-button-content">
                {state === "success"
                  ? "✓"
                  : state === "failure"
                    ? "×"
                    : held
                      ? "ДЕРЖИ"
                      : "ЖМИ"}
              </span>
            </span>
          </button>
        </div>
      )}
      <label className="ds-field-label" htmlFor="ds-pressure-time">
        Кольцо времени: {fraction}%
      </label>
      <input
        id="ds-pressure-time"
        type="range"
        min="0"
        max="100"
        value={fraction}
        onChange={(e) => setFraction(Number(e.target.value))}
      />
    </>
  );
}
function ShadeDemo() {
  const [value, setValue] = useState<HSV>({ h: 172, s: 62, v: 78 });
  const [empty, setEmpty] = useState(false);
  const target: HSV = { h: 165, s: 65, v: 82 };
  return (
    <>
      <div className="shade-board ds-shade-samples">
        <Swatch label="Образец" color={target} />
        <Swatch
          label="Твой ответ"
          color={value}
          empty={empty}
          hint={empty ? undefined : `${shadeScore(value, target)} из 100`}
        />
      </div>
      <button
        className="secondary-button ds-shade-empty"
        aria-pressed={empty}
        onClick={() => setEmpty((v) => !v)}
      >
        {empty ? "Вернуть выбранный цвет" : "Показать отсутствие ответа"}
      </button>
      <Palette
        value={value}
        onChange={(next) => {
          setValue(next);
          setEmpty(false);
        }}
        headingLevel={4}
      />
      <p className="ds-note">
        Текущий цвет: {hsvToHex(value).toUpperCase()}. Палитра та же, что в
        игре.
      </p>
    </>
  );
}
function GeoDemo() {
  const [expanded, setExpanded] = useState(false),
    [pin, setPin] = useState(false);
  return (
    <>
      <div className="ds-geo-demo">
        <GeoPreview />
        <div className={`ds-geo-mini${expanded ? " expanded" : ""}`}>
          <div className="geo-map-heading">
            <h4>Где это?</h4>
            <button
              className="secondary-button"
              onClick={() => setExpanded((n) => !n)}
              aria-expanded={expanded}
            >
              {expanded ? "Свернуть" : "Увеличить"}
            </button>
          </div>
          <button
            className="ds-map-example"
            onClick={() => setPin((n) => !n)}
            aria-pressed={pin}
          >
            {pin ? "Точка выбрана" : "Выбрать точку на карте"}
          </button>
          <button
            className="primary"
            disabled={!pin}
            onClick={() => setPin(false)}
          >
            Ответить →
          </button>
        </div>
      </div>
      <p className="ds-note">
        Схема расположения панорамы и карты. Google Maps здесь не загружается.
        Панорамы, карта и оба режима управления доступны в самой игре.
      </p>
    </>
  );
}
function GeoModes() {
  const [mode, setMode] = useState<GeoMode>("classic");
  const moving = geoCanMove(mode),
    timed = geoIsTimed(mode),
    landmarks = geoIsLandmarks(mode);
  return (
    <div className="ds-grid">
      <ModeChoice
        className="geo-mode-choice"
        legend="Места"
        value={landmarks ? "landmarks" : "world"}
        onChange={(value) =>
          setMode(geoModeFor(moving, timed, value === "landmarks"))
        }
        options={[
          { value: "world", label: "Весь мир", description: "Города и дороги" },
          {
            value: "landmarks",
            label: "Достопримечательности",
            description: "Знаменитые места",
          },
        ]}
      />
      {!landmarks && (
        <ModeChoice
          className="geo-mode-choice"
          legend="Перемещение"
          value={moving ? "yes" : "no"}
          onChange={(value) => setMode(geoModeFor(value === "yes", timed))}
          options={[
            {
              value: "no",
              label: "Без перемещения",
              description: "Осмотр одной точки",
            },
            {
              value: "yes",
              label: "С перемещением",
              description: "Можно идти по улице",
            },
          ]}
        />
      )}
      <ModeChoice
        className="geo-mode-choice"
        legend="Время"
        value={timed ? "yes" : "no"}
        onChange={(value) =>
          setMode(geoModeFor(moving, value === "yes", landmarks))
        }
        options={[
          {
            value: "no",
            label: "Без таймера",
            description: "Без ограничения времени",
          },
          {
            value: "yes",
            label: "На время",
            description: "Таймер на каждый раунд",
          },
        ]}
      />
      <div className="ds-mode-summary">
        <span>Выбранный режим</span>
        <strong>{geoModeName(mode)}</strong>
        <p>
          Всего режимов: {GEO_MODES.length}. У каждого свой рейтинг. В
          достопримечательностях перемещение отключено. Это пример выбора —
          партия не запускается.
        </p>
      </div>
    </div>
  );
}
function SaveStates() {
  const [state, setState] = useState<ResultStatusKind>("checking");
  return (
    <>
      <div
        className="rank-period ds-save-tabs"
        role="group"
        aria-label="Пример сохранения результата"
      >
        {(
          [
            ["restoring", "Восстановление"],
            ["checking", "Проверка"],
            ["saving", "Отправка"],
            ["check-error", "Ошибка проверки"],
            ["save-error", "Ошибка отправки"],
            ["saved", "Сохранено"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-pressed={state === id}
            onClick={() => setState(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <ResultStatus
        state={state}
        ranking="/leaderboard/"
        onRetry={state.endsWith("error") ? () => setState("saving") : undefined}
      />
      <p className="ds-note">
        Пример без отправки данных. Повтор переводит его в ожидание; успешное
        сохранение выбери отдельной кнопкой.
      </p>
    </>
  );
}
function GuestPromptDemo() {
  const [notice, setNotice] = useState("");
  return (
    <>
      <GuestTrialPanel>
        <button
          className="primary yandex-login"
          onClick={() => setNotice("Это пример. Вход в Яндекс не открывается.")}
        >
          Войти и продолжить <span aria-hidden="true">→</span>
        </button>
      </GuestTrialPanel>
      <p className="ds-note" role="status">
        {notice || "Демонстрация: кнопка не открывает авторизацию."}
      </p>
    </>
  );
}
function Results() {
  const [profileState, setProfileState] = useState("scores");
  const example: OverallEntry = {
    nickname: "Твой ник",
    score: 5186,
    place: 3,
    gamesPlayed: 7,
    isMe: true,
    contributions: [
      { game: "naglaz", mode: "classic", score: 322, points: 644 },
      { game: "circle", mode: "classic", score: 88.1, points: 881 },
      { game: "colorfle", mode: "timed", score: 421, points: 842 },
      { game: "geo", mode: "moving", score: 343, points: 686 },
      { game: "pressure", mode: "classic", score: 42, points: 456 },
      { game: "line", mode: "classic", score: 426, points: 852 },
      { game: "brain", mode: "classic", score: 825, points: 825 },
    ],
  };
  const top: OverallBoard = {
    game: "overall",
    period: "all",
    version: 3,
    page: 1,
    limit: 5,
    total: 24,
    mine: example,
    entries: [
      "Любопытный",
      "Исследователь далёких городов и стран",
      "Твой ник",
      "Следопыт",
      "Игрок",
    ].map((nickname, i) => ({
      ...example,
      nickname,
      place: i + 1,
      isMe: i === 2,
      score: example.score + (2 - i) * 100,
      contributions: example.contributions.map((p) =>
        p.game === "naglaz"
          ? {
              ...p,
              score: p.score + (2 - i) * 50,
              points: p.points + (2 - i) * 100,
            }
          : p,
      ),
    })),
  };
  return (
    <div className="ds-grid">
      <Sample
        title="Серия, рекомендации и мобильные рейтинги"
        source="HeaderStreakLink · TodayPlayCard · PlayStreakCard · StreakBoardView"
        wide
      >
        <ReturnExamples overall={top} />
      </Sample>
      <Sample
        title="Общий рейтинг и вклад игр"
        source="OverallLeaderboard.tsx · overall.css"
        wide
      >
        <p className="ds-note">
          Демонстрационные данные. Шесть игр и категория «Разминка для ума» с
          равным весом. Для «Одной линией» — лучший дневной результат режима
          «Задача дня», для остальных — лучший режим. Вертикальный список:
          справа от игр на десктопе и над играми на телефоне. Мятно-сиреневый
          блик проходит по контуру за 9 секунд и замирает при наведении или
          фокусе. При уменьшении движения контур статичен, а появление строк
          происходит без анимации.
        </p>
        <p className="ds-note">
          Нажми на игрока, чтобы раскрыть вклад каждой игры. Вся строка доступна
          с клавиатуры.
        </p>
        <OverallStandings entries={top.entries.slice(0, 3)} />
        <OverallRules />
      </Sample>
      <Sample title="Разные единицы результата" source="resultText">
        <div className="ds-stat-grid">
          {[
            ["На глаз", resultText("naglaz", 438)],
            ["Круг", resultText("circle", 98.6)],
            ["Оттенок", resultText("colorfle", 482)],
            ["Где я?", resultText("geo", 420)],
            ["Жми", resultText("pressure", 31)],
            ["Одной линией", resultText("line", 426)],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Sample>
      <Sample title="Результат партии" source=".shade-result">
        <div className="ds-result-demo">
          <p className="eyebrow">ТВОЙ РЕЗУЛЬТАТ</p>
          <h4>438 из 500</h4>
          <p>Все пять раундов пройдены.</p>
          <div className="shade-round-scores">
            {[88, 94, 89, 83, 84].map((n, i) => (
              <span key={i}>
                {i + 1}: {n}
              </span>
            ))}
          </div>
          <div className="save-result">
            <a href="/leaderboard/">Рейтинг игры →</a>
          </div>
        </div>
      </Sample>
      <Sample title="Таблица и своя строка" source=".rank-table" wide>
        <table className="rank-table">
          <caption className="sr-only">
            Пример рейтинга с вымышленными игроками
          </caption>
          <thead>
            <tr>
              <th scope="col">Место</th>
              <th scope="col">Игрок</th>
              <th scope="col">Результат</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["1", "Любопытный", "492 / 500"],
              ["2", "Исследователь", "481 / 500"],
              ["3", "Твой ник", "438 / 500"],
            ].map(([position, name, score]) => (
              <tr key={position} className={position === "3" ? "my-entry" : ""}>
                <td className="rank-position">{position}</td>
                <td>
                  <strong>{name}</strong>
                  {position === "3" && (
                    <span className="you-label">Это ты</span>
                  )}
                  <small className="rank-rounds">
                    {[88, 94, 89, 83, 84].map((n, i) => (
                      <span key={i}>{n}</span>
                    ))}
                  </small>
                </td>
                <td className="rank-score">{score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="my-rank">
          <span>Твоё место: 3</span>
          <strong>438 / 500</strong>
        </div>
      </Sample>
      <Sample
        title="Лучшие результаты по играм"
        source="AccountBests.tsx · community.css"
        wide
      >
        <p className="ds-note">
          Название игры — один раз, режимы — внутри её блока. Каждая строка
          открывает рейтинг своего режима за всё время. Нулевой результат и
          отсутствие партии — разные состояния.
        </p>
        <div
          className="rank-period ds-save-tabs"
          role="group"
          aria-label="Состояние лучших результатов"
        >
          {[
            ["scores", "С результатами"],
            ["empty", "Без результатов"],
            ["maximum", "Большой рекорд"],
            ["loading", "Загрузка"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={profileState === id}
              onClick={() => setProfileState(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <AccountBests
          best={
            profileState === "loading"
              ? undefined
              : profileState === "empty"
                ? []
                : [
                    { game: "naglaz", mode: "classic", score: 322 },
                    { game: "circle", mode: "classic", score: 88.1 },
                    {
                      game: "pressure",
                      mode: "classic",
                      score: profileState === "maximum" ? 25000 : 42,
                    },
                    { game: "colorfle", mode: "classic", score: 131 },
                    { game: "colorfle", mode: "timed", score: 421 },
                    {
                      game: "line",
                      mode: "classic",
                      score: profileState === "maximum" ? 500 : 426,
                    },
                    { game: "line", mode: "practice", score: 470 },
                    { game: "geo", mode: "classic", score: 60 },
                    { game: "geo", mode: "timed", score: 0 },
                    { game: "geo", mode: "moving", score: 343 },
                    { game: "geo", mode: "moving-timed", score: 48 },
                    { game: "geo", mode: "landmarks", score: 317 },
                  ]
          }
        />
      </Sample>
      <Sample title="История партий" source=".account-history" wide>
        <ul className="account-history">
          <li>
            <div>
              Оттенок<small>Сегодня · Без таймера</small>
            </div>
            <strong>482 / 500</strong>
          </li>
        </ul>
      </Sample>
    </div>
  );
}
function Dialogs() {
  const rules = useRef<HTMLDialogElement>(null),
    confirmation = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="ds-inline">
        <button className="primary" onClick={() => rules.current?.showModal()}>
          Открыть правила
        </button>
        <button
          className="secondary-button"
          onClick={() => confirmation.current?.showModal()}
        >
          Открыть подтверждение
        </button>
      </div>
      <p className="ds-note">
        Фокус остаётся внутри окна. Escape закрывает его и возвращает фокус к
        кнопке.
      </p>
      <p role="status" className="ds-live-note">
        {notice}
      </p>
      <RulesDialog
        dialogRef={rules}
        title="Как играть"
        titleId="ds-rules-title"
      >
        <p>Каждая игра начинается с короткого правила.</p>
        <ol>
          <li>Прочитай условие.</li>
          <li>Дай ответ и посмотри результат.</li>
          <li>Попробуй побить свой рекорд.</li>
        </ol>
        <p className="help-meta">
          Это пример модального окна. Партия не запускается.
        </p>
      </RulesDialog>
      <dialog
        ref={confirmation}
        className="color-rules-dialog"
        aria-labelledby="ds-confirm-title"
      >
        <div className="dialog-top">
          <h2 id="ds-confirm-title">Сбросить пример?</h2>
          <button
            className="color-dialog-close"
            aria-label="Закрыть подтверждение"
            onClick={() => confirmation.current?.close()}
          >
            ×
          </button>
        </div>
        <p>Изменится только эта демонстрация. Аккаунт и рекорды останутся.</p>
        <div className="ds-inline">
          <button
            className="secondary-button"
            onClick={() => confirmation.current?.close()}
          >
            Отмена
          </button>
          <button
            className="danger-button"
            onClick={() => {
              setNotice("Пример сброшен.");
              confirmation.current?.close();
            }}
          >
            Сбросить пример
          </button>
        </div>
      </dialog>
    </>
  );
}
function Artwork() {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.values(objects);
  return (
    <>
      <p className="ds-note">
        Все {entries.length} объектов из каталога «На глаз». Пропорции и вырезы
        совпадают с игровыми; силуэты перекрашиваются вместе с темой.
      </p>
      <button
        className="secondary-button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="ds-artwork-grid"
      >
        {expanded
          ? "Свернуть иллюстрации"
          : `Показать все иллюстрации (${entries.length})`}
      </button>
      <div className="ds-artwork-grid" id="ds-artwork-grid">
        {(expanded ? entries : entries.slice(0, 6)).map((object) => {
          const k = Math.min(100 / object.width, 100 / object.height);
          return (
            <figure key={object.id}>
              <svg viewBox="0 0 120 120" role="img" aria-label={object.name}>
                <Silhouette
                  object={object}
                  x={(120 - object.width * k) / 2}
                  y={(120 - object.height * k) / 2}
                  scale={k}
                />
              </svg>
              <figcaption>
                {object.name}
                <small>
                  {meters(object.size)} ·{" "}
                  {object.axis === "x" ? "длина" : "высота"}
                </small>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </>
  );
}

function EmailConsentDemo() {
  const [checked, setChecked] = useState(false),
    [data, setData] = useState(false);
  return (
    <EmailConsent
      checked={checked}
      onChange={setChecked}
      dataConsent={data}
      onDataChange={setData}
    />
  );
}

function MotionExamples() {
  const [drawing, setDrawing] = useState(0);
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <p className="ds-note">
        Движение объясняет действие. Обложки выше проигрывают один короткий
        эпизод при наведении или фокусе. На сенсорном экране — по очереди, один
        раз при появлении. Системная настройка уменьшения движения отключает эти
        эффекты.
      </p>
      <div className="ds-grid">
        <Sample title="Случайная игра" source="RandomGame.tsx">
          <RandomGame demo />
          <p className="ds-note">
            В каталоге после перемешивания открывается игра. Здесь — ссылка на
            выбранную игру.
          </p>
        </Sample>
        <Sample title="Рисованные акценты" source="HandDrawn.tsx">
          <div key={drawing} className="ds-marker-demo">
            Во что <MarkerWord>сыграем?</MarkerWord>
            <DailySpark />
          </div>
          <button
            className="secondary-button"
            onClick={() => setDrawing((n) => n + 1)}
          >
            Повторить рисунок
          </button>
          <p className="ds-note">
            Подчёркивание и звезда рисуются один раз при появлении в области
            просмотра.
          </p>
        </Sample>
        <Sample title="Ощутимое нажатие" source=".tactile · .card-play">
          <button className="primary tactile" onClick={() => setPressed(true)}>
            Играть <span aria-hidden="true">→</span>
          </button>
          <p className="ds-note" role="status">
            {pressed
              ? "Нажатие сработало."
              : "Нажми мышью, пальцем или клавишей пробела."}
          </p>
          <p className="ds-note">
            Основание высотой 3 px. При нажатии поверхность опускается; размер
            области нажатия остаётся прежним.
          </p>
        </Sample>
        <Sample title="Реакции значков" source="CategoryGlyph.tsx">
          <div className="ds-glyphs">
            {(
              [
                ["memory", "Память"],
                ["logic", "Логика"],
                ["reaction", "Реакция"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                className="secondary-button game-card ds-glyph-button"
                type="button"
              >
                <CategoryGlyph kind={kind} />
                {label}
              </button>
            ))}
          </div>
          <p className="ds-note">
            Наведи курсор или перейди клавишей Tab: у каждого навыка свой
            короткий жест.
          </p>
        </Sample>
        <Sample title="Новый рекорд" source="RecordCelebration.tsx" wide>
          <RecordCelebration demo />
          <p className="ds-note">
            Показывается на главной один раз после улучшения результата. Демо не
            меняет рекорды и не отправляет результат.
          </p>
        </Sample>
      </div>
      <p className="ds-note">
        Контур Топ‑5 — в разделе <a href="#results">«Результаты и рейтинг»</a>:
        медленный оборот за 9 секунд, пауза при наведении и фокусе. При
        уменьшении движения контур неподвижен.
      </p>
    </>
  );
}

export default function DesignSystem() {
  const motionRef = useCardMotion<HTMLElement>();
  const rules = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const inventory = componentInventory.filter((row) =>
    row
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <div className="app ds-app">
      <a className="skip-link" href="#ds-main">
        Перейти к компонентам
      </a>
      <GameHeader ranking />
      <main id="ds-main" className="ds-main" ref={motionRef}>
        <div className="ds-hero">
          <div>
            <p className="eyebrow">PLAYNE · ДИЗАЙН-СИСТЕМА</p>
            <h1>
              Всё, из чего
              <br />
              собран <span>Playne.</span>
            </h1>
            <p>
              Принципы, рабочие компоненты и правила их применения. Один
              источник для всех игр.
            </p>
          </div>
          <div className="ds-hero-meta">
            <PlayneMark />
            <p>
              Светлая и тёмная темы.
              <br />
              Телефон и компьютер.
              <br />
              Одна система для всех игр.
            </p>
            <a href="#inventory">
              Группы компонентов: {componentInventory.length} →
            </a>
          </div>
        </div>
        <div className="ds-layout">
          <DesignNavigation />
          <div className="ds-content">
            <Section id="principles">
              <DesignPrinciples />
            </Section>
            <Section id="foundations">
              <p className="ds-note">
                Общие переменные берутся из <code>design-tokens.css</code>.
                Переключатель темы в шапке меняет весь каталог, включая игровые
                компоненты.
              </p>
              <Tokens />
              <div className="ds-grid ds-theme-pair">
                {(["light", "dark"] as const).map((theme) => (
                  <div
                    key={theme}
                    className="ds-theme-sample"
                    data-theme-scope={theme}
                  >
                    <span className="eyebrow">
                      {theme === "light" ? "СВЕТЛАЯ ТЕМА" : "ТЁМНАЯ ТЕМА"}
                    </span>
                    <h3>Сыграем ещё?</h3>
                    <p>
                      Светлая включена по умолчанию. Выбранная тема сохраняется.
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        document
                          .getElementById("actions")
                          ?.scrollIntoView({ behavior: "instant" })
                      }
                    >
                      Посмотреть кнопки →
                    </button>
                  </div>
                ))}
              </div>
            </Section>
            <Section id="type">
              <div className="ds-type-specimen">
                <span className="eyebrow">ЗАГОЛОВКИ, ТЕКСТ И ЧИСЛА</span>
                <p className="ds-display">Есть пара минут?</p>
                <h3>Узнай что-нибудь новое.</h3>
                <p>
                  Проверь глазомер, чувство цвета и знание мира. Обычный текст
                  помогает понять правило и перейти к игре.
                </p>
                <small>Подсказки и подписи: коротко и по делу.</small>
                <div className="ds-numerals">
                  0123456789 <span>98,6%</span>
                </div>
              </div>
              <dl className="ds-spec-list">
                <div>
                  <dt>Шрифт</dt>
                  <dd>
                    Системный sans-serif. Inter используется, если установлен;
                    затем — системный шрифт устройства. Без загрузки внешних
                    шрифтов.
                  </dd>
                </div>
                <div>
                  <dt>Размеры</dt>
                  <dd>
                    12–14 px — подписи; 16 px — текст и поля; 24–28 px —
                    подзаголовки; 36–68 px — заголовок страницы.
                  </dd>
                </div>
                <div>
                  <dt>Числа</dt>
                  <dd>
                    Табличные цифры в счёте и таймере. Десятичная запятая в
                    процентах. 1 очко, 2 очка, 5 очков.
                  </dd>
                </div>
                <div>
                  <dt>Текст</dt>
                  <dd>
                    Русский язык. «Начать игру», «Ответить», «Попробовать ещё».
                    Без сокращений там, где помещается полное слово.
                  </dd>
                </div>
              </dl>
            </Section>
            <Section id="layout">
              <LayoutTokens />
              <dl className="ds-spec-list">
                <div>
                  <dt>Контейнер</dt>
                  <dd>
                    1184 px — основные страницы; 1220 px — каталог игр; 1376 px
                    — панорамы. На телефоне по 20 px от края.
                  </dd>
                </div>
                <div>
                  <dt>Действия</dt>
                  <dd>
                    Основная кнопка — минимум 52 px высотой; компактное действие
                    на карте — 48 px. Иконки — область нажатия 44 × 44 px.
                    Расстояние между соседними действиями — 8–16 px.
                  </dd>
                </div>
                <div>
                  <dt>Сетка</dt>
                  <dd>
                    Две колонки карточек на компьютере, одна на телефоне.
                    Содержимое может переноситься без горизонтального скролла.
                  </dd>
                </div>
                <div>
                  <dt>Тени</dt>
                  <dd>
                    <code>--card-shadow</code> для небольшого подъёма;{" "}
                    <code>--dialog-shadow</code> для модального окна. Границы
                    отделяют содержимое.
                  </dd>
                </div>
              </dl>
            </Section>
            <Section id="brand">
              <div className="ds-grid">
                <Sample
                  title="Знак и логотип"
                  source="PlayneMark · PlayneBrand"
                >
                  <div className="ds-brand-row">
                    <PlayneMark />
                    <PlayneBrand />
                  </div>
                  <p className="ds-note">
                    Векторный знак встроен в страницу и не требует отдельного
                    запроса. У рисунка сохраняются исходные пропорции.
                  </p>
                </Sample>
                <Sample
                  title="Иконки и состояния темы"
                  source="SiteHeader.tsx · account.tsx"
                >
                  <div className="ds-inline">
                    <HeaderAccount />
                    <ThemeToggle />
                    <span className="question" aria-label="Знак справки">
                      ?
                    </span>
                  </div>
                  <p className="ds-note">
                    Иконки управления — 20 px, линия 1,7 px. У кнопок без
                    подписи есть название для скринридера.
                  </p>
                </Sample>
              </div>
            </Section>
            <Section id="actions">
              <ButtonExamples />
            </Section>
            <Section id="forms">
              <Forms />
            </Section>
            <Section id="navigation">
              <Navigation />
            </Section>
            <Section id="cards">
              <p className="ds-note">
                Основной каталог и отдельная подборка разминки. Те же
                изображения и классы, что на главной. Вся карточка — ссылка.
              </p>
              <div className="game-cards ds-game-cards">
                {gameCards.map(
                  ({
                    name,
                    label,
                    kind,
                    path,
                    description,
                    Preview,
                    detail,
                  }) => (
                    <a
                      key={name}
                      className={`game-card game-card-live${path.includes("landmarks") ? " landmark-card" : ""}`}
                      href={path}
                    >
                      <div className="card-topline">
                        <span className="card-category">
                          <CategoryGlyph kind={kind} />
                          {label}
                        </span>
                      </div>
                      <Preview />
                      <div className="card-copy">
                        <h3>
                          {name}
                          {!name.endsWith("?") && (
                            <span className="brand-dot">.</span>
                          )}
                        </h3>
                        <p>{description}</p>
                      </div>
                      <div className="card-bottom">
                        <span>{detail}</span>
                        <span className="card-play">
                          Играть <span aria-hidden="true">→</span>
                        </span>
                      </div>
                    </a>
                  ),
                )}
              </div>
            </Section>
            <BrainFeature />
            <Section id="motion">
              <MotionExamples />
            </Section>
            <Section id="gameplay">
              <Sample
                title="Старт игры и личный рекорд"
                source="GameIntro.tsx · game-start.css"
              >
                <GameIntro
                  title="Оттенок"
                  eyebrow="ПОПАДИ В ЦВЕТ"
                  description="Подбери цвет как можно точнее."
                  headingLevel={4}
                  record={{ value: 482, max: 500, modeLabel: "Без таймера" }}
                  onRules={() => rules.current?.showModal()}
                />
                <div className="ds-inline">
                  <GameRecord value={92.4} unit="%" />
                  <GameRecord value={32} unit="очка" />
                  <GameRecord value={0} max={500} />
                </div>
                <GameStartAction
                  onStart={() => rules.current?.showModal()}
                  caption="Одинаковая кнопка запуска на стартовых экранах."
                />
                <RulesDialog
                  dialogRef={rules}
                  title="Начальный экран"
                  titleId="ds-start-rules"
                >
                  <p>
                    Рекорд зависит от выбранного режима. Здесь показаны варианты
                    его отображения.
                  </p>
                </RulesDialog>
              </Sample>
              <div className="ds-sample">
                <div className="ds-sample-title">
                  <h3>Раунд, прогресс, счёт и таймер</h3>
                  <code>RoundDots</code>
                </div>
                <div className="ds-sample-body">
                  <div className="shade-status">
                    <div>
                      <span className="eyebrow">РАУНД 3 ИЗ 5</span>
                      <RoundDots
                        current={2}
                        completed={2}
                        className="shade-dots"
                      />
                    </div>
                    <div className="shade-status-right">
                      <span className="shade-timer">00:30</span>
                      <div className="shade-score">
                        Очки <strong>178</strong> / 500
                      </div>
                    </div>
                  </div>
                  <div className="ds-inline">
                    <span className="shade-timer urgent">00:05</span>
                    <span className="ds-note">
                      Мало времени: цвет сопровождается числом.
                    </span>
                  </div>
                </div>
              </div>
              <Sample
                title="На глаз: сцена и раскрытие ответа"
                source="Board.tsx"
              >
                <ComparisonDemo />
              </Sample>
              <div className="ds-grid">
                <Sample
                  title="Круг: рисование и результат"
                  source="circle.css · evaluateCircle"
                >
                  <CircleDemo />
                </Sample>
                <Sample
                  title="Жми: кнопка и кольцо"
                  source="PressureTimer · pressure.css"
                >
                  <PressureDemo />
                </Sample>
              </div>
              <Sample
                title="Одной линией: поле, числа и маршрут"
                source="LinePreview.tsx · lineContent.ts"
              >
                <LinePreview />
                <div className="ds-prose">
                  <ol>
                    {lineRules.map(({ title, text }) => (
                      <li key={title}>
                        <strong>{title}</strong> {text}
                      </li>
                    ))}
                  </ol>
                  <p>{lineScoreText}</p>
                  <a href="/one-line/">Открыть игру «Одной линией» →</a>
                </div>
              </Sample>
              <Sample
                title="Оттенок: образец и палитра"
                source="Palette · Swatch"
              >
                <ShadeDemo />
              </Sample>
              <Sample
                title="Где я: панорама и мини-карта"
                source="GeoGame.tsx · geo.css"
              >
                <GeoDemo />
              </Sample>
              <Sample
                title="Где я: все сочетания режимов"
                source="geoModeFor · ModeChoice"
              >
                <GeoModes />
              </Sample>
            </Section>
            <Section id="results">
              <Sample
                title="Рейтинг справа от результата"
                source="GameLeaderboard.tsx · GameResultLayout.tsx"
              >
                <p className="ds-note">
                  На десктопе — справа от итогов, в «Круге» — постоянно. Пять
                  строк и своё место без дублирования. Данные демонстрационные.
                </p>
                <GameRankingExamples />
              </Sample>
              <Sample
                title="Активность за неделю"
                source="PlayWeek.tsx · настоящий компонент с вымышленными данными"
              >
                <ActivityExamples />
              </Sample>
              <Sample
                title="Вход после гостевой партии"
                source="ResultStatus.tsx · GuestTrialPanel"
              >
                <p className="ds-note">
                  Гостю доступна полная партия каждой игры. После неё следующая
                  попытка требует входа через Яндекс. Завершённый результат
                  сохраняется автоматически после входа.
                </p>
                <GuestPromptDemo />
              </Sample>
              <Sample
                title="Добровольные письма"
                source="EmailPreferences.tsx · EmailConsent"
              >
                <p className="ds-note">
                  Обе галочки выключены по умолчанию. Выбор не влияет на доступ
                  к входу и рейтингу.
                </p>
                <EmailConsentDemo />
              </Sample>
              <Results />
              <Sample
                title="Сохранение результата: все состояния"
                source="ResultStatus.tsx · тот же компонент в игре"
              >
                <SaveStates />
              </Sample>
            </Section>
            <Section id="overlays">
              <Dialogs />
            </Section>
            <Section id="feedback">
              <div className="ds-grid">
                <StatusMessage
                  tone="success"
                  title="Результат сохранён"
                  live={false}
                >
                  Он уже появился в рейтинге.
                </StatusMessage>
                <StatusMessage
                  tone="danger"
                  title="Не удалось связаться с сервером"
                  live={false}
                >
                  Проверь соединение и попробуй ещё раз. Результат остался на
                  устройстве.
                </StatusMessage>
                <StatusMessage
                  tone="info"
                  title="Проверяем результат"
                  live={false}
                >
                  Обычно это занимает несколько секунд.
                </StatusMessage>
                <StatusMessage
                  tone="warning"
                  title="Время заканчивается"
                  live={false}
                >
                  Осталось 5 секунд на ответ.
                </StatusMessage>
                <Sample title="Загрузка" source=".geo-loader">
                  <div className="ds-loading" role="status">
                    <span className="geo-loader" aria-hidden="true" />
                    <span>Загружаем панораму…</span>
                  </div>
                </Sample>
                <Sample title="Пустое состояние" source=".rank-empty">
                  <div className="rank-empty">
                    <h3>Пока нет результатов</h3>
                    <p>Сыграй первым и займи место в рейтинге.</p>
                    <a className="primary" href="/">
                      Выбрать игру →
                    </a>
                  </div>
                </Sample>
              </div>
              <p className="ds-note">
                Отключённые кнопки остаются узнаваемыми. Ошибки обозначаются
                текстом, а не только цветом. Системная настройка «Уменьшение
                движения» отключает декоративные анимации.
              </p>
              <p className="error">
                Пример обычной строки ошибки: не удалось сохранить ник.
              </p>
            </Section>
            <Section id="content">
              <div className="ds-grid">
                <Sample title="Правила, списки и ссылки" source="GuidePage.tsx">
                  <div className="ds-prose">
                    <h4>Как получить точный результат</h4>
                    <p>
                      Начни с простого: прочитай правило и посмотри на образец.
                    </p>
                    <ol>
                      <li>Сравни предметы или цвета.</li>
                      <li>Дай ответ.</li>
                      <li>Посмотри, что получилось.</li>
                    </ol>
                    <blockquote>Иногда лучший ход — не спешить.</blockquote>
                    <a href="/guides/">Все правила и советы →</a>
                  </div>
                </Sample>
                <Sample title="Вопросы и ответы" source=".pressure-faq">
                  <div className="pressure-faq ds-faq">
                    <details>
                      <summary>Нужно регистрироваться?</summary>
                      <p>
                        Первая партия каждой игры — без входа. Дальше нужен
                        бесплатный вход через Яндекс; результат сохранится в
                        рейтинге.
                      </p>
                    </details>
                    <details>
                      <summary>Можно играть на телефоне?</summary>
                      <p>
                        Да. Управление подходит для касаний и небольшого экрана.
                      </p>
                    </details>
                  </div>
                </Sample>
              </div>
              <Sample title="Общий футер" source="FooterLinks.tsx">
                <FooterLinks />
              </Sample>
              <Sample
                title="Вход и письма в футере"
                source="FooterSignup.tsx · FooterSignupView"
              >
                <p className="ds-note">
                  Пример без запросов к аккаунту. Галочка подключает подписку
                  только в демонстрации.
                </p>
                <FooterSignupExamples />
              </Sample>
            </Section>
            <Section id="artwork">
              <Artwork />
            </Section>
            <Section id="contracts">
              <ComponentContracts />
            </Section>
            <Section id="inventory">
              <label className="ds-field-label" htmlFor="ds-search">
                Найти компонент или исходный файл
              </label>
              <input
                id="ds-search"
                className="ui-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Например, таймер, палитра или модальное окно"
              />
              <p className="ds-note" role="status">
                Показано {inventory.length} из {componentInventory.length}{" "}
                групп.
              </p>
              <div className="ds-inventory">
                {inventory.map(([name, source, section]) => (
                  <a href={`#${section}`} key={name}>
                    <strong>{name}</strong>
                    <code>{source}</code>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
                {!inventory.length && (
                  <p>Ничего не найдено. Попробуй другое название.</p>
                )}
              </div>
            </Section>
            <Section id="audit">
              <p className="ds-note">
                Обновлено 30 октября 2026. Ниже — выполненные изменения;
                критерии будущих проверок находятся в разделе «Правила
                компонентов».
              </p>
              <ol className="ds-audit">
                <li>
                  <h3>Общий код вместо отдельных демонстраций</h3>
                  <p>
                    Поля, ошибки, состояния сохранения и правила игры используют
                    одни компоненты в каталоге и продукте. Значения отступов и
                    радиусов читаются из действующих токенов.
                  </p>
                </li>
                <li>
                  <h3>Понятная навигация по системе</h3>
                  <p>
                    Поиск доступен в оглавлении, текущий раздел выделен. На
                    телефоне оглавление раскрывается по запросу; переход
                    сохраняет видимость заголовка и передаёт ему фокус.
                  </p>
                </li>
                <li>
                  <h3>Общая шапка и управление</h3>
                  <p>
                    Все игры, рейтинг и кабинет используют один компонент шапки.
                    Кнопки закрытия и паузы имеют область нажатия 44 px; кнопка
                    входа оформлена как кнопка без подчёркивания.
                  </p>
                </li>
                <li>
                  <h3>Навигация по играм и режимам</h3>
                  <p>
                    Основной каталог, разминка и рейтинг перестраиваются по
                    доступной ширине. У «Одной линией» больше места для длинного
                    названия. На телефоне вкладки остаются доступны без
                    горизонтальной прокрутки.
                  </p>
                </li>
                <li>
                  <h3>Состояния в обеих темах</h3>
                  <p>
                    Для ошибок, фокуса, полей и загрузки используются общие
                    переменные. Светлый цвет ошибки из тёмной темы заменён на
                    читаемый в каждой теме.
                  </p>
                </li>
                <li>
                  <h3>Единые детали</h3>
                  <p>
                    Выбор режима, точки раундов, поля, скругления, отступы и
                    модальные окна используют общие правила. Переключатели темы
                    на одной странице обновляются вместе.
                  </p>
                </li>
                <li>
                  <h3>Длинные подписи и узкие контейнеры</h3>
                  <p>
                    Варианты режима перестраиваются по доступной ширине блока.
                    Длинные названия переносятся целиком или по словам; текст не
                    скрывается за краем карточки. Рекорды на узком экране
                    располагаются друг под другом.
                  </p>
                </li>
                <li>
                  <h3>Проверка без влияния на аккаунт</h3>
                  <p>
                    Примеры палитры, круга, размеров и кнопки работают локально.
                    Они не создают партии, не публикуют результаты и не вызывают
                    платные запросы Google.
                  </p>
                </li>
              </ol>
              <p className="ds-note">
                Каталог показывает общие компоненты и игровые примеры Playne.
                Элементы интерфейса сторонних карт и страницы входа Яндекса
                остаются у соответствующих сервисов. Полную проверку
                скринридером этот каталог не заменяет.
              </p>
            </Section>
          </div>
        </div>
      </main>
      <footer className="community-footer">
        <FooterLinks />
      </footer>
    </div>
  );
}
