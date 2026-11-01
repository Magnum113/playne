import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { resolveChallengeStart } from "./challenges";
import { FLOW_VERSION, flowDay, makeFlowPuzzle, replayFlow } from "../src/flow";

export async function registerFlowRoutes(
  app: FastifyInstance,
  pool: Pool,
  browser: (req: any, reply: any) => string,
  user: (req: any, client?: any) => Promise<{ id: string } | null>,
  failure: (message: string, status?: number) => never,
  origin: string,
) {
  app.get("/api/flow/progress", async (req, reply) => {
    const b = browser(req, reply),
      u = await user(req);
    if (u)
      await pool.query(
        "UPDATE playne_games SET owner_id=$1,published_at=CASE WHEN mode='classic' AND coalesce(challenge->>'comparison','false')<>'true' THEN completed_at ELSE NULL END WHERE game='flow' AND browser_hash=$2 AND owner_id IS NULL AND completed_at IS NOT NULL",
        [u.id, b],
      );
    const { rows } = await pool.query(
      `SELECT DISTINCT ON(challenge->>'kind',challenge->>'key') challenge->>'kind' AS kind,challenge->>'key' AS key,score_units/10 AS score FROM playne_games WHERE game='flow' AND (version=${FLOW_VERSION} OR (version IN (2,3) AND challenge->>'kind'='level')) AND completed_at IS NOT NULL AND coalesce(challenge->>'comparison','false')<>'true' AND ${u ? "owner_id=$1" : "browser_hash=$1 AND owner_id IS NULL"} ORDER BY challenge->>'kind',challenge->>'key',score_units DESC`,
      [u?.id ?? b],
    );
    return {
      records: Object.fromEntries(
        rows.map((r) => [
          `${r.kind}:${r.key}`,
          {
            score: Number(r.score),
            stars: r.score >= 960 ? 3 : r.score >= 800 ? 2 : 1,
          },
        ]),
      ),
      day: flowDay(),
    };
  });
  app.post(
    "/api/flow/finish",
    { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = req.body as any;
      if (
        !input ||
        ![2, 3, FLOW_VERSION].includes(input.version) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input.id,
        ) ||
        !["level", "daily"].includes(input.kind) ||
        typeof input.key !== "string" ||
        (input.challengeToken !== undefined &&
          (typeof input.challengeToken !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(input.challengeToken)))
      )
        failure("Некорректная партия");
      if (
        input.kind === "daily" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(input.key) ||
          !Number.isFinite(Date.parse(`${input.key}T12:00:00Z`)) ||
          new Date(`${input.key}T12:00:00Z`).toISOString().slice(0, 10) !==
            input.key ||
          input.key > flowDay())
      )
        failure("Это испытание ещё недоступно");
      let result;
      try {
        result = replayFlow(
          makeFlowPuzzle(
            input.kind,
            input.kind === "level" ? Number(input.key) : input.key,
            input.version,
          ),
          input.actions,
        );
      } catch (error) {
        failure((error as Error).message);
      }
      if (!result.won) failure("Сначала собери все кубики");
      if (input.kind === "level" && String(Number(input.key)) !== input.key)
        failure("Некорректный номер уровня");
      const b = browser(req, reply),
        c = await pool.connect();
      try {
        await c.query("BEGIN");
        const u = await user(req, c);
        if (input.challengeToken) {
          const shared = await resolveChallengeStart(
            c,
            input.challengeToken,
            "flow",
            origin,
            undefined,
            true,
          );
          if (
            shared.kind !== "comparison" ||
            shared.version !== input.version ||
            shared.challenge.kind !== input.kind ||
            shared.challenge.key !== input.key
          )
            failure("Для сравнения нужны те же кубики", 409);
        }
        const challenge = {
          ...(input.challengeToken
            ? { comparison: true, comparisonToken: input.challengeToken }
            : {}),
          kind: input.kind,
          key: input.key,
          day: input.kind === "daily" ? input.key : flowDay(),
        };
        await c.query(
          `INSERT INTO playne_games(id,browser_hash,owner_id,game,version,mode,challenge,answers,score_units,completed_at,published_at,expires_at) VALUES($1,$2,$3,'flow',$8,$4,$5,$6,$7,now(),CASE WHEN $3::uuid IS NOT NULL AND $4='classic' THEN now() ELSE NULL END,now()+interval '365 days') ON CONFLICT(id) DO NOTHING`,
          [
            input.id,
            b,
            u?.id ?? null,
            input.kind === "daily" && !input.challengeToken
              ? "classic"
              : "practice",
            JSON.stringify(challenge),
            JSON.stringify([{ actions: input.actions, score: result.score }]),
            result.score * 10,
            input.version,
          ],
        );
        const stored = (
          await c.query("SELECT * FROM playne_games WHERE id=$1 FOR UPDATE", [
            input.id,
          ])
        ).rows[0];
        if (
          !stored ||
          stored.game !== "flow" ||
          stored.version !== input.version ||
          (stored.browser_hash !== b && stored.owner_id !== u?.id)
        )
          failure("Партия не найдена", 404);
        if (u && stored.owner_id && stored.owner_id !== u.id)
          failure("Эта партия сохранена в другом аккаунте", 409);
        if (
          (stored.challenge.comparisonToken ?? undefined) !==
            input.challengeToken ||
          stored.challenge.kind !== input.kind ||
          stored.challenge.key !== input.key ||
          JSON.stringify(
            stored.answers[0]?.actions.map((a: any) =>
              a.type === "launch" ? `launch:${a.lane}` : a.type,
            ),
          ) !==
            JSON.stringify(
              input.actions.map((a: any) =>
                a.type === "launch" ? `launch:${a.lane}` : a.type,
              ),
            )
        )
          failure("Эта партия уже сохранена с другим результатом", 409);
        if (u && !stored.owner_id)
          await c.query(
            "UPDATE playne_games SET owner_id=$1,published_at=CASE WHEN mode='classic' AND coalesce(challenge->>'comparison','false')<>'true' THEN completed_at ELSE NULL END WHERE id=$2 AND owner_id IS NULL",
            [u.id, stored.id],
          );
        await c.query("COMMIT");
        return {
          saved: true,
          score: result.score,
          stars: result.stars,
          day: flowDay(),
        };
      } catch (error) {
        await c.query("ROLLBACK");
        throw error;
      } finally {
        c.release();
      }
    },
  );
  app.get("/api/flow/leaderboard", async (req, reply) => {
    browser(req, reply);
    const u = await user(req),
      day = flowDay();
    const { rows } = await pool.query(
      `WITH best AS (SELECT owner_id,max(score_units)/10 AS score FROM playne_games WHERE game='flow' AND version=${FLOW_VERSION} AND mode='classic' AND coalesce(challenge->>'comparison','false')<>'true' AND challenge->>'key'=$1 AND completed_at IS NOT NULL AND owner_id IS NOT NULL GROUP BY owner_id), ranked AS (SELECT b.owner_id,u.nickname,b.score,rank() OVER(ORDER BY b.score DESC) AS place FROM best b JOIN playne_users u ON u.id=b.owner_id) SELECT *,count(*) OVER() AS total FROM ranked ORDER BY score DESC,nickname,owner_id LIMIT 10`,
      [day],
    );
    return {
      day,
      total: Number(rows[0]?.total ?? 0),
      entries: rows.map((r) => ({
        nickname: r.nickname,
        score: Number(r.score),
        place: Number(r.place),
        isMe: r.owner_id === u?.id,
      })),
    };
  });
}
