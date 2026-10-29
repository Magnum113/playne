import type { Pool } from "pg";
import { GEO_V4_UNITS_SQL, scoreVersion } from "./scoring";
import {
  OVERALL_VERSION,
  OVERALL_GAME_POINTS,
  PRESSURE_HALF_POINTS_LEVEL,
} from "../src/overall";

// All-time, one best run per game. Modes do not create extra rating slots.
// Compute entries, count and personal rank in one PostgreSQL snapshot.
const OVERALL_SQL = `WITH eligible AS (
 SELECT id,owner_id,game,mode,completed_at,
 CASE WHEN game='geo' THEN ${GEO_V4_UNITS_SQL} ELSE score_units END AS units
 FROM playne_games WHERE published_at IS NOT NULL AND score_units IS NOT NULL AND owner_id IS NOT NULL
 AND ((game IN('naglaz','circle','pressure') AND version=${scoreVersion("naglaz")} AND mode='classic')
 OR (game='colorfle' AND version=${scoreVersion("colorfle")} AND mode IN('classic','timed'))
 OR (game='geo' AND version IN(2,3,${scoreVersion("geo")}) AND mode IN('classic','timed','moving','moving-timed','landmarks','landmarks-timed'))
 OR (game='line' AND version=${scoreVersion("line")} AND mode='classic' AND completed_at IS NOT NULL))
), best AS (
 SELECT DISTINCT ON(owner_id,game) owner_id,game,mode,units,completed_at
 FROM eligible ORDER BY owner_id,game,units DESC,completed_at,id
), points AS (
 SELECT *,LEAST(${OVERALL_GAME_POINTS},GREATEST(0,floor(CASE
 WHEN game='circle' THEN units::numeric
 WHEN game='pressure' THEN ${OVERALL_GAME_POINTS}::numeric*units/(units+${PRESSURE_HALF_POINTS_LEVEL * 10})
 ELSE units::numeric/5 END)))::integer AS points FROM best
), totals AS (
 SELECT owner_id,sum(points)::integer AS score,count(*)::integer AS games_played,max(completed_at) AS achieved_at,
 jsonb_agg(jsonb_build_object('game',game,'mode',mode,'score',units/10.0,'points',points)
 ORDER BY CASE game WHEN 'naglaz' THEN 1 WHEN 'circle' THEN 2 WHEN 'colorfle' THEN 3 WHEN 'geo' THEN 4 WHEN 'pressure' THEN 5 ELSE 6 END) AS contributions
 FROM points GROUP BY owner_id
), ranked AS (
 SELECT u.id,u.nickname,t.*,rank() OVER(ORDER BY t.score DESC) AS place FROM totals t JOIN playne_users u ON u.id=t.owner_id
), projected AS (
 SELECT *,jsonb_build_object('nickname',nickname,'score',score,'place',place,'gamesPlayed',games_played,
 'contributions',contributions,'isMe',coalesce(id=$3::uuid,false)) AS entry FROM ranked
)
SELECT jsonb_build_object(
 'entries',(SELECT coalesce(jsonb_agg(entry ORDER BY score DESC,achieved_at,id),'[]'::jsonb) FROM (SELECT * FROM projected ORDER BY score DESC,achieved_at,id LIMIT $1 OFFSET $2) page),
 'total',(SELECT count(*) FROM ranked),
 'mine',(SELECT entry FROM projected WHERE id=$3::uuid)
) AS result`;

export async function overallLeaderboard(
  pool: Pool,
  userId: string | null,
  page: number,
  limit: number,
) {
  const { rows } = await pool.query(OVERALL_SQL, [
    limit,
    (page - 1) * limit,
    userId,
  ]);
  return {
    game: "overall",
    period: "all",
    version: OVERALL_VERSION,
    page,
    limit,
    ...rows[0].result,
  };
}
