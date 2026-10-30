import type { PoolClient } from "pg";
import { GEO_V4_UNITS_SQL, isGame, scoreVersion } from "./scoring";

type RecordRun = {
  id: string;
  game: string;
  mode: string;
  version: number;
  challenge?: { comparison?: boolean };
};

// Called inside the publication transaction, before the new result is stored.
// Compare compatible scoring versions and the same mode, not the last run.
export async function improvesPersonalRecord(
  client: Pick<PoolClient, "query">,
  run: RecordRun,
  scoreUnits: number,
  ownerId: string | null,
): Promise<boolean> {
  // Old clients can still finish their runs, but their scoring scale must not
  // generate a new-record banner against the current leaderboard.
  if (
    scoreUnits <= 0 ||
    run.mode === "practice" ||
    run.challenge?.comparison === true ||
    !isGame(run.game) ||
    run.version !== scoreVersion(run.game)
  )
    return false;
  // Each guest is allowed one completed party per game. Account claims below
  // compare again, so a first guest score cannot supersede an account record.
  if (!ownerId) return true;
  const previous = await client.query(
    `SELECT max(${GEO_V4_UNITS_SQL}) AS units
     FROM playne_games WHERE owner_id=$1 AND game=$2 AND mode=$3 AND id<>$4
     AND published_at IS NOT NULL
     AND coalesce(challenge->>'comparison','false')<>'true'
     AND (version=$5 OR (game='geo' AND $5=4 AND version IN(2,3)))`,
    [ownerId, run.game, run.mode, run.id, run.version],
  );
  return scoreUnits > Number(previous.rows[0]?.units ?? 0);
}
