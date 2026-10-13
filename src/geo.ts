import { geoLocations, type GeoLocation, type GeoRegion } from "./geoLocations";

export type GeoPoint = { lat: number; lng: number };
export type GeoMode = "classic" | "timed";
export const GEO_ROUND_POINTS = 5000;
export const GEO_MAX_POINTS = 25000;
export const GEO_TIME_LIMIT_MS = 180000;
export const geoModeName = (mode: GeoMode) =>
  mode === "timed" ? "На время" : "Без таймера";
export const validGeoMode = (mode: unknown): mode is GeoMode =>
  mode === "classic" || mode === "timed";
export const geoRemaining = (deadline: number, now = Date.now()) =>
  Math.max(0, Math.ceil((deadline - now) / 1000));
export const geoClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export const geoPoints = (n: number) => n.toLocaleString("ru-RU");

export type GeoStats = { best: number; played: number; recent: string[] };
export type GeoAnswer = {
  location: GeoLocation;
  guess: GeoPoint | null;
  actual: GeoPoint;
  distance: number | null;
  timedOut?: boolean;
  score: number;
};
export const GEO_ROUNDS = 5;
const storageKey = (mode: GeoMode) => `playne:geo:v2:${mode}`;
const REGIONS: GeoRegion[] = [
  "europe",
  "asia",
  "africa",
  "americas",
  "oceania",
];

export function validPoint(point: GeoPoint) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  if (!validPoint(a) || !validPoint(b)) throw new Error("Invalid coordinates");
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat = radians(b.lat - a.lat),
    lng = radians(b.lng - a.lng);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(lng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function geoScore(distance: number) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  if (distance <= 0.25) return GEO_ROUND_POINTS;
  return Math.min(
    GEO_ROUND_POINTS - 1,
    Math.round(GEO_ROUND_POINTS * Math.exp(-distance / 2000)),
  );
}
export function geoDistance(distance: number) {
  if (distance < 1)
    return `${Math.round(distance * 1000).toLocaleString("ru-RU")} м`;
  return `${distance.toLocaleString("ru-RU", { maximumFractionDigits: distance < 100 ? 1 : 0 })} км`;
}
function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function chooseGeoRounds(
  recent: readonly string[] = [],
  random = Math.random,
) {
  const result: GeoLocation[] = [];
  for (const region of shuffled(REGIONS, random)) {
    const candidates = shuffled(
      geoLocations.filter(
        (place) =>
          place.region === region &&
          !result.some((other) => other.countryCode === place.countryCode),
      ),
      random,
    );
    const place =
      candidates.find((candidate) => !recent.includes(candidate.id)) ??
      candidates[0];
    if (!place) throw new Error(`No locations for ${region}`);
    result.push(place);
  }
  return result;
}
export function readGeoStats(mode: GeoMode = "classic"): GeoStats {
  const empty = { best: 0, played: 0, recent: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(mode)) ?? "null");
    if (
      !raw ||
      !Number.isInteger(raw.best) ||
      raw.best < 0 ||
      raw.best > GEO_MAX_POINTS ||
      !Number.isInteger(raw.played) ||
      raw.played < 0
    )
      return empty;
    return {
      best: raw.best,
      played: raw.played,
      recent: Array.isArray(raw.recent)
        ? raw.recent
            .filter(
              (id: unknown) =>
                typeof id === "string" &&
                geoLocations.some((place) => place.id === id),
            )
            .slice(-30)
        : [],
    };
  } catch {
    return empty;
  }
}
export function saveGeoStats(stats: GeoStats, mode: GeoMode = "classic") {
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(stats));
  } catch {
    /* The game also works without browser storage. */
  }
}

// Bounds may cross the date line: west > east is intentional in that case.
export function geoBounds(a: GeoPoint, b: GeoPoint) {
  const crossesDateLine = Math.abs(a.lng - b.lng) > 180;
  return {
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
    west: crossesDateLine ? Math.max(a.lng, b.lng) : Math.min(a.lng, b.lng),
    east: crossesDateLine ? Math.min(a.lng, b.lng) : Math.max(a.lng, b.lng),
  };
}
