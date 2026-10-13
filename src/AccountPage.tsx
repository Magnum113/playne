import { GEO_MODES, geoModeName, type GeoMode } from "./geo";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, useAuth, gameNames, resultText, type GameId } from "./account";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
export default function AccountPage() {
  const { user, loading, refresh } = useAuth();
  const [nickname, setNickname] = useState(""),
    [data, setData] = useState<any>(null),
    [pending, setPending] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [savingClaim, setSavingClaim] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const claim = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("claim");
  const validClaim = claim && /^[0-9a-f-]{36}$/.test(claim) ? claim : null;
  const publishing = useRef<string | null>(null);
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
      publishing.current === validClaim
    )
      return;
    publishing.current = validClaim;
    void publish();
  }, [user?.id, validClaim, pending?.completed, pending?.published]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/me", "PATCH", { nickname });
      await refresh();
      setMessage("Ник сохранён.");
      reachGoal(ACCOUNT_GOALS.nicknameSaved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!validClaim || savingClaim) return;
    setSavingClaim(true);
    setError("");
    try {
      await api(`/games/${validClaim}/publish`, "POST", {});
      setPending((p: any) => ({ ...p, published: true }));
      setData(await api("/account"));
      setMessage("Результат сохранён в рейтинг.");
      reachGoal(ACCOUNT_GOALS.resultPublished, {
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
  const returnPath = validClaim ? `/account/?claim=${validClaim}` : "/account/";
  return (
    <div className="app community-app">
      <a className="skip-link" href="#account-main">
        Перейти к профилю
      </a>
      <header className="header">
        <PlayneBrand />
        <nav className="game-header-actions">
          <a href="/leaderboard/">Рейтинг</a>
          <ThemeToggle />
        </nav>
      </header>
      <main id="account-main" className="community-main">
        <p className="eyebrow">ТВОИ ИГРЫ</p>
        <h1>
          Личный кабинет<span className="brand-dot">.</span>
        </h1>
        {loading ? (
          <p role="status">Открываем профиль…</p>
        ) : !user ? (
          <section className="community-panel login-panel">
            <h2>Сохраняй свои результаты.</h2>
            <p>
              Войди через Яндекс, чтобы попасть в рейтинг и видеть результаты на
              разных устройствах. Играть можно и без входа.
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
            <a
              className="primary yandex-login"
              onClick={() =>
                reachGoal(ACCOUNT_GOALS.loginStart, { source: "account" })
              }
              href={
                "/api/auth/yandex/start?return=" +
                encodeURIComponent(returnPath)
              }
            >
              <span className="yandex-letter" aria-hidden="true">
                Я
              </span>{" "}
              Войти через Яндекс
            </a>
            {authError && authError !== "success" && (
              <p role="status">
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
              <form onSubmit={save} className="nickname-form">
                <label htmlFor="nickname">Имя в рейтинге</label>
                <input
                  id="nickname"
                  name="nickname"
                  autoComplete="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  minLength={2}
                  maxLength={40}
                  required
                  aria-describedby="nickname-hint account-message"
                />
                <p id="nickname-hint">
                  Этот ник будет виден всем в рейтинге. От 2 до 40 символов.
                  Можно использовать своё имя или придумать другое.
                </p>
                <button className="primary" disabled={busy}>
                  {busy ? "Сохраняем…" : "Сохранить ник"}
                </button>
              </form>
            </section>
            {pending?.completed && (
              <section className="community-panel">
                <p className="eyebrow">ТВОЙ РЕЗУЛЬТАТ</p>
                <h2>
                  {gameNames[pending.game as GameId]} ·{" "}
                  {resultText(pending.game, pending.score, pending.version)}
                </h2>
                {pending.published ? (
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
              <div className="account-bests">
                {Object.entries(gameNames)
                  .flatMap(([id, name]) =>
                    id === "geo"
                      ? GEO_MODES.map((mode) => [
                          id,
                          `${name} · ${geoModeName(mode)}`,
                          mode,
                        ])
                      : [[id, name, "classic"]],
                  )
                  .map(([id, name, mode]) => {
                    const best = data?.best.find(
                      (b: any) => b.game === id && b.mode === mode,
                    );
                    return (
                      <a
                        className="community-panel"
                        href={`/leaderboard/?game=${id}&mode=${mode}`}
                        key={id + mode}
                      >
                        <span>{name}</span>
                        <strong>
                          {best
                            ? resultText(id as GameId, best.score)
                            : "Пока нет"}
                        </strong>
                      </a>
                    );
                  })}
              </div>
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
                className="text-button"
                onClick={() => setDeleting(!deleting)}
              >
                Удалить аккаунт
              </button>
              {deleting && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (confirmation !== "УДАЛИТЬ") {
                      setError("Введи УДАЛИТЬ для подтверждения.");
                      return;
                    }
                    setBusy(true);
                    void api("/account/delete", "POST", {
                      confirmation: "delete",
                    })
                      .then(refresh)
                      .then(() => {
                        setData(null);
                        setPending(null);
                        setDeleting(false);
                        setMessage("Аккаунт и результаты удалены.");
                      })
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  <p>
                    Аккаунт и опубликованные результаты будут удалены без
                    возможности восстановления.
                  </p>
                  <label htmlFor="delete-account">
                    Введи УДАЛИТЬ для подтверждения
                  </label>
                  <input
                    id="delete-account"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                  />
                  <button className="text-button" disabled={busy}>
                    Удалить аккаунт и результаты
                  </button>
                </form>
              )}
            </section>
            <div className="account-actions">
              <span>Вход через Яндекс ID</span>
              <button
                className="text-button"
                onClick={() => {
                  void api("/auth/logout", "POST", {})
                    .then(refresh)
                    .then(() => {
                      setData(null);
                      setMessage("Вы вышли из аккаунта.");
                      reachGoal(ACCOUNT_GOALS.logout);
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                Выйти из аккаунта
              </button>
            </div>
          </>
        )}
        <div id="account-message" className="account-message" role="status">
          {error || message}
        </div>
      </main>
      <footer className="community-footer">
        <FooterLinks />
      </footer>
    </div>
  );
}
