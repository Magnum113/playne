import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { scoreVersion } from "./scoring";
import { lineMoscowDate } from "../src/line";
import {
  CHALLENGE_GAMES,
  type ChallengeGame,
  type ChallengeStart,
  type PublicChallenge,
} from "../src/challenges";
import { renderChallengePng, challengeHtml } from "./challenge-preview";

type Queryable = Pick<Pool, "query">;
type Viewer = { browserHash: string; userId?: string };
type Dependencies = {
  origin: string;
  browser: (req: any, reply: any) => string;
  user: (req: any) => Promise<{ id: string } | null>;
};
const names: Record<ChallengeGame, string> = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
  pressure: "Жми",
  line: "Одной линией",
  flash: "Вспышка",
  rotate: "Поворот",
  slide: "Передвинь",
  dispatch: "Диспетчер",
};
export const privateComparison = (run: any): boolean =>
  run.challenge?.comparison === true;
const validToken = (token: unknown): token is string =>
  typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
const validId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
function failure(message: string, statusCode = 404): never {
  throw Object.assign(new Error(message), { statusCode });
}

function supported(run: any) {
  const challenge = run.challenge;
  const day = challenge?.day;
  const brain = ["line", "flash", "rotate", "slide", "dispatch"].includes(
    run.game,
  );
  if (
    !(CHALLENGE_GAMES as readonly string[]).includes(run.game) ||
    run.version !== scoreVersion(run.game) ||
    !run.completed_at ||
    run.answer_count !== (["circle", "pressure"].includes(run.game) ? 1 : 5) ||
    !Number.isInteger(run.score_units) ||
    run.score_units < 0 ||
    run.score_units >
      (run.game === "pressure"
        ? 250000
        : run.game === "circle"
          ? 1000
          : 5000) ||
    (brain && (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)))
  )
    failure("Для вызова нужна завершённая партия текущей версии игры.", 409);
  if (!brain) {
    if (
      (run.game === "naglaz" && challenge?.pairIds?.length !== 5) ||
      (run.game === "colorfle" && challenge?.targets?.length !== 5) ||
      (run.game === "geo" && challenge?.places?.length !== 5) ||
      (run.game === "pressure" &&
        (!Number.isInteger(challenge?.seed) ||
          !Array.isArray(challenge?.levels)))
    )
      failure("Эту версию задания нельзя повторить.", 409);
    return;
  }
  if (run.game === "line") {
    if (
      !Array.isArray(challenge.puzzles) ||
      challenge.puzzles.length !== 5 ||
      challenge.puzzles.some(
        (p: any) => !p || typeof p.id !== "string" || !p.numbers,
      )
    )
      failure("Эту версию задания нельзя повторить.", 409);
  } else if (
    !Array.isArray(challenge.rounds) ||
    challenge.rounds.length !== 5 ||
    challenge.rounds.some((r: any) => r?.kind !== run.game)
  ) {
    failure("Эту версию задания нельзя повторить.", 409);
  }
}

function metadata(
  run: any,
  origin: string,
  today = lineMoscowDate(),
): PublicChallenge {
  supported(run);
  const base = new URL(origin).origin;
  return {
    token: run.token,
    url: `${base}/challenge/${run.token}`,
    imageUrl: `${base}/api/challenges/${run.token}/image.png`,
    game: run.game,
    gameName: names[run.game as ChallengeGame],
    nickname: run.nickname || "Гость",
    score: run.score_units / 10,
    maxScore: run.game === "circle" ? 100 : run.game === "pressure" ? 0 : 500,
    day:
      run.challenge.day ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(run.completed_at)),
    mode: run.mode,
    isTodayDaily:
      ["line", "flash", "rotate", "slide", "dispatch"].includes(run.game) &&
      run.mode === "classic" &&
      run.challenge.day === today &&
      !privateComparison(run),
  };
}

async function canManage(client: Queryable, run: any, viewer: Viewer) {
  if (run.owner_id) return run.owner_id === viewer.userId;
  return (
    (
      await client.query(
        "SELECT 1 FROM playne_guest_trials WHERE browser_hash=$1 AND run_id=$2",
        [viewer.browserHash, run.id],
      )
    ).rows.length > 0
  );
}

const sourceColumns = `g.id,g.game,g.version,g.mode,g.challenge,g.score_units,g.completed_at,g.owner_id,
  jsonb_array_length(g.answers) AS answer_count,u.nickname`;

async function sharedSource(
  client: Queryable,
  token: unknown,
  lock = false,
  allowRevoked = false,
) {
  if (!validToken(token)) failure("Вызов не найден.");
  const { rows } = await client.query(
    `SELECT ${sourceColumns},c.token,c.revoked_at FROM playne_challenges c
    JOIN playne_games g ON g.id=c.run_id LEFT JOIN playne_users u ON u.id=g.owner_id
    WHERE c.token=$1 ${allowRevoked ? "" : "AND c.revoked_at IS NULL"}${lock ? " FOR SHARE OF c,g" : ""}`,
    [token],
  );
  if (!rows[0]) failure("Вызов не найден.");
  return rows[0];
}

/** Call inside the existing /games transaction, before its ordinary access/day gates.
 * Today's classic uses those original gates and never inserts a copied daily attempt.
 */
export async function resolveChallengeStart(
  client: Queryable,
  token: unknown,
  game: string,
  origin: string,
  today = lineMoscowDate(),
): Promise<ChallengeStart> {
  // A successful read authorizes this start. Holding the source run lock here
  // would invert the application's publication/day lock order.
  const source = await sharedSource(client, token);
  const reference = metadata(source, origin, today);
  if (reference.game !== game) failure("Вызов относится к другой игре.", 400);
  if (reference.isTodayDaily)
    return { kind: "daily", mode: "classic", reference };
  if (!["line", "flash", "rotate", "slide", "dispatch"].includes(source.game)) {
    const challenge = structuredClone(source.challenge);
    delete challenge.timers;
    if (source.game === "colorfle") challenge.timers = {};
    if (source.game === "geo") {
      challenge.panoramas = Object.fromEntries(
        Object.entries(challenge.panoramas ?? {}).map(([k, v]: any) => [
          k,
          { pano: v.pano, actual: v.actual },
        ]),
      );
    }
    return {
      kind: "comparison",
      mode: source.mode,
      version: source.version,
      reference,
      challenge: {
        ...challenge,
        comparison: true,
        comparisonToken: source.token,
      },
    };
  }
  const challenge =
    source.game === "line"
      ? {
          puzzles: structuredClone(source.challenge.puzzles),
          day: source.challenge.day,
          mode: "practice",
          rounds: {},
        }
      : {
          game: source.game,
          version: 1,
          day: source.challenge.day,
          mode: "practice",
          difficulty: source.challenge.difficulty,
          rounds: structuredClone(source.challenge.rounds),
          states: {},
        };
  return {
    kind: "comparison",
    mode: "practice",
    version: 1,
    reference,
    challenge: {
      ...challenge,
      comparison: true,
      comparisonToken: source.token,
    },
  };
}

export async function registerChallengeRoutes(
  app: FastifyInstance,
  pool: Pool,
  deps: Dependencies,
) {
  const viewer = async (req: any, reply: any): Promise<Viewer> => ({
    browserHash: deps.browser(req, reply),
    userId: (await deps.user(req))?.id,
  });
  app.post(
    "/api/challenges",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const id = (req.body as any)?.runId;
      if (!validId(id)) failure("Некорректная партия.", 400);
      const who = await viewer(req, reply);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const source = (
          await client.query(
            `SELECT ${sourceColumns} FROM playne_games g LEFT JOIN playne_users u ON u.id=g.owner_id WHERE g.id=$1 FOR SHARE OF g`,
            [id],
          )
        ).rows[0];
        if (!source || !(await canManage(client, source, who)))
          failure("Партия не найдена.");
        supported(source);
        const token = randomBytes(32).toString("base64url");
        const shared = await client.query(
          `INSERT INTO playne_challenges(token,run_id,created_by,browser_hash) VALUES($1,$2,$3,$4)
        ON CONFLICT(run_id) DO UPDATE SET
          token=CASE WHEN playne_challenges.revoked_at IS NULL THEN playne_challenges.token ELSE EXCLUDED.token END,
          created_at=CASE WHEN playne_challenges.revoked_at IS NULL THEN playne_challenges.created_at ELSE now() END,
          revoked_at=NULL,created_by=EXCLUDED.created_by,browser_hash=EXCLUDED.browser_hash RETURNING token`,
          [token, id, who.userId ?? null, who.browserHash],
        );
        await client.query("COMMIT");
        return metadata(
          { ...source, token: shared.rows[0].token },
          deps.origin,
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
  app.get("/api/challenges/:token", async (req) =>
    metadata(await sharedSource(pool, (req.params as any).token), deps.origin),
  );
  app.delete("/api/challenges/:token", async (req, reply) => {
    const who = await viewer(req, reply);
    const source = await sharedSource(
      pool,
      (req.params as any).token,
      false,
      true,
    );
    if (!(await canManage(pool, source, who))) failure("Вызов не найден.");
    await pool.query(
      "UPDATE playne_challenges SET revoked_at=coalesce(revoked_at,now()) WHERE token=$1",
      [source.token],
    );
    return { ok: true };
  });
  app.get(
    "/api/challenges/:token/image.png",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const data = metadata(
        await sharedSource(pool, (req.params as any).token),
        deps.origin,
      );
      reply.header("Cache-Control", "no-store").type("image/png");
      return reply.send(await renderChallengePng(data));
    },
  );
  app.get("/challenge/:token", async (req, reply) => {
    const data = metadata(
      await sharedSource(pool, (req.params as any).token),
      deps.origin,
    );
    reply
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow, noarchive")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      )
      .type("text/html; charset=utf-8");
    return reply.send(challengeHtml(data));
  });
}
