import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { geoDailyDate, validGeoDailyDate } from "../src/geoDaily";
import { MALOKTO_READ_MS, MALOKTO_ROUND_MS, MALOKTO_ROUNDS, type MaloktoAnswer } from "../src/malokto";
import { GEO_DAILY_LEADERBOARD_SQL } from "./leaderboard";
import { MALOKTO_BANK_START, maloktoPack, type RareQuestion } from "./malokto-bank";

type DB = Pick<Pool, "query">;
const seasonStart = validGeoDailyDate(process.env.MALOKTO_START_DAY)
  ? process.env.MALOKTO_START_DAY
  : MALOKTO_BANK_START;
export async function findMaloktoRun(db: DB, day: string, browser: string, owner?: string) {
  return (await db.query(
    `SELECT * FROM playne_games WHERE game='malokto' AND mode='daily' AND challenge->>'day'=$1
     AND (owner_id=$3 OR (owner_id IS NULL AND browser_hash=$2))
     ORDER BY (owner_id IS NOT NULL) DESC LIMIT 1`,
    [day, browser, owner ?? null],
  )).rows[0];
}

export async function maloktoDailyChallenge(db: DB, day: string) {
  const pack = maloktoPack(day, seasonStart);
  if (!pack) return null;
  await db.query(
    "INSERT INTO playne_malokto_daily_packs(day,tasks) VALUES($1,$2) ON CONFLICT(day) DO NOTHING",
    [day, JSON.stringify(pack)],
  );
  const { rows } = await db.query("SELECT tasks FROM playne_malokto_daily_packs WHERE day=$1", [day]);
  return { day, mode: "daily", tasks: rows[0].tasks, rounds: {} };
}

export function registerMaloktoRoutes(app: FastifyInstance, pool: Pool, deps: {
  browser: (req: any, reply: any) => string;
  user: (req: any) => Promise<{ id: string } | null>;
  owned: (req: any, reply: any, id: unknown, db: any, lock?: boolean) => Promise<any>;
  failure: (message: string, code?: number) => never;
}) {
  const { browser, user, owned, failure } = deps;
  app.get("/api/malokto/daily", async (req, reply) => {
    const day = geoDailyDate();
    const browserHash = browser(req, reply);
    const viewer = await user(req);
    const [run, leaders] = await Promise.all([
      findMaloktoRun(pool, day, browserHash, viewer?.id),
      pool.query(GEO_DAILY_LEADERBOARD_SQL + " SELECT nickname,score,place,position,elapsed_ms FROM ranked ORDER BY position LIMIT 3",
        ["malokto", 1, "all", "daily", day]),
    ]);
    reply.header("Cache-Control", "no-store");
    return {
      day, available: !!maloktoPack(day, seasonStart),
      attempt: run ? { completed: !!run.completed_at } : null,
      leaders: leaders.rows.map(row => ({
        nickname: row.nickname,
        score: Number(row.score),
        place: Number(row.place),
        position: Number(row.position),
        elapsedMs: Number(row.elapsed_ms),
      })),
    };
  });

  app.post("/api/games/:id/malokto/start", async (req, reply) => {
    const index = (req.body as { index?: unknown })?.index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= MALOKTO_ROUNDS) {
      return failure("Некорректный вопрос");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const run = await owned(req, reply, (req.params as { id: string }).id, client, true);
      if (run.game !== "malokto" || run.completed_at || index !== run.answers.length)
        return failure("Открывай вопросы по порядку", 409);
      if (run.challenge.day !== geoDailyDate()) return failure("Этот день завершён", 409);
      const task = run.challenge.tasks[index] as RareQuestion;
      const serverNow = Date.now();
      if (run.challenge.rounds[index] === undefined) {
        run.challenge.rounds[index] = serverNow + MALOKTO_READ_MS;
        await client.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [JSON.stringify(run.challenge), run.id]);
      }
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return { prompt: task.prompt, category: task.category, deadline: run.challenge.rounds[index] + MALOKTO_ROUND_MS, serverNow };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.get("/api/games/:id/malokto/review", async (req, reply) => {
    const run = await owned(req, reply, (req.params as { id: string }).id, pool);
    if (run.game !== "malokto" || !run.completed_at) return failure("Разбор откроется после пятого вопроса", 404);
    const answers = run.answers as MaloktoAnswer[];
    const { rows: [stats] } = await pool.query(
      `WITH peers AS (
         SELECT score_units,answers FROM playne_games WHERE game='malokto' AND mode='daily'
         AND challenge->>'day'=$1 AND version=$2 AND completed_at IS NOT NULL AND id<>$3
       )
       SELECT count(*)::int AS players, count(*) FILTER(WHERE score_units<$4)::int AS beaten,
         ARRAY(SELECT (SELECT count(*)::int FROM peers WHERE answers->(i-1)->>'name'=($5::text[])[i])
               FROM generate_subscripts($5::text[],1) i ORDER BY i) AS matches
       FROM peers`,
      [run.challenge.day, run.version, run.id, run.score_units, answers.map(answer => answer.name)],
    );
    reply.header("Cache-Control", "no-store");
    return {
      players: stats.players,
      beaten: stats.players ? Math.round(100 * stats.beaten / stats.players) : null,
      rounds: (run.challenge.tasks as RareQuestion[]).map((task, index) => {
        const answer = answers[index];
        const examples = [...task.answers].sort((a, b) => b.score - a.score)
          .filter(example => example.name !== answer.name);
        // Give one example per band first so the breakdown reveals the tradeoff.
        const bands = [...new Map(examples.slice().reverse().map(example => [example.score, example])).values()].reverse();
        return {
          prompt: task.prompt, category: task.category, answer, matches: stats.matches[index],
          examples: (bands.length >= 3 ? bands : examples.slice(0, 3)).map(({ name, score }) => ({ name, score })),
        };
      }),
    };
  });
}
