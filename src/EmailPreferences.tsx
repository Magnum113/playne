import { useEffect, useId, useState, type ReactNode } from "react";
import { api, useAuth } from "./account";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import { getEmailAction } from "./emailNavigation";
import { EMAIL_CONSENT_VERSION, EMAIL_LABEL } from "./emailConsent";
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
          {EMAIL_LABEL}{" "}
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
        className="primary yandex-login"
        disabled={disabled || busy}
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
            ? "Напишем, если твой результат в топ-10 обойдут."
            : "Уведомления о рейтинге больше не будут приходить."
          : kind === "confirm"
            ? "Уведомления о рейтинге Playne. Не чаще одного письма в день и трёх в неделю."
            : "Ты больше не будешь получать уведомления о рейтинге."}
      </p>
      {!done &&
        (action ? (
          <button
            className="primary"
            disabled={busy}
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
type Settings = {
  reportAvailable?: boolean;
  available: boolean;
  yandexAvailable: boolean;
  yandexEmail?: string;
  email: string;
  enabled: boolean;
  pending: boolean;
  verified: boolean;
};
export function EmailPreferences() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [address, setAddress] = useState(""),
    [checked, setChecked] = useState(false),
    [data, setData] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const id = useId();
  useEffect(() => {
    if (window.location.hash === "#email-settings")
      document
        .getElementById("email-settings")
        ?.scrollIntoView({ block: "start" });
    void api("/email/settings")
      .then((s) => {
        setSettings(s);
        setAddress(s.email);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(enabled: boolean) {
    if (enabled && (!checked || !data)) {
      setError("Подтверди согласие на письма и обработку email.");
      return;
    }
    if (busy) return;
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
      setSettings(s);
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
  return (
    <section
      className="community-panel email-settings"
      id="email-settings"
      aria-labelledby="email-settings-title"
    >
      <h2 id="email-settings-title">Уведомления о рейтинге</h2>
      <p>
        Напишем, если тебя обойдут в топ-10. Не чаще одного письма в день и трёх
        в неделю — на все игры.
      </p>
      {!settings ? (
        <p role="status">{error || "Загружаем настройки…"}</p>
      ) : !settings.available ? (
        <p role="status">Письма пока недоступны. Попробуй позже.</p>
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
            className="email-settings-form"
          >
            <label htmlFor={id}>Электронная почта</label>
            <input
              id={id}
              className="ym-hide-content ym-disable-keys"
              type="email"
              autoComplete="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              maxLength={254}
            />
            {settings.yandexEmail &&
              address.trim().toLowerCase() === settings.yandexEmail && (
                <p>Адрес из Яндекса. Подтверждать не нужно.</p>
              )}
            {(!settings.enabled ||
              address.trim().toLowerCase() !== settings.email) && (
              <>
                <EmailConsent
                  checked={checked}
                  onChange={setChecked}
                  dataConsent={data}
                  onDataChange={setData}
                />
                <button
                  className="primary"
                  disabled={busy || !checked || !data}
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
        </>
      )}
      {settings && (settings.enabled || settings.pending) && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void save(false)}
        >
          Отключить письма
        </button>
      )}
      {settings?.reportAvailable && <EmailExperimentReport />}
      {message && <p role="status">{message}</p>}
      {settings && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function TopTenEmailOffer({
  game,
  mode = "classic",
}: {
  game: string;
  mode?: string;
}) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    if (!user) return;
    void Promise.all([
      api("/email/settings"),
      api(
        "/leaderboard?game=" +
          game +
          "&mode=" +
          encodeURIComponent(mode) +
          "&period=all",
      ),
    ])
      .then(([settings, board]) => {
        if (active)
          setVisible(
            settings.available &&
              !settings.enabled &&
              !settings.pending &&
              !!board.mine &&
              board.mine.place <= 10,
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id, game, mode]);
  return visible ? (
    <p className="email-rank-offer">
      Ты в топ-10.{" "}
      <a href="/account/#email-settings">Узнать, если тебя обойдут →</a>
    </p>
  ) : null;
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
        className="text-button"
        onClick={() => void load()}
        disabled={busy}
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
