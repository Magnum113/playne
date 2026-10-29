import { GEO_V3_UNITS_SQL, GEO_V4_UNITS_SQL } from "./scoring";

// One formula for the public table, notification snapshots and send-time checks.
export const LEADERBOARD_SQL = `WITH eligible AS (
 SELECT owner_id,version,answers,completed_at,
 CASE WHEN $2=4 THEN ${GEO_V4_UNITS_SQL} WHEN $2=3 THEN ${GEO_V3_UNITS_SQL} ELSE score_units END AS score_units
 FROM playne_games WHERE game=$1 AND (version=$2 OR ($1='geo' AND $2=3 AND version=2) OR ($1='geo' AND $2=4 AND version IN(2,3)))
 AND mode=$4 AND published_at IS NOT NULL AND (game NOT IN('flash','rotate','slide','dispatch') OR (mode='classic' AND completed_at IS NOT NULL)) AND ($3='all' OR completed_at >= date_trunc('week',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')),
 best AS (SELECT DISTINCT ON(owner_id) owner_id,version,score_units,answers,completed_at FROM eligible ORDER BY owner_id,score_units DESC,completed_at ASC),
 ranked AS (SELECT u.id,u.nickname,b.version,b.score_units,b.score_units/10.0 AS score,b.answers,b.completed_at,
 rank() OVER(ORDER BY b.score_units DESC) AS place FROM best b JOIN playne_users u ON u.id=b.owner_id)`;
