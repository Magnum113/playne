import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TextField, FieldFeedback } from "./FormField";
import { api, useAuth } from "./account";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import { getEmailAction } from "./emailNavigation";
import {
  EMAIL_CONSENT_VERSION,
  EMAIL_LABEL,
  EMAIL_DESCRIPTION,
} from "./emailConsent";
export function EmailConsent({
  checked,
  onChange,
  dataConsent,
  onDataChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  dataConsent: boolean;
  onDataChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="email-consent">
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {EMAIL_LABEL} <small>{EMAIL_DESCRIPTION}</small>{" "}
          <a
            href="/terms/#email-notifications"
            target="_blank"
            rel="noreferrer"
          >
            Условия
          </a>
        </span>
      </label>
      {checked && (
        <label htmlFor={id + "-data"}>
          <input
            id={id + "-data"}
            type="checkbox"
            checked={dataConsent}
            onChange={(e) => onDataChange(e.target.checked)}
          />
          <span>
            Согласен на{" "}
            <a href="/privacy/#email-consent" target="_blank" rel="noreferrer">
              обработку email
            </a>
            .
          </span>
        </label>
      )}
    </div>
  );
}
export function YandexLogin({
  returnPath,
  source = "account",
  game,
  children,
  disabled = false,
}: {
  returnPath: string;
  source?: string;
  game?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { emailSignupAvailable } = useAuth();
  const [checked, setChecked] = useState(false),
    [data, setData] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login() {
    if (busy) return;
    setBusy(true);
    setError("");
    reachGoal(ACCOUNT_GOALS.loginStart, { source, ...(game ? { game } : {}) });
    try {
      if (checked && emailSignupAvailable) {
        if (!data) {
          setError("Подтверди обработку email или убери подписку.");
          return;
        }
        const result = await api("/auth/yandex/start", "POST", {
          return: returnPath,
          emailOptIn: true,
          consentVersion: EMAIL_CONSENT_VERSION,
          dataConsent: true,
        });
        window.location.assign(result.url);
      } else
        window.location.assign(
          "/api/auth/yandex/start?return=" + encodeURIComponent(returnPath),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="email-login">
      {emailSignupAvailable && (
        <EmailConsent
          checked={checked}
          onChange={setChecked}
          dataConsent={data}
          onDataChange={setData}
        />
      )}
      <button
        type="button"
        className="primary yandex-login"
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={() => void login()}
      >
        {busy
          ? "Открываем Яндекс…"
          : (children ?? (
              <>
                <span className="yandex-letter" aria-hidden="true">
                  Я
                </span>{" "}
                Войти через Яндекс
              </>
            ))}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function EmailAction() {
  const action = getEmailAction();
  const kind =
    action?.kind ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("mail")
      : null);
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  if (kind !== "confirm" && kind !== "unsubscribe") return null;
  async function submit() {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      await api("/email/" + action.kind, "POST", { token: action.token });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="community-panel email-action"
      aria-labelledby="email-action-title"
    >
      <h2 id="email-action-title">
        {done
          ? kind === "confirm"
            ? "Письма подключены"
            : "Письма отключены"
          : kind === "confirm"
            ? "Подтвердить подписку?"
            : "Отключить письма?"}
      </h2>
      <p>
        {done
          ? kind === "confirm"
            ? "Новые игры, напоминания и результаты."
            : "Письма Playne больше не будут приходить."
          : kind === "confirm"
            ? "Письма Playne. Не чаще одного письма за 24 часа и трёх за 7 дней."
            : "Ты больше не будешь получать письма Playne."}
      </p>
      {!done &&
        (action ? (
          <button
            type="button"
            className="primary"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void submit()}
          >
            {busy
              ? "Сохраняем…"
              : kind === "confirm"
                ? "Подтвердить подписку"
                : "Отключить письма"}
          </button>
        ) : (
          <p role="status">
            Ссылка устарела. Открой письмо ещё раз или измени подписку в
            кабинете.
          </p>
        ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && <a href="/">Выбрать игру →</a>}
    </section>
  );
}
type ReminderSettings = {
  enabled: boolean;
  days: number[];
  time: string;
  timezone: string;
};
type Settings = {
  reportAvailable?: boolean;
  available: boolean;
  yandexAvailable: boolean;
  yandexEmail?: string;
  email: string;
  enabled: boolean;
  pending: boolean;
  verified: boolean;
  purpose?: "rank" | "general" | null;
  reminders?: ReminderSettings;
};
const defaultReminders: ReminderSettings = {
  enabled: true,
  days: [1, 3, 5],
  time: "19:00",
  timezone: "Europe/Moscow",
};
export function EmailPreferences({ compact = false }: { compact?: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [address, setAddress] = useState(""),
    [checked, setChecked] = useState(false),
    [data, setData] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [addressError, setAddressError] = useState(""),
    [message, setMessage] = useState("");
  const [reminders, setReminders] =
    useState<ReminderSettings>(defaultReminders);
  const id = useId();
  const addressInput = useRef<HTMLInputElement>(null);
  function apply(s: Settings) {
    setSettings(s);
    setAddress(s.email);
    setReminders(s.reminders ?? defaultReminders);
  }
  useEffect(() => {
    if (!compact && window.location.hash === "#email-settings")
      document
        .getElementById("email-settings")
        ?.scrollIntoView({ block: "start" });
    let active = true;
    void api("/email/settings")
      .then((s) => {
        if (active) apply(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(enabled: boolean) {
    if (busy) return;
    setAddressError("");
    if (
      enabled &&
      addressInput.current &&
      !addressInput.current.validity.valid
    ) {
      setAddressError(
        address.trim()
          ? "Введи корректный email, например name@example.ru."
          : "Введи электронную почту.",
      );
      addressInput.current.focus();
      return;
    }
    if (enabled && (!checked || !data)) {
      setError("Подтверди согласие на письма и обработку email.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const s = await api(
        "/email/settings",
        "POST",
        enabled
          ? {
              enabled: true,
              email: address,
              consentVersion: EMAIL_CONSENT_VERSION,
              dataConsent: data,
            }
          : { enabled: false },
      );
      apply(s);
      setChecked(false);
      setData(false);
      setMessage(
        enabled
          ? s.enabled
            ? "Письма подключены."
            : "Отправим письмо с подтверждением. Проверь почту."
          : "Письма отключены.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveReminders(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!reminders.days.length) {
      setError("Выбери хотя бы один день.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      apply(
        await api("/email/reminders", "POST", {
          enabled: reminders.enabled,
          days: reminders.days,
          time: reminders.time,
        }),
      );
      setMessage("Напоминания настроены.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (compact && message) return <p role="status">{message}</p>;
  if (
    compact &&
    (!settings ||
      !settings.available ||
      (settings.purpose === "general" &&
        (settings.enabled || settings.pending)))
  )
    return null;
  const general = settings?.purpose === "general";
  return (
    <section
      className="community-panel email-settings"
      id={compact ? undefined : "email-settings"}
      aria-labelledby={id + "-title"}
    >
      <h2 id={id + "-title"}>{EMAIL_LABEL}</h2>
      <p>
        {EMAIL_DESCRIPTION}. Не чаще одного письма за 24 часа и трёх за 7 дней.
      </p>
      {!settings ? (
        <p role="status">{error || "Загружаем настройки…"}</p>
      ) : (
        <>
          <p role="status">
            {settings.enabled
              ? "Подписка включена."
              : settings.pending
                ? settings.email
                  ? "Подтверди адрес по ссылке в письме."
                  : "Яндекс не передал адрес. Укажи почту ниже."
                : "Подписка выключена."}
          </p>
          {settings.enabled && !general && (
            <p>
              Сейчас подключены только результаты в рейтинге. Для новых игр и
              напоминаний нужно новое согласие.
            </p>
          )}
          {!settings.available ? (
            <p role="status">Письма пока недоступны. Попробуй позже.</p>
          ) : (
            <form
              noValidate
              aria-busy={busy}
              className="email-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save(true);
              }}
            >
              <TextField
                id={id}
                label="Электронная почта"
                inputRef={addressInput}
                className="ym-hide-content ym-disable-keys"
                type="email"
                autoComplete="email"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setAddressError("");
                  setError("");
                  setMessage("");
                }}
                required
                maxLength={254}
                disabled={busy}
                error={addressError}
                hint={
                  settings.yandexEmail &&
                  address.trim().toLowerCase() === settings.yandexEmail
                    ? "Адрес из Яндекса. Подтверждать не нужно."
                    : undefined
                }
              />
              {(!settings.enabled ||
                !general ||
                address.trim().toLowerCase() !== settings.email) && (
                <>
                  <EmailConsent
                    checked={checked}
                    onChange={setChecked}
                    dataConsent={data}
                    onDataChange={setData}
                  />
                  <button
                    className={compact ? "secondary-button" : "primary"}
                    disabled={busy || !checked || !data}
                    aria-busy={busy}
                  >
                    {busy
                      ? "Сохраняем…"
                      : settings.pending &&
                          address.trim().toLowerCase() !== settings.yandexEmail
                        ? "Отправить подтверждение ещё раз"
                        : "Подключить письма"}
                  </button>
                </>
              )}
            </form>
          )}
          {!compact && general && settings.enabled && (
            <form
              onSubmit={saveReminders}
              className="email-reminders-form"
              aria-busy={busy}
            >
              <h3>Напоминания</h3>
              <label>
                <input
                  type="checkbox"
                  checked={reminders.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    setReminders({ ...reminders, enabled: e.target.checked })
                  }
                />
                Напоминать, если сегодня ещё не играл
              </label>
              <fieldset disabled={busy}>
                <legend>Дни недели</legend>
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(
                  (day, index) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={reminders.days.includes(index + 1)}
                        onChange={(e) =>
                          setReminders({
                            ...reminders,
                            days: e.target.checked
                              ? [...reminders.days, index + 1].sort()
                              : reminders.days.filter(
                                  (value) => value !== index + 1,
                                ),
                          })
                        }
                      />
                      {day}
                    </label>
                  ),
                )}
              </fieldset>
              <TextField
                id={id + "-time"}
                label="Время по Москве"
                type="time"
                min="10:00"
                max="20:59"
                step="60"
                required
                value={reminders.time}
                disabled={busy}
                onChange={(e) =>
                  setReminders({ ...reminders, time: e.target.value })
                }
              />
              <p>
                Не пишем с 21:00 до 10:00. Все письма вместе — не чаще одного за
                24 часа и трёх за 7 дней.
              </p>
              <button
                className="secondary-button"
                disabled={busy || !reminders.days.length}
                aria-busy={busy}
              >
                Сохранить напоминания
              </button>
            </form>
          )}
          {!compact && (settings.enabled || settings.pending) && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void save(false)}
            >
              Отключить письма
            </button>
          )}
        </>
      )}
      {settings?.reportAvailable && !compact && <EmailExperimentReport />}
      <FieldFeedback message={message} error={settings ? error : undefined} />
    </section>
  );
}
export function PlayneEmailOffer() {
  const { user, loading } = useAuth();
  return user && !loading ? <EmailPreferences compact /> : null;
}
// Keep already open clients and existing result imports compatible.
export function TopTenEmailOffer(_props: { game: string; mode?: string }) {
  return <PlayneEmailOffer />;
}

function EmailExperimentReport() {
  const [report, setReport] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const percent = (n: number | null) =>
    n === null ? "—" : (n * 100).toFixed(1).replace(".", ",") + "%";
  async function load() {
    setBusy(true);
    setError("");
    try {
      setReport(await api("/email/report"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="email-experiment">
      <h3>Тест оформления A/B/C</h3>
      <p>Статистика доступна только владельцу сайта.</p>
      <button
        type="button"
        className="text-button"
        onClick={() => void load()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy
          ? "Загружаем…"
          : report
            ? "Обновить статистику"
            : "Показать статистику писем"}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            Учитываем уникальных получателей за последние 90 дней после полного
            окна в 7 дней. Основной показатель — возврат с действием на сайте.
            Открытия и автоматические проверки ссылок в него не входят.
          </p>
          <div
            className="email-report-scroll"
            role="region"
            aria-label="Результаты теста писем"
            tabIndex={0}
          >
            <table>
              <caption>Подтверждённые доставки и возвраты за 7 дней</caption>
              <thead>
                <tr>
                  <th scope="col">Дизайн</th>
                  <th scope="col">Получатели</th>
                  <th scope="col">Возвраты</th>
                  <th scope="col">Доля</th>
                  <th scope="col">95% интервал</th>
                  <th scope="col">Начали игру</th>
                  <th scope="col">Завершили игру</th>
                  <th scope="col">Жалобы</th>
                  <th scope="col">Отписки</th>
                </tr>
              </thead>
              <tbody>
                {report.variants.map((v: any) => (
                  <tr key={v.variant}>
                    <th scope="row">{v.variant}</th>
                    <td>{v.delivered_users}</td>
                    <td>{v.visited_users}</td>
                    <td>{percent(v.visitRate)}</td>
                    <td>
                      {v.visitRate95
                        ? v.visitRate95.map(percent).join(" — ")
                        : "—"}
                    </td>
                    <td>{v.started_users}</td>
                    <td>{v.completed_users}</td>
                    <td>{v.complaints}</td>
                    <td>{v.unsubscribes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Всего сообщений в эксперименте:{" "}
            {report.live.reduce((n: number, r: any) => n + r.messages, 0)}. В
            очереди:{" "}
            {report.live
              .filter((r: any) => r.status === "pending")
              .reduce((n: number, r: any) => n + r.messages, 0)}
            . Требуют проверки доставки:{" "}
            {report.live
              .filter((r: any) => ["uncertain", "failed"].includes(r.status))
              .reduce((n: number, r: any) => n + r.messages, 0)}
            .
          </p>
          <p>
            На маленькой выборке победителя выбирать рано. Сравнивай также
            завершённые игры, отписки и жалобы. Дизайн закреплён за человеком;
            содержание и частота одинаковые.
          </p>
        </>
      )}
    </div>
  );
}
