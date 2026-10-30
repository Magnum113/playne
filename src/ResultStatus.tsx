import type { ReactNode } from "react";

export type ResultStatusKind =
  | "restoring"
  | "checking"
  | "saving"
  | "saved"
  | "check-error"
  | "save-error";

/** Presentation only: network, auth and retries belong to the caller. */
export function ResultStatus({
  state,
  message,
  ranking,
  onRetry,
  children,
}: {
  state: ResultStatusKind;
  message?: string;
  ranking?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const busy =
    state === "restoring" || state === "checking" || state === "saving";
  const text = {
    restoring: "Восстанавливаем сохранение результата…",
    checking: "Проверяем результат для рейтинга…",
    saving: "Сохраняем результат в рейтинг…",
    saved: "",
    "check-error": "Не удалось проверить результат. Попробуй ещё раз.",
    "save-error": "Не удалось отправить результат. Попробуй ещё раз.",
  }[state];
  return (
    <div className={`save-result${state === "saved" ? " is-saved" : ""}`}>
      {state !== "saved" && (
        <p role="status">
          {busy && <span className="ui-spinner" aria-hidden="true" />}
          {message ?? text}
        </p>
      )}
      {(onRetry || ranking) && (
        <div>
          {onRetry && (
            <button
              className={state === "save-error" ? "primary" : "text-button"}
              onClick={onRetry}
            >
              {state === "save-error"
                ? "Повторить сохранение"
                : "Повторить проверку"}
            </button>
          )}
          {ranking && <a href={ranking}>Рейтинг игры →</a>}
        </div>
      )}
      {children}
    </div>
  );
}

export function GuestTrialPanel({
  practice = false,
  children,
}: {
  practice?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="guest-trial-prompt">
      <h2>Сыграем ещё?</h2>
      <p>
        {practice
          ? "Войди через Яндекс, чтобы играть дальше и сохранить практику в личной истории."
          : "Войди через Яндекс, чтобы играть дальше и сохранить результат в рейтинг."}
      </p>
      {children}
    </div>
  );
}
