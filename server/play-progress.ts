import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { PlayDay, PlayProgress } from "../src/playProgress";
import { playOwnership } from "./play-owner";
import { readPlayStreak, readStreakLeaderboard } from "./play-streaks";
import { lineMoscowDate } from "../src/line";

type Viewer = { browserHash: string; userId?: string };
type Queryable = Pick<Pool, "query">;
const dailyGames = ["line", "flash", "rotate", "slide", "dispatch"];
const zone = "Europe/Moscow";

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function weekStart(day: string) {
  return shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}

// Calendar activity covers every game and mode, independently of public rankings.
// An individual game counts once per date, and any completion makes one active day.
export async function readPlayActivity(
  pool: Queryable,
  viewer: Viewer,
  day = lineMoscowDate(),
) {
  const own = playOwnership(viewer);
  const { rows } = await pool.query(
    `WITH per_game AS (
      SELECT game,to_char(completed_at AT TIME ZONE '${zone}','YYYY-MM-DD') AS day,
        max(coalesce(score_units,0)) AS units
      FROM playne_games g WHERE ${own.sql}
        AND completed_at>=($2::timestamp AT TIME ZONE '${zone}')
        AND completed_at<(($3::date+1)::timestamp AT TIME ZONE '${zone}')
      GROUP BY 1,2
    ) SELECT day,count(*)::int AS games_completed,
        (sum(units)/10.0)::double precision AS score FROM per_game GROUP BY day`,
    [own.id, shiftDay(day, -6), day],
  );
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const entry = (date: string): PlayDay => {
    const record = date > day ? undefined : byDay.get(date);
    return {
      day: date,
      gamesCompleted: Number(record?.games_completed ?? 0),
      score: Number(record?.score ?? 0),
    };
  };
  const start = weekStart(day);
  const last7Days = Array.from({ length: 7 }, (_, i) =>
    entry(shiftDay(day, i - 6)),
  );
  const week = Array.from({ length: 7 }, (_, i) => entry(shiftDay(start, i)));
  const weeklyDays = week.filter((date) => date.gamesCompleted > 0).length;
  return { weekStart: start, last7Days, week, weeklyDays };
}

export async function readPlayMilestones(
  pool: Queryable,
  viewer: Viewer,
  day = lineMoscowDate(),
): Promise<PlayProgress["milestones"]> {
  const own = playOwnership(viewer);
  const { rows } = await pool.query(
    `WITH active_days AS (
        SELECT DISTINCT (completed_at AT TIME ZONE '${zone}')::date AS day
        FROM playne_games g WHERE ${own.sql} AND completed_at IS NOT NULL
          AND completed_at<(($2::date+1)::timestamp AT TIME ZONE '${zone}')
      ), weeks AS (
        SELECT date_trunc('week',day::timestamp) AS week,count(*) AS days
        FROM active_days GROUP BY 1
      ), months AS (
        SELECT date_trunc('month',day::timestamp) AS month,count(*) AS days
        FROM active_days GROUP BY 1
      ) SELECT
        (SELECT count(*)::int FROM weeks WHERE days>=3) AS completed_weeks,
        (SELECT count(*)::int FROM active_days WHERE day>=date_trunc('month',$2::date)::date) AS month_days,
        (SELECT count(*)::int FROM active_days) AS total_days,
        (SELECT count(*)::int FROM months WHERE days>=10) AS ten_day_months`,
    [own.id, day],
  );
  const counts = rows[0];
  return {
    completedWeeks: Number(counts.completed_weeks),
    activeDaysThisMonth: Number(counts.month_days),
    totalActiveDays: Number(counts.total_days),
    tenDayMonths: Number(counts.ten_day_months),
  };
}

export async function readPlayProgress(
  pool: Queryable,
  viewer: Viewer,
  now = new Date(),
): Promise<PlayProgress> {
  const day = lineMoscowDate(now);
  const own = playOwnership(viewer);
  const [activity, milestones, favorites, daily, recent, streak] =
    await Promise.all([
      readPlayActivity(pool, viewer, day),
      readPlayMilestones(pool, viewer, day),
      pool.query(
        `SELECT game,count(*)::int AS completed_runs,max(completed_at) AS last_completed_at
      FROM playne_games g WHERE ${own.sql} AND completed_at>=$2::timestamptz-interval '30 days'
        AND completed_at<=$2::timestamptz
      GROUP BY game ORDER BY completed_runs DESC,last_completed_at DESC,game`,
        [own.id, now.toISOString()],
      ),
      pool.query(
        `SELECT DISTINCT ON(game) id,game,completed_at,jsonb_array_length(answers) AS completed_rounds
      FROM playne_games g WHERE ${own.sql} AND game=ANY($2::text[])
        AND mode='classic' AND challenge->>'day'=$3
      ORDER BY game,created_at DESC,id`,
        [own.id, dailyGames, day],
      ),
      pool.query(
        `SELECT id,game,completed_at FROM playne_games g WHERE ${own.sql}
        AND completed_at IS NOT NULL AND completed_at<=$2::timestamptz
      ORDER BY completed_at DESC,id LIMIT 32`,
        [own.id, now.toISOString()],
      ),
      readPlayStreak(pool, viewer, day),
    ]);
  return {
    day,
    streak,
    ...activity,
    goal: { days: 3, completedDays: activity.weeklyDays },
    milestones,
    favorites: favorites.rows.map((row) => ({
      game: row.game,
      completedRuns: Number(row.completed_runs),
      lastCompletedAt: new Date(row.last_completed_at).toISOString(),
    })),
    daily: Object.fromEntries(
      daily.rows.map((row) => [
        row.game,
        {
          id: row.id,
          completed: !!row.completed_at,
          completedRounds: Number(row.completed_rounds),
          totalRounds: 5,
        },
      ]),
    ),
    recentCompletions: recent.rows.map((row) => ({
      id: row.id,
      game: row.game,
      completedAt: new Date(row.completed_at).toISOString(),
    })),
  };
}

export async function registerPlayProgressRoutes(
  app: FastifyInstance,
  pool: Pool,
  browser: (req: any, reply: any) => string,
  user: (req: any) => Promise<{ id: string } | null>,
) {
  app.get("/api/play/streaks", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = req.query as Record<string, string>;
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? 5 : Number(query.limit);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      return reply.code(400).send({ error: "Некорректная страница рейтинга" });
    const signed = await user(req);
    return readStreakLeaderboard(pool, signed?.id ?? null, page, limit);
  });
  app.get("/api/play/progress", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const browserHash = browser(req, reply);
    const signed = await user(req);
    return readPlayProgress(pool, { browserHash, userId: signed?.id });
  });
}
