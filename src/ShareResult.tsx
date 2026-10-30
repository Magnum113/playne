import { useEffect, useId, useRef, useState } from "react";
import { api, useAuth } from "./account";
import { challengeScore, type PublicChallenge } from "./challenges";
import { reachGoal, SHARE_GOALS } from "./analytics";
import "./challenge.css";

export default function ShareResult({ runId }: { runId?: string }) {
  const { user, loading } = useAuth();
  const scope = `${user?.id ?? "guest"}:${runId}`;
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    data: PublicChallenge;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    link = useRef<HTMLInputElement>(null);
  const heading = useId();
  const data = !loading && snapshot?.scope === scope ? snapshot.data : null;
  useEffect(() => {
    request.current++;
    setSnapshot(null);
    setBusy(false);
    setMessage("");
    dialog.current?.close();
  }, [scope]);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  if (!runId) return null;
  const slug =
    typeof window === "undefined"
      ? undefined
      : window.location.pathname.split("/").filter(Boolean).at(-1);
  const game = slug === "one-line" ? "line" : (slug ?? "unknown");
  async function create() {
    dialog.current?.showModal();
    setMessage("");
    if (data) return;
    const current = ++request.current;
    setBusy(true);
    try {
      const value = await api<PublicChallenge>("/challenges", "POST", {
        runId,
      });
      if (current === request.current) {
        setSnapshot({ scope, data: value });
        reachGoal(SHARE_GOALS.created, { game: value.game });
      }
    } catch {
      if (current === request.current) {
        reachGoal(SHARE_GOALS.error, { game, stage: "create" });
        setMessage("Не удалось подготовить ссылку. Попробуй ещё раз.");
      }
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  async function copy() {
    if (!data) return;
    const current = request.current;
    try {
      await navigator.clipboard.writeText(data.url);
      if (current !== request.current) return;
      setMessage("Ссылка скопирована");
      reachGoal(SHARE_GOALS.copied, { game: data.game, method: "clipboard" });
    } catch {
      if (current !== request.current) return;
      reachGoal(SHARE_GOALS.error, { game: data.game, stage: "copy" });
      link.current?.focus();
      link.current?.select();
      setMessage("Выделили ссылку — скопируй её вручную.");
    }
  }
  async function share() {
    if (!data) return;
    const current = request.current;
    try {
      await navigator.share({
        title: `${data.gameName} · ${challengeScore(data)}`,
        text:
          data.maxScore > 0 && data.score >= data.maxScore
            ? "Сможешь повторить мой результат?"
            : "Побьёшь мой результат?",
        url: data.url,
      });
      if (current !== request.current) return;
      reachGoal(SHARE_GOALS.sent, { game: data.game });
    } catch (e) {
      if (current !== request.current) return;
      if (e instanceof Error && e.name === "AbortError") {
        reachGoal(SHARE_GOALS.cancelled, { game: data.game });
      } else {
        reachGoal(SHARE_GOALS.error, { game: data.game, stage: "share" });
        setMessage("Поделиться не получилось. Можно скопировать ссылку.");
      }
    }
  }
  async function revoke() {
    if (!data) return;
    const current = request.current;
    setBusy(true);
    try {
      await api(`/challenges/${data.token}`, "DELETE");
      if (current !== request.current) return;
      setSnapshot(null);
      reachGoal(SHARE_GOALS.revoked, { game: data.game });
      setMessage("Ссылка отключена");
    } catch {
      if (current !== request.current) return;
      reachGoal(SHARE_GOALS.error, { game: data.game, stage: "revoke" });
      setMessage("Не удалось отключить ссылку. Попробуй ещё раз.");
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  return (
    <>
      <button
        className="secondary-button"
        aria-label="Бросить вызов другу"
        onClick={() => {
          reachGoal(SHARE_GOALS.opened, { game });
          void create();
        }}
        disabled={loading}
      >
        Бросить вызов ↗
      </button>
      <dialog
        className="share-dialog ym-hide-content"
        ref={dialog}
        aria-labelledby={heading}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="share-dialog-content">
          <div className="share-dialog-heading">
            <h2 id={heading}>Кто побьёт твой результат?</h2>
            <button
              className="share-close"
              aria-label="Закрыть приглашение"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          {data ? (
            <>
              <img
                className="share-preview"
                src={data.imageUrl}
                width="1200"
                height="630"
                alt={`${data.gameName}: ${challengeScore(data)}. Вызов другу.`}
              />
              <p className="share-caption">
                Друг сыграет в тех же условиях. По ссылке видны ник и результат.
              </p>
              <label className="sr-only" htmlFor={heading + "-url"}>
                Ссылка для друга
              </label>
              <input
                className="ui-input"
                id={heading + "-url"}
                ref={link}
                readOnly
                value={data.url}
                onFocus={(e) => e.currentTarget.select()}
                onCopy={() =>
                  reachGoal(SHARE_GOALS.copied, {
                    game: data.game,
                    method: "manual",
                  })
                }
              />
              <div className="share-actions">
                {typeof navigator !== "undefined" &&
                  typeof navigator.share === "function" && (
                    <button
                      className="primary"
                      onClick={() => void share()}
                      disabled={busy}
                    >
                      Поделиться
                    </button>
                  )}
                <button
                  className={
                    typeof navigator !== "undefined" &&
                    typeof navigator.share === "function"
                      ? "secondary-button"
                      : "primary"
                  }
                  onClick={() => void copy()}
                  disabled={busy}
                >
                  Скопировать ссылку
                </button>
              </div>
              <button
                className="text-button share-revoke"
                onClick={() => void revoke()}
                disabled={busy}
              >
                Отключить ссылку
              </button>
            </>
          ) : (
            <>
              <p>
                {busy
                  ? "Готовим превью…"
                  : message || "В приглашении будут твой ник и результат."}
              </p>
              {!busy && (
                <button
                  className="secondary-button"
                  onClick={() => void create()}
                >
                  Подготовить ссылку
                </button>
              )}
            </>
          )}
          {data && message && (
            <p className="share-status" role="status">
              {message}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
