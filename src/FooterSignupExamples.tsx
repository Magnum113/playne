import { useState } from "react";
import { FooterSignupView } from "./FooterSignup";

export default function FooterSignupExamples() {
  const [state, setState] = useState<
    "guest" | "offer" | "pending" | "subscribed"
  >("offer");
  return (
    <>
      <div
        className="rank-period ds-save-tabs"
        role="group"
        aria-label="Состояние подписки в футере"
      >
        {(
          [
            ["guest", "Гость"],
            ["offer", "Без подписки"],
            ["pending", "Ждёт подтверждения"],
            ["subscribed", "Подписан"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => setState(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {state === "subscribed" ? (
        <p className="ds-note" role="status">
          Подписка включена: предложение в футере скрыто.
        </p>
      ) : (
        <FooterSignupView
          state={state}
          onSubscribe={() => setState("subscribed")}
          login={
            <button
              type="button"
              className="primary yandex-login"
              onClick={() => setState("offer")}
            >
              Войти через Яндекс
            </button>
          }
        />
      )}
    </>
  );
}
