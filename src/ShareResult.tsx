import { IconButton } from "./ui";
import { useEffect, useId, useRef, useState } from "react";
import { api, useAuth } from "./account";
import {
  challengeScore,
  challengeTask,
  type PublicChallenge,
} from "./challenges";
import { reachGoal, SHARE_GOALS } from "./analytics";
import { trackFlowShareCreated } from "./flowAnalytics";
import FireButton from "./FireButton";
import "./challenge.css";

export default function ShareResult({
  runId,
  beforeCreate,
  className,
}: {
  runId?: string;
  beforeCreate?: () => Promise<void>;
  className?: string;
}) {
  const { user, loading } = useAuth();
  const scope = `${user?.id ?? "guest"}:${runId}`;
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    data: PublicChallenge;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewState, setPreviewState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const request = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    link = useRef<HTMLInputElement>(null);
  const heading = useId();
  const data = !loading && snapshot?.scope === scope ? snapshot.data : null;
  useEffect(() => {
    request.current++;
    setSnapshot(null);
    setPreviewState("loading");
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
  const game =
    slug === "one-line"
      ? "line"
      : slug === "swarm"
        ? "flow"
        : (slug ?? "unknown");
  async function create() {
    dialog.current?.showModal();
    setMessage("");
    if (data) return;
    const current = ++request.current;
    setBusy(true);
    try {
      await beforeCreate?.();
      if (current !== request.current) return;
      const value = await api<PublicChallenge>("/challenges", "POST", {
        runId,
      });
      if (current === request.current) {
        setSnapshot({ scope, data: value });
        reachGoal(SHARE_GOALS.created, { game: value.game });
        if (value.game === "flow")
          trackFlowShareCreated(runId!, value, {
            source: new URLSearchParams(window.location.search).has("challenge")
              ? "challenge"
              : value.flow?.kind === "daily"
                ? "daily"
                : "campaign",
            signed: !!user,
          });
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
        title: `${data.gameName} · ${data.flow ? challengeTask(data) + " · " : ""}${challengeScore(data)}`,
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
  return (
    <>
      <FireButton
        className={className}
        aria-label="Бросить вызов другу"
        onClick={() => {
          reachGoal(SHARE_GOALS.opened, { game });
          void create();
        }}
        disabled={loading}
      >
        Бросить вызов ↗
      </FireButton>
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
            <h2 id={heading}>
              {data?.flow
                ? challengeTask(data) + " · вызов другу"
                : "Кто побьёт твой результат?"}
            </h2>
            <IconButton
              className="share-close"
              aria-label="Закрыть приглашение"
              onClick={() => dialog.current?.close()}
            >
              ×
            </IconButton>
          </div>
          {data ? (
            <>
              <div
                className="share-preview-frame"
                aria-busy={previewState === "loading"}
              >
                {previewState !== "ready" && (
                  <p role="status">
                    {previewState === "error"
                      ? "Превью недоступно. Ссылкой всё равно можно поделиться."
                      : "Готовим превью…"}
                  </p>
                )}
                <img
                  onLoad={() => setPreviewState("ready")}
                  onError={() => setPreviewState("error")}
                  style={{ opacity: previewState === "ready" ? 1 : 0 }}
                  className="share-preview"
                  src={data.imageUrl}
                  width="1200"
                  height="630"
                  alt={`${data.gameName}: ${data.flow ? challengeTask(data) + ", " + data.flow.stars + " из 3 звёзд. " : ""}${challengeScore(data)}. Вызов другу.`}
                />
              </div>
              <p className="share-caption">
                {data.flow
                  ? "Друг получит то же поле. Вызов — отдельно от кампании и рейтинга. По ссылке видны ник и результат."
                  : "Друг сыграет в тех же условиях. По ссылке видны ник и результат."}
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
            </>
          ) : (
            <>
              {busy ? (
                <div className="share-preview-frame" aria-busy="true">
                  <p role="status">Готовим превью…</p>
                </div>
              ) : (
                <p>{message || "В приглашении будут твой ник и результат."}</p>
              )}
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
