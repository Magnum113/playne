// Telegram fetches public challenge previews through the external gateway.
// Development and test installations keep their own origin.
export function challengePublicOrigin(origin: string) {
  const base = new URL(origin).origin;
  return base === "https://playne.ru" ? "https://playne-results.vercel.app" : base;
}
