const surfaces = ["footer", "account_settings", "account_login", "game_result", "game_entry"] as const;
type Surface = (typeof surfaces)[number];
const screens = new Set([
  "home", "account", "leaderboard", "naglaz", "circle", "colorfle", "geo",
  "geo_daily", "pressure", "one-line", "swarm", "brain", "brain/flash",
  "brain/rotate", "brain/slide", "brain/dispatch", "guides", "privacy", "terms", "other",
]);

export function emailSignupOrigin(surface: Surface) {
  const path = window.location.pathname.replace(/\/index\.html$/, "/").replace(/^\/|\/$/g, "");
  const screen = !path ? "home"
    : path === "geo" && new URLSearchParams(window.location.search).get("mode") === "daily" ? "geo_daily"
    : path.startsWith("guides/") ? "guides"
    : screens.has(path) ? path : "other";
  return `${surface}:${screen}`;
}

export function parseEmailSignupOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 48) return null;
  const [surface, screen, extra] = value.split(":");
  return extra === undefined && surfaces.includes(surface as Surface) && screens.has(screen)
    ? { surface, screen }
    : null;
}
