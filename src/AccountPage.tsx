import PlayStreak from "./PlayStreak";
import { YandexLogin, EmailAction, EmailPreferences } from "./EmailPreferences";
import { geoModeName, type GeoMode } from "./geo";
import { AccountBests } from "./AccountBests";
import { TextField, FieldFeedback } from "./FormField";
import { shadeModeName } from "./colorfle";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  useAuth,
  gameNames,
  resultText,
  trackPublished,
  type GameId,
} from "./account";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
export default function AccountPage() {
  const { user, loading, refresh } = useAuth();
  const [nickname, setNickname] = useState(""),
    [data, setData] = useState<any>(null),
    [pending, setPending] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [nicknameBusy, setNicknameBusy] = useState(false),
    [nicknameError, setNicknameError] = useState(""),
    [nicknameRequestError, setNicknameRequestError] = useState(""),
    [nicknameMessage, setNicknameMessage] = useState(""),
    [deleteBusy, setDeleteBusy] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [confirmationError, setConfirmationError] = useState(""),
    [logoutBusy, setLogoutBusy] = useState(false),
    [savingClaim, setSavingClaim] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const accountBusy = nicknameBusy || deleteBusy || logoutBusy;
  const claim = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("claim");
  const validClaim = claim && /^[0-9a-f-]{36}$/.test(claim) ? claim : null;
  const publishing = useRef<string | null>(null);
  const nicknameInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const deleteToggle = useRef<HTMLButtonElement>(null);
  const authError = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("auth");
  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
      void api("/account")
        .then(setData)
        .catch((e) => setError(e.message));
    }
  }, [user?.id]);
  useEffect(() => {
    if (deleting) confirmationInput.current?.focus();
  }, [deleting]);
  useEffect(() => {
    if (nicknameError && !nicknameBusy) nicknameInput.current?.focus();
  }, [nicknameError, nicknameBusy]);
  useEffect(() => {
    if (validClaim)
      void api(`/games/${validClaim}`)
        .then((result) =>
          setPending((previous: any) =>
            previous?.id === result.id && previous.published
              ? previous
              : result,
          ),
        )
        .catch((e) => setError(e.message));
  }, [validClaim]);
  useEffect(() => {
    if (
      !user ||
      !validClaim ||
      !pending?.completed ||
      pending.published ||
      pending.private ||
      publishing.current === validClaim
    )
      return;
    publishing.current = validClaim;
    void publish();
  }, [user?.id, validClaim, pending?.completed, pending?.published]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (accountBusy) return;
    setNicknameError("");
    setNicknameRequestError("");
    setNicknameMessage("");
    if (nickname.trim().length < 2 || nickname.trim().length > 40) {
      setNicknameError("Введи от 2 до 40 символов.");
      nicknameInput.current?.focus();
      return;
    }
    setNicknameBusy(true);
    try {
      await api("/me", "PATCH", { nickname });
      await refresh();
      setNicknameMessage("Ник сохранён.");
      reachGoal(ACCOUNT_GOALS.nicknameSaved);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setNicknameError(e.message);
      } else setNicknameRequestError((e as Error).message);
    } finally {
      setNicknameBusy(false);
    }
  }
  async function publish() {
    if (!validClaim || savingClaim) return;
    setSavingClaim(true);
    setError("");
    try {
      const result = await api(`/games/${validClaim}/publish`, "POST", {});
      setPending((p: any) => ({
        ...p,
        published: !result.private,
        private: !!result.private,
      }));
      setData(await api("/account"));
      setMessage(
        result.private
          ? "Результат практики сохранён в личной истории."
          : "Результат сохранён в рейтинг.",
      );
      if (!result.private)
        trackPublished(validClaim, {
          game: pending.game,
          score: pending.score,
          automatic: true,
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingClaim(false);
    }
  }
  const mailAction =
    typeof window !== "undefined" &&
    ["confirm", "unsubscribe"].includes(
      new URLSearchParams(window.location.search).get("mail") ?? "",
    );
  const returnPath = validClaim ? `/account/?claim=${validClaim}` : "/account/";
  return (
    <div className="app community-app">
      <a className="skip-link" href="#account-main">
        Перейти к профилю
      </a>
      <GameHeader back={false} account={false} ranking />
      <main id="account-main" className="community-main">
        <p className="eyebrow">{mailAction ? "PLAYNE" : "ТВОИ ИГРЫ"}</p>
        <h1>
          {mailAction ? "Письма Playne" : "Личный кабинет"}
          <span className="brand-dot">.</span>
        </h1>
        <EmailAction />
        {mailAction ? (
          <a href="/account/">Личный кабинет →</a>
        ) : loading ? (
          <p role="status">Открываем профиль…</p>
        ) : !user ? (
          <section className="community-panel login-panel">
            <h2>Сохраняй свои результаты.</h2>
            <p>
              Войди через Яндекс, чтобы попасть в рейтинг и видеть результаты на
              разных устройствах. Первую партию в каждой игре можно сыграть без
              входа.
            </p>
            {pending && (
              <p>
                Твой результат:{" "}
                <strong>
                  {gameNames[pending.game as GameId]} —{" "}
                  {resultText(
                    pending.game,
                    pending.score ?? 0,
                    pending.version,
                  )}
                </strong>
              </p>
            )}
            <YandexLogin returnPath={returnPath} />
            {authError && authError !== "success" && (
              <p className="error" role="status">
                {authError === "cancelled"
                  ? "Вход отменён. Можно попробовать ещё раз."
                  : "Не удалось завершить вход. Попробуй ещё раз."}
              </p>
            )}
            <small>
              При первом входе подставим имя из Яндекса. Ник можно изменить в
              любое время. После входа результаты сохраняются в рейтинг
              автоматически.
            </small>
            <p>
              <a href="/privacy/">Как мы используем данные</a>
            </p>
          </section>
        ) : (
          <>
            <section className="community-panel">
              <h2>Твой ник</h2>
              <form
                onSubmit={save}
                className="nickname-form"
                noValidate
                aria-busy={nicknameBusy}
              >
                <TextField
                  id="nickname"
                  label="Имя в рейтинге"
                  inputRef={nicknameInput}
                  name="nickname"
                  autoComplete="nickname"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setNicknameError("");
                    setNicknameRequestError("");
                    setNicknameMessage("");
                  }}
                  minLength={2}
                  maxLength={40}
                  required
                  disabled={accountBusy}
                  error={nicknameError}
                  hint="Этот ник будет виден всем в рейтинге. От 2 до 40 символов. Можно использовать своё имя или придумать другое."
                />
                <button
                  className="primary"
                  disabled={accountBusy}
                  aria-busy={nicknameBusy}
                >
                  {nicknameBusy ? "Сохраняем…" : "Сохранить ник"}
                </button>
                <FieldFeedback
                  error={nicknameRequestError}
                  message={nicknameMessage}
                />
              </form>
            </section>
            <PlayStreak />
            <EmailPreferences key={user.id} />
            {pending?.completed && (
              <section className="community-panel">
                <p className="eyebrow">ТВОЙ РЕЗУЛЬТАТ</p>
                <h2>
                  {gameNames[pending.game as GameId]} ·{" "}
                  {resultText(pending.game, pending.score, pending.version)}
                </h2>
                {pending.private ? (
                  <p>Результат практики сохранён в личной истории.</p>
                ) : pending.published ? (
                  <>
                    <p>Результат уже в рейтинге.</p>
                    <a
                      className="primary"
                      href={`/leaderboard/?game=${pending.game}&mode=${pending.mode ?? "classic"}`}
                    >
                      Посмотреть рейтинг →
                    </a>
                  </>
                ) : (
                  <>
                    <p>
                      {savingClaim || !error
                        ? "Сохраняем результат в рейтинг…"
                        : "Не удалось сохранить результат. Попробуй ещё раз."}
                    </p>
                    {!savingClaim && error && (
                      <button
                        className="primary"
                        disabled={savingClaim}
                        onClick={() => void publish()}
                      >
                        Повторить сохранение
                      </button>
                    )}
                  </>
                )}
              </section>
            )}
            <section>
              <h2>Лучшие результаты в рейтинге</h2>
              <AccountBests best={data?.best} />
            </section>
            <section className="community-panel">
              <h2>Последние сохранённые партии</h2>
              {data?.history.length ? (
                <ol className="account-history">
                  {data.history.map((h: any) => (
                    <li key={h.id}>
                      <span>
                        {gameNames[h.game as GameId]}
                        {h.game === "geo" &&
                          ` · ${h.version === 1 ? "Прежние правила" : geoModeName(h.mode as GeoMode)}`}
                        {h.game === "colorfle" &&
                          ` · ${shadeModeName(h.mode === "timed" ? "timed" : "classic")}`}
                        {["flash", "rotate", "slide", "dispatch"].includes(
                          h.game,
                        ) &&
                          ` · ${h.mode === "practice" ? "Практика · Уровень " + h.difficulty : "Задача дня"}`}
                        {h.game === "line" &&
                          ` · ${h.mode === "practice" ? "Практика" : "Задача дня"}`}
                        <small>
                          {new Date(h.completed_at).toLocaleDateString(
                            "ru-RU",
                            { timeZone: "Europe/Moscow" },
                          )}
                        </small>
                      </span>
                      <strong>{resultText(h.game, h.score, h.version)}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Закончи любую игру и сохрани результат в рейтинг.</p>
              )}
            </section>
            <section className="account-delete">
              <button
                ref={deleteToggle}
                type="button"
                className="text-button"
                aria-expanded={deleting}
                aria-controls="delete-account-form"
                disabled={accountBusy}
                onClick={() => {
                  setDeleting(!deleting);
                  setConfirmation("");
                  setConfirmationError("");
                  setDeleteError("");
                }}
              >
                Удалить аккаунт
              </button>
              {deleting && (
                <form
                  id="delete-account-form"
                  noValidate
                  aria-busy={deleteBusy}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (accountBusy) return;
                    setDeleteError("");
                    if (confirmation !== "УДАЛИТЬ") {
                      setConfirmationError("Введи УДАЛИТЬ для подтверждения.");
                      confirmationInput.current?.focus();
                      return;
                    }
                    setConfirmationError("");
                    setDeleteBusy(true);
                    void api("/account/delete", "POST", {
                      confirmation: "delete",
                    })
                      .then(refresh)
                      .then(() => {
                        setData(null);
                        setPending(null);
                        setDeleting(false);
                        setError("");
                        setMessage("Аккаунт и результаты удалены.");
                      })
                      .catch((e) => setDeleteError(e.message))
                      .finally(() => setDeleteBusy(false));
                  }}
                >
                  <TextField
                    id="delete-account"
                    label="Введи УДАЛИТЬ для подтверждения"
                    hint="Аккаунт и опубликованные результаты будут удалены без возможности восстановления."
                    inputRef={confirmationInput}
                    value={confirmation}
                    onChange={(e) => {
                      setConfirmation(e.target.value);
                      setConfirmationError("");
                      setDeleteError("");
                    }}
                    autoComplete="off"
                    disabled={accountBusy}
                    error={confirmationError}
                  />
                  <div className="account-delete-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={accountBusy}
                      onClick={() => {
                        setDeleting(false);
                        setConfirmation("");
                        setConfirmationError("");
                        setDeleteError("");
                        deleteToggle.current?.focus();
                      }}
                    >
                      Отмена
                    </button>
                    <button
                      className="danger-button"
                      disabled={accountBusy}
                      aria-busy={deleteBusy}
                    >
                      {deleteBusy ? "Удаляем…" : "Удалить аккаунт и результаты"}
                    </button>
                  </div>
                  <FieldFeedback error={deleteError} />
                </form>
              )}
            </section>
            <div className="account-actions">
              <span>Вход через Яндекс ID</span>
              <button
                className="text-button"
                disabled={accountBusy}
                aria-busy={logoutBusy}
                onClick={() => {
                  if (accountBusy) return;
                  setLogoutBusy(true);
                  void api("/auth/logout", "POST", {})
                    .then(refresh)
                    .then(() => {
                      setData(null);
                      setError("");
                      setMessage("Вы вышли из аккаунта.");
                      reachGoal(ACCOUNT_GOALS.logout);
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setLogoutBusy(false));
                }}
              >
                {logoutBusy ? "Выходим…" : "Выйти из аккаунта"}
              </button>
            </div>
          </>
        )}
        <div
          id="account-message"
          className={`account-message${error ? " is-error" : ""}`}
          role="status"
        >
          {error || message}
        </div>
      </main>
      <footer className="community-footer">
        <FooterLinks />
      </footer>
    </div>
  );
}
