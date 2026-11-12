import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { createPerceptionTasks, publicPerceptionTask, type PerceptionAnswer } from "../src/perception";
import { geoDailyDate } from "../src/geoDaily";
import { GEO_DAILY_LEADERBOARD_SQL } from "./leaderboard";

export async function perceptionDailyChallenge(client: PoolClient, day: string) {
  await client.query(
    "INSERT INTO playne_perception_daily_packs(day,tasks) VALUES($1,$2) ON CONFLICT(day) DO NOTHING",
    [day, JSON.stringify(createPerceptionTasks(day))],
  );
  const { rows } = await client.query("SELECT tasks,version FROM playne_perception_daily_packs WHERE day=$1", [day]);
  return { day, mode: "daily", tasks: rows[0].tasks, rounds: {} };
}

export async function findPerceptionRun(client: Pick<Pool | PoolClient, "query">, day: string, browserHash: string, ownerId?: string) {
  const { rows } = await client.query(
    `SELECT * FROM playne_games WHERE game='perception' AND mode='daily' AND challenge->>'day'=$1
       AND (owner_id=$3 OR (owner_id IS NULL AND browser_hash=$2))
       ORDER BY (owner_id IS NOT NULL) DESC LIMIT 1`,
    [day, browserHash, ownerId ?? null],
  );
  return rows[0];
}

// Caller holds lockPublications, serializing daily starts and OAuth claims.
export async function canClaimPerception(client: PoolClient, run: any, ownerId: string) {
  if (run.game !== "perception") return true;
  const prior = await client.query(
    "SELECT 1 FROM playne_games WHERE game='perception' AND mode='daily' AND challenge->>'day'=$1 AND owner_id=$2 AND id<>$3",
    [run.challenge.day, ownerId, run.id],
  );
  return prior.rows.length === 0;
}

export async function registerPerceptionRoutes(
  app: FastifyInstance,
  pool: Pool,
  owned: (req: FastifyRequest, reply: any, id: unknown, client: any, lock?: boolean) => Promise<any>,
  failure: (message: string, code?: number) => never,
  browser: (req: FastifyRequest, reply: any) => string,
  user: (req: FastifyRequest) => Promise<any>,
) {
  app.get("/api/perception/daily", async (req, reply) => {
    const day = geoDailyDate(), b = browser(req, reply), viewer = await user(req);
    const [run, leaders] = await Promise.all([
      findPerceptionRun(pool, day, b, viewer?.id),
      pool.query(GEO_DAILY_LEADERBOARD_SQL + " SELECT nickname,score,place,position,elapsed_ms FROM ranked ORDER BY position LIMIT 3", ["perception", 1, "all", "daily", day]),
    ]);
    reply.header("Cache-Control", "no-store");
    return {
      day,
      leaders: leaders.rows.map((entry) => ({ nickname: entry.nickname, score: Number(entry.score), place: Number(entry.place), position: Number(entry.position), elapsedMs: Number(entry.elapsed_ms) })),
      attempt: run ? { id: run.id, completed: !!run.completed_at, published: !!run.published_at, score: run.score_units === null ? null : run.score_units / 10 } : null,
    };
  });

  app.get("/api/games/:id/perception/comparison", async (req, reply) => {
    const run = await owned(req, reply, (req.params as { id: string }).id, pool);
    if (run.game !== "perception" || !run.completed_at) {
      failure("Результат ещё недоступен", 404);
    }
    const scores = (run.answers as PerceptionAnswer[]).map(answer => answer.score);
    const { rows: [stats] } = await pool.query(
      `WITH peers AS (
         SELECT score_units, answers FROM playne_games
         WHERE game='perception' AND mode='daily' AND version=$4
           AND challenge->>'day'=$1 AND completed_at IS NOT NULL AND id<>$5
       )
       SELECT count(*)::int AS players,
              count(*) FILTER (WHERE score_units<$3)::int AS beaten,
              round(avg(score_units)/10)::int AS average,
              ARRAY(
                SELECT (SELECT count(*)::int FROM peers
                        WHERE (answers->(step.number-1)->>'score')::int < ($2::int[])[step.number])
                FROM generate_subscripts($2::int[], 1) AS step(number)
                ORDER BY step.number
              ) AS rounds
       FROM peers`,
      [run.challenge.day, scores, run.score_units, run.version, run.id],
    );
    const percent = (count: number) => stats.players ? Math.round(100 * count / stats.players) : 0;
    reply.header("Cache-Control", "no-store");
    return {
      players: stats.players,
      averageScore: stats.average,
      beaten: percent(stats.beaten),
      rounds: (stats.rounds as number[]).map(percent),
    };
  });

  app.post("/api/games/:id/perception/start", async (req, reply) => {
    const index = (req.body as any)?.index;
    if (!Number.isInteger(index) || index < 0 || index > 4) failure("Некорректное задание");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, client, true);
      if (run.game !== "perception" || run.mode !== "daily" || run.completed_at || index !== run.answers.length)
        failure("Пройди задания по порядку", 409);
      const task = run.challenge.tasks?.[index];
      if (!task) failure("Задание недоступно", 409);
      const now = Date.now();
      run.challenge.rounds ??= {};
      // Reopening the tab never grants another presentation or resets the tie-break clock.
      run.challenge.rounds[index] ??= { startedAt: now };
      await client.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [JSON.stringify(run.challenge), run.id]);
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return { task: publicPerceptionTask(task), startedAt: run.challenge.rounds[index].startedAt, serverNow: now };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
