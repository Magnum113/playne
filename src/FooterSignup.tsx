import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, useAuth } from "./account";
import { YandexLogin } from "./EmailPreferences";
import {
  EMAIL_CONSENT_VERSION,
  EMAIL_LABEL,
  EMAIL_SETTINGS_UPDATED,
} from "./emailConsent";

type Settings = {
  available: boolean;
  email: string;
  enabled: boolean;
  pending: boolean;
  purpose?: "general" | "rank" | null;
};
type FooterSignupState =
  | "guest"
  | "offer"
  | "missing-email"
  | "pending"
  | "error";

/** Also used by the design catalog, without account or subscription side effects. */
export function FooterSignupView({
  state,
  login,
  busy = false,
  error = "",
  onSubscribe,
  onRetry,
}: {
  state: FooterSignupState;
  login?: ReactNode;
  busy?: boolean;
  error?: string;
  onSubscribe?: () => void;
  onRetry?: () => void;
}) {
  const id = useId();
  return (
    <div className="footer-signup" aria-busy={busy}>
      {state === "guest" ? (
        <>
          <p>Войди, чтобы участвовать в рейтинге.</p>
          {login}
        </>
      ) : state === "offer" ? (
        <div className="footer-signup-choice">
          <label>
            <input
              type="checkbox"
              checked={busy}
              disabled={busy}
              aria-describedby={id}
              onChange={(event) => {
                if (event.target.checked) onSubscribe?.();
              }}
            />
            <span>{busy ? "Подключаем письма…" : EMAIL_LABEL}</span>
          </label>
          <p id={id} className="footer-signup-terms">
            Согласие на{" "}
            <a
              href="/terms/#email-notifications"
              target="_blank"
              rel="noreferrer"
            >
              рассылку
            </a>{" "}
            и{" "}
            <a href="/privacy/#email-consent" target="_blank" rel="noreferrer">
              обработку email
            </a>
          </p>
        </div>
      ) : state === "missing-email" ? (
        <a href="/account/#email-settings">Добавить почту для писем Playne →</a>
      ) : state === "pending" ? (
        <p role="status">Подтверди подписку в письме.</p>
      ) : (
        <>
          <p>Не удалось загрузить подписку.</p>
          <button type="button" className="text-button" onClick={onRetry}>
            Повторить
          </button>
        </>
      )}
      {error && (
        <p className="footer-signup-error" role="alert">
          {error} <a href="/account/#email-settings">Настройки писем</a>
        </p>
      )}
    </div>
  );
}

function MemberSignup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [revision, setRevision] = useState(0);
  const saving = useRef(false);
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    const current = ++request.current;
    setFailed(false);
    void api<Settings>("/email/settings")
      .then((value) => {
        if (active && current === request.current) setSettings(value);
      })
      .catch(() => {
        if (active && current === request.current) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    const refresh = () => {
      // The save response already contains fresh settings for this footer.
      if (!saving.current) setRevision((value) => value + 1);
    };
    window.addEventListener(EMAIL_SETTINGS_UPDATED, refresh);
    return () => window.removeEventListener(EMAIL_SETTINGS_UPDATED, refresh);
  }, []);
  async function subscribe() {
    if (!settings?.email || saving.current) return;
    saving.current = true;
    request.current++;
    setBusy(true);
    setError("");
    try {
      const value = await api<Settings>("/email/settings", "POST", {
        enabled: true,
        email: settings.email,
        consentVersion: EMAIL_CONSENT_VERSION,
        dataConsent: true,
      });
      setSettings(value);
      setAnnouncement(
        value.enabled ? "Подписка включена." : "Подтверди подписку в письме.",
      );
      window.dispatchEvent(new Event(EMAIL_SETTINGS_UPDATED));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const subscribed = settings?.purpose === "general" && settings.enabled;
  const pending = settings?.purpose === "general" && settings.pending;
  return (
    <>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {failed && !settings ? (
        <FooterSignupView
          state="error"
          onRetry={() => setRevision((value) => value + 1)}
        />
      ) : settings?.available && !subscribed ? (
        <FooterSignupView
          state={
            pending ? "pending" : settings.email ? "offer" : "missing-email"
          }
          busy={busy}
          error={error}
          onSubscribe={() => void subscribe()}
        />
      ) : null}
    </>
  );
}

export default function FooterSignup() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <MemberSignup key={user.id} />;
  const returnPath =
    typeof window === "undefined"
      ? "/"
      : window.location.pathname +
        window.location.search +
        window.location.hash;
  return (
    <FooterSignupView
      state="guest"
      login={
        <YandexLogin
          returnPath={returnPath}
          source="footer"
          showEmailConsent={false}
        />
      }
    />
  );
}
