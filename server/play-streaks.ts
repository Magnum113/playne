import type { Pool } from "pg";
import type { PlayStreak, StreakBoard } from "../src/playStreaks";
import { lineMoscowDate } from "../src/line";
import { playOwnership } from "./play-owner";

// Distinct Moscow calendar dates form islands. A series ending yesterday is
// still live: the player has until the end of today to extend it.
const islands = `numbered AS (
 SELECT owner_id,day,day-(row_number() OVER(PARTITION BY owner_id ORDER BY day))::int AS island FROM active_days
), series AS (
 SELECT owner_id,min(day) AS first_day,max(day) AS last_day,count(*)::int AS days
 FROM numbered GROUP BY owner_id,island
), summaries AS (
 SELECT owner_id,max(days)::int AS best,max(last_day) AS last_day,
 coalesce(max(days) FILTER(WHERE last_day >= $2::date-1),0)::int AS current,
 bool_or(last_day=$2::date) AS played_today FROM series GROUP BY owner_id
)`;

export async function readPlayStreak(
  pool: Pick<Pool, "query">,
  viewer: { browserHash: string; userId?: string },
  day = lineMoscowDate(),
): Promise<PlayStreak> {
  const own = playOwnership(viewer);
  const { rows } = await pool.query(
    `WITH active_days AS (
 SELECT DISTINCT 1 AS owner_id,(g.completed_at AT TIME ZONE 'Europe/Moscow')::date AS day
 FROM playne_games g WHERE ${own.sql} AND completed_at IS NOT NULL
 AND completed_at<(($2::date+1)::timestamp AT TIME ZONE 'Europe/Moscow')
 ), ${islands}
 SELECT current,best,played_today,to_char(last_day,'YYYY-MM-DD') AS last_day FROM summaries`,
    [own.id, day],
  );
  const row = rows[0];
  return {
    current: Number(row?.current ?? 0),
    best: Number(row?.best ?? 0),
    playedToday: !!row?.played_today,
    lastDay: row?.last_day ?? null,
  };
}

export async function readStreakLeaderboard(
  pool: Pick<Pool, "query">,
  userId: string | null,
  page = 1,
  limit = 5,
  day = lineMoscowDate(),
): Promise<StreakBoard> {
  const { rows } = await pool.query(
    `WITH eligible AS (
 SELECT DISTINCT g.owner_id FROM playne_games g WHERE g.owner_id IS NOT NULL AND g.published_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM playne_games recent WHERE recent.owner_id=g.owner_id
 AND recent.completed_at>=(($2::date-1)::timestamp AT TIME ZONE 'Europe/Moscow')
 AND recent.completed_at<(($2::date+1)::timestamp AT TIME ZONE 'Europe/Moscow'))
 ), active_days AS (
 SELECT DISTINCT g.owner_id,(g.completed_at AT TIME ZONE 'Europe/Moscow')::date AS day
 FROM playne_games g JOIN eligible e ON e.owner_id=g.owner_id WHERE g.completed_at IS NOT NULL
 AND g.completed_at<(($2::date+1)::timestamp AT TIME ZONE 'Europe/Moscow')
 ), ${islands}, ranked AS (
 SELECT s.*,u.nickname,rank() OVER(ORDER BY current DESC)::int AS place FROM summaries s
 JOIN playne_users u ON u.id=s.owner_id WHERE current>0
 ), projected AS (
 SELECT *, jsonb_build_object('nickname',nickname,'days',current,'place',place,'isMe',coalesce(owner_id=$1::uuid,false)) AS entry FROM ranked
 ) SELECT jsonb_build_object(
 'total',(SELECT count(*)::int FROM ranked),
 'entries',(SELECT coalesce(jsonb_agg(entry ORDER BY current DESC,owner_id),'[]'::jsonb) FROM (SELECT * FROM projected ORDER BY current DESC,owner_id LIMIT $3 OFFSET $4) p),
 'mine',(SELECT entry || jsonb_build_object('best',best,'playedToday',played_today) FROM projected WHERE owner_id=$1::uuid)
 ) AS result`,
    [userId, day, limit, (page - 1) * limit],
  );
  return { day, page, limit, ...rows[0].result };
}
