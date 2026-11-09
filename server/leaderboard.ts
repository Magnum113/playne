import { GEO_V3_UNITS_SQL, GEO_V4_UNITS_SQL } from "./scoring";

// One formula for the public table, notification snapshots and send-time checks.
function leaderboardSql(daily = false) {
  const elapsed = daily
    ? ", (SELECT sum((a->>'elapsedMs')::bigint) FROM jsonb_array_elements(answers) a) AS elapsed_ms"
    : "";
  const byTime = daily ? ", b.elapsed_ms ASC NULLS LAST" : "";
  return `WITH eligible AS (
 SELECT owner_id,version,answers,completed_at${elapsed},
 CASE WHEN $2=4 THEN ${GEO_V4_UNITS_SQL} WHEN $2=3 THEN ${GEO_V3_UNITS_SQL} ELSE score_units END AS score_units
 FROM playne_games WHERE game=$1 AND (version=$2 OR ($1='geo' AND $2=3 AND version=2) OR ($1='geo' AND $2=4 AND version IN(2,3)))
 AND mode=$4 ${daily ? "AND challenge->>'day'=$5" : ""} AND published_at IS NOT NULL AND coalesce(challenge->>'comparison','false')<>'true' AND (game NOT IN('flash','rotate','slide','dispatch') OR (mode='classic' AND completed_at IS NOT NULL)) AND ($3='all' OR completed_at >= date_trunc('week',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')),
 best AS (SELECT DISTINCT ON(owner_id) * FROM eligible ORDER BY owner_id,score_units DESC,completed_at ASC),
 ranked AS (SELECT u.id,u.nickname,b.version,b.score_units,b.score_units/10.0 AS score,b.answers,b.completed_at${daily ? ", b.elapsed_ms" : ""},
 rank() OVER(ORDER BY b.score_units DESC${byTime}) AS place,
 row_number() OVER(ORDER BY b.score_units DESC${byTime},b.completed_at,u.id) AS position FROM best b JOIN playne_users u ON u.id=b.owner_id)`;
}

export const LEADERBOARD_SQL = leaderboardSql();
export const GEO_DAILY_LEADERBOARD_SQL = leaderboardSql(true);
