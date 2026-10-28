// Email capabilities stay in memory: remove the fragment before analytics starts.
let action: { kind: "confirm" | "unsubscribe"; token: string } | null = null;
export function captureEmailNavigation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const kind = url.searchParams.get("mail");
  if (
    url.pathname === "/account/" &&
    (kind === "confirm" || kind === "unsubscribe") &&
    url.hash
  ) {
    action = { kind, token: url.hash.slice(1) };
    window.history.replaceState(null, "", url.pathname + url.search);
  }
}
export const getEmailAction = () => action;
export function initEmailReturnTracking() {
  if (!new URLSearchParams(window.location.search).has("from_email")) return;
  let sent = false;
  const visit = (event: Event) => {
    if (sent || !event.isTrusted || document.visibilityState !== "visible")
      return;
    sent = true;
    void fetch("/api/email/visit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interacted: true }),
      keepalive: true,
    }).catch(() => {});
    window.removeEventListener("pointerdown", visit);
    window.removeEventListener("keydown", visit);
  };
  window.addEventListener("pointerdown", visit);
  window.addEventListener("keydown", visit);
}
