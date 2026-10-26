import {
  GuestSavedNotice,
  useGuestTrial,
  loginToPlay,
  type GameId,
} from "./account";
import type { ReactNode } from "react";

export type GameRecordData = {
  value: number;
  max?: number;
  unit?: string;
  modeLabel?: string;
  hint?: string;
};
export function GameRecord({
  value,
  max,
  unit,
  modeLabel,
  hint,
}: GameRecordData) {
  const number = value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const suffix = max ? `/ ${max}` : unit;
  return (
    <div
      className="game-record"
      title={hint ?? "Личный рекорд в этом браузере"}
    >
      <span className="game-record-label">Твой рекорд</span>
      <div
        className="game-record-value"
        aria-label={
          value > 0 ? `${number} ${suffix ?? ""}` : "Пока нет рекорда"
        }
      >
        <strong>{value > 0 ? number : "—"}</strong>
        {value > 0 && suffix && <span>{suffix}</span>}
      </div>
      <small>{modeLabel ?? "В этом браузере"}</small>
    </div>
  );
}
export function GameIntro({
  title,
  eyebrow,
  description,
  descriptionId,
  record,
  onRules,
  punctuation = ".",
  headingLevel = 1,
}: {
  title: string;
  eyebrow: string;
  description?: ReactNode;
  descriptionId?: string;
  record?: GameRecordData;
  onRules?: () => void;
  punctuation?: "." | "?";
  headingLevel?: 1 | 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4";
  return (
    <div className={`game-intro${record ? "" : " game-intro-no-record"}`}>
      <div className="game-intro-title">
        <p className="eyebrow">{eyebrow}</p>
        <Heading className="game-intro-heading">
          {title}
          <span className="brand-dot">{punctuation}</span>
        </Heading>
      </div>
      {record && <GameRecord {...record} />}
      {description && (
        <p id={descriptionId} className="game-intro-description">
          {description}
        </p>
      )}
      {onRules && (
        <button
          className="help-button game-intro-help"
          onClick={onRules}
          aria-label="Как играть"
        >
          <span className="game-intro-help-label">Как играть</span>
          <span className="question" aria-hidden="true">
            ?
          </span>
        </button>
      )}
    </div>
  );
}
export function GameStartAction({
  onStart,
  game,
  loading = false,
  loadingLabel = "Загружаем…",
  caption,
  error,
}: {
  onStart: () => void;
  game?: GameId;
  loading?: boolean;
  loadingLabel?: string;
  caption?: string;
  error?: string;
}) {
  const access = useGuestTrial(game);
  const unavailable =
    !!game && !access.user && (!access.ready || access.loading);
  const blocked = !!game && access.blocked;
  return (
    <div className="game-start-action">
      <button
        className="primary"
        disabled={loading || unavailable}
        aria-busy={loading || unavailable}
        onClick={
          blocked && game ? () => loginToPlay(game, access.trial?.id) : onStart
        }
      >
        {loading
          ? loadingLabel
          : unavailable
            ? "Проверяем доступ…"
            : blocked
              ? "Войти и продолжить"
              : game && access.resume
                ? "Продолжить партию"
                : "Начать игру"}
        <span aria-hidden="true">→</span>
      </button>
      {error && (
        <p className="error" role="status">
          {error}
        </p>
      )}
      {game && <GuestSavedNotice game={game} />}
      {game && !access.user && (
        <p className="game-start-caption">
          {blocked
            ? "Первая партия уже сыграна. Дальше — бесплатно через Яндекс."
            : access.resume
              ? "Продолжишь незавершённую партию. Режим сохранён."
              : "Первая партия — без входа. Дальше — бесплатно через Яндекс."}
        </p>
      )}
      {game && !access.ready && !access.loading && (
        <p role="status">
          Не удалось проверить доступ.{" "}
          <button className="text-button" onClick={() => void access.refresh()}>
            Попробовать ещё раз
          </button>
        </p>
      )}
      {caption && <p className="game-start-caption">{caption}</p>}
    </div>
  );
}
