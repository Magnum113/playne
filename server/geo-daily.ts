import type { Pool, PoolClient } from "pg";
import { chooseGeoRounds } from "../src/geo";

export function chooseDailyGeoPlaces(day: string) {
  let seed = 2166136261;
  for (const char of `playne-route-v1:${day}`)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return chooseGeoRounds([], () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  }, "daily");
}

export async function geoDailyChallenge(client: PoolClient, day: string) {
  await client.query(
    "INSERT INTO playne_geo_daily_packs(day,places,speed_scoring) VALUES($1,$2,true) ON CONFLICT(day) DO NOTHING",
    [day, JSON.stringify(chooseDailyGeoPlaces(day))],
  );
  const { rows } = await client.query(
    "SELECT places,speed_scoring FROM playne_geo_daily_packs WHERE day=$1",
    [day],
  );
  return {
    day,
    places: rows[0].places,
    mode: "daily",
    speedScoring: rows[0].speed_scoring,
    panoramas: {},
  };
}

export async function findDailyGeoRun(
  client: Pick<Pool | PoolClient, "query">,
  day: string,
  browserHash: string,
  ownerId?: string,
) {
  const { rows } = await client.query(
    `SELECT * FROM playne_games
     WHERE game='geo' AND mode='daily' AND challenge->>'day'=$1
       AND (owner_id=$3 OR (owner_id IS NULL AND browser_hash=$2))
     ORDER BY (owner_id IS NOT NULL) DESC LIMIT 1`,
    [day, browserHash, ownerId ?? null],
  );
  return rows[0];
}

// Call under the publication lock, which also serializes daily starts and claims.
export async function canClaimDailyGeo(
  client: PoolClient,
  run: { game: string; mode: string; id: string; challenge: { day?: string } },
  ownerId: string,
) {
  if (run.game !== "geo" || run.mode !== "daily") return true;
  const prior = await client.query(
    `SELECT 1 FROM playne_games
     WHERE game='geo' AND mode='daily' AND challenge->>'day'=$1
       AND owner_id=$2 AND id<>$3`,
    [run.challenge.day, ownerId, run.id],
  );
  return !prior.rows.length;
}
