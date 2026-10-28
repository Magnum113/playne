import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  emailExperimentReport,
  confirmEmailSubscription,
  digest,
  emailError,
  emailSettings,
  mailConfigured,
  readEmailToken,
  requestEmailSubscription,
  signEmailToken,
  stopEmails,
  type EmailConfig,
} from "./email-core";
import {
  EMAIL_CONSENT_VERSION,
  emailGamePath,
  type RankEmailItem,
} from "./email-templates";

const activeEmailConsentSQL =
  "EXISTS(SELECT 1 FROM playne_email_contacts contact WHERE contact.user_id=o.user_id AND contact.generation=o.generation AND contact.enabled AND contact.verified_at IS NOT NULL)";
const validUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
export async function registerEmailRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: EmailConfig,
  requireUser: (req: FastifyRequest) => Promise<any>,
) {
  const transaction = async <T>(fn: (c: any) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const value = await fn(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  app.get("/api/email/report", async (req) => {
    const user = await requireUser(req);
    if (!config.adminId || user.id !== config.adminId)
      throw emailError("Недостаточно прав.", 403);
    return emailExperimentReport(pool);
  });
  app.get("/api/email/settings", async (req) =>
    emailSettings(pool, config, (await requireUser(req)).id),
  );
  app.post(
    "/api/email/settings",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const user = await requireUser(req),
        body = req.body as any;
      if (body?.enabled === false) {
        await transaction(async (c) => {
          await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "email-user:" + user.id,
          ]);
          await stopEmails(c, config, user.id);
        });
        reply.clearCookie("playne_email_visit", { path: "/" });
      } else {
        if (
          body?.enabled !== true ||
          body?.consentVersion !== EMAIL_CONSENT_VERSION ||
          body?.dataConsent !== true
        )
          throw emailError("Подтверди согласие на письма и обработку адреса.");
        if (!mailConfigured(config))
          throw emailError("Письма пока недоступны. Попробуй позже.", 503);
        await transaction((c) =>
          requestEmailSubscription(c, config, user.id, body.email, "account"),
        );
      }
      return emailSettings(pool, config, user.id);
    },
  );
  app.post(
    "/api/email/confirm",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (req) => {
      await transaction((c) =>
        confirmEmailSubscription(c, config, (req.body as any)?.token),
      );
      return { ok: true };
    },
  );
  const unsubscribe = async (value: unknown) => {
    const data = readEmailToken(config, value, "unsubscribe");
    if (!data || !validUuid(data.g))
      throw emailError(
        "Ссылка устарела. Отключить письма можно в кабинете.",
        410,
      );
    await transaction(async (c) => {
      const initial = (
        await c.query(
          "SELECT user_id FROM playne_email_contacts WHERE generation=$1",
          [data.g],
        )
      ).rows[0];
      if (!initial)
        throw emailError(
          "Ссылка устарела. Отключить письма можно в кабинете.",
          410,
        );
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "email-user:" + initial.user_id,
      ]);
      const contact = (
        await c.query(
          "SELECT user_id FROM playne_email_contacts WHERE generation=$1 FOR UPDATE",
          [data.g],
        )
      ).rows[0];
      if (!contact)
        throw emailError(
          "Ссылка устарела. Отключить письма можно в кабинете.",
          410,
        );
      await stopEmails(c, config, contact.user_id);
      if (validUuid(data.o))
        await c.query(
          `UPDATE playne_email_outbox SET unsubscribed_at=coalesce(unsubscribed_at,now()) WHERE id=$1 AND user_id=$2 AND kind='rank' AND submitted_at IS NOT NULL`,
          [data.o, contact.user_id],
        );
    });
    return { ok: true };
  };
  app.post("/api/email/unsubscribe", async (req, reply) => {
    const result = await unsubscribe((req.body as any)?.token);
    reply.clearCookie("playne_email_visit", { path: "/" });
    return result;
  });
  // Header URL supports RFC 8058 without cookies or Origin; possession of the signed capability is required.
  app.post("/api/email/unsubscribe/:token", async (req, reply) => {
    const body = req.body as any;
    if (
      body?.["List-Unsubscribe"] !== "One-Click" &&
      body?.confirm !== "unsubscribe"
    )
      throw emailError("Подтверди отключение писем.");
    const result = await unsubscribe((req.params as any).token);
    reply.clearCookie("playne_email_visit", { path: "/" });
    return result;
  });
  app.get("/api/email/unsubscribe/:token", async (req, reply) => {
    if (!readEmailToken(config, (req.params as any).token, "unsubscribe"))
      throw emailError("Ссылка устарела.", 410);
    // GET only opens the confirmation screen; mail scanners cannot unsubscribe.
    return reply.redirect(
      config.origin +
        "/account/?mail=unsubscribe#" +
        encodeURIComponent((req.params as any).token),
    );
  });
  app.get("/api/email/click/:token", async (req, reply) => {
    const data = readEmailToken(config, (req.params as any).token, "click");
    const target = (req.query as any).target;
    if (!data || !validUuid(data.o) || !["play", "rank"].includes(target))
      throw emailError("Ссылка устарела. Выбери игру на главной.", 410);
    const row = (
      await pool.query(
        `SELECT payload,variant,${activeEmailConsentSQL} AS consent FROM playne_email_outbox o WHERE id=$1 AND kind='rank' AND submitted_at IS NOT NULL`,
        [data.o],
      )
    ).rows[0];
    const item = row?.payload?.items?.[0] as RankEmailItem | undefined;
    if (!item)
      throw emailError("Ссылка устарела. Выбери игру на главной.", 410);
    if (row.consent)
      await pool.query(
        `UPDATE playne_email_outbox o SET raw_click_at=coalesce(raw_click_at,now()) WHERE id=$1 AND ${activeEmailConsentSQL}`,
        [data.o],
      );
    if (row.consent)
      reply.setCookie(
        "playne_email_visit",
        signEmailToken(config, "attribution", { o: data.o, exp: data.exp }),
        {
          path: "/",
          httpOnly: true,
          secure: config.origin.startsWith("https:"),
          sameSite: "lax",
          maxAge: Math.max(0, Math.floor((data.exp - Date.now()) / 1000)),
        },
      );
    const path =
      target === "play"
        ? emailGamePath(item.game, item.mode)
        : `/leaderboard/?game=${item.game}&mode=${encodeURIComponent(item.mode)}&period=all`;
    return reply.redirect(
      path +
        (path.includes("?") ? "&" : "?") +
        `from_email=1&utm_source=playne&utm_medium=email&utm_campaign=rank-notifications&utm_content=${encodeURIComponent(row.variant ?? "design")}`,
    );
  });
  app.post("/api/email/visit", async (req) => {
    if ((req.body as any)?.interacted !== true) return { ok: true };
    const data = readEmailToken(
      config,
      req.cookies.playne_email_visit,
      "attribution",
    );
    if (data && validUuid(data.o))
      await pool.query(
        `UPDATE playne_email_outbox o SET visited_at=coalesce(visited_at,now()) WHERE id=$1 AND kind='rank' AND submitted_at>now()-interval '7 days' AND ${activeEmailConsentSQL}`,
        [data.o],
      );
    return { ok: true };
  });
  app.get("/api/email/provider", async () => ({ ok: true }));
  app.post("/api/email/provider", { bodyLimit: 200000 }, async (req) => {
    const raw = (req as any).emailRawBody as string | undefined,
      body = req.body as any;
    if (
      !raw ||
      !config.apiKey ||
      !config.projectId ||
      !/^[a-f0-9]{32}$/i.test(body?.auth ?? "")
    )
      throw emailError("Invalid callback", 403);
    const matches = [...raw.matchAll(/"auth"\s*:\s*"([a-f0-9]{32})"/gi)];
    if (matches.length !== 1) throw emailError("Invalid callback", 403);
    const signed = raw.replace(
      /("auth"\s*:\s*")[a-f0-9]{32}("\s*[,}])/i,
      (_, a, b) => a + config.apiKey + b,
    );
    const expected = createHash("md5").update(signed).digest();
    const actual = Buffer.from(body.auth, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw emailError("Invalid callback", 403);
    if (
      !Array.isArray(body.events_by_user) ||
      body.events_by_user.length !== 1 ||
      String(body.events_by_user[0].project_id) !== config.projectId ||
      !Array.isArray(body.events_by_user[0].events) ||
      body.events_by_user[0].events.length > 100
    )
      throw emailError("Invalid project", 403);
    await transaction(async (c) => {
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('playne-email-provider-callback'))",
      );
      const inserted = await c.query(
        "INSERT INTO playne_email_callbacks(digest) VALUES($1) ON CONFLICT DO NOTHING RETURNING digest",
        [digest(raw)],
      );
      if (!inserted.rowCount) return;
      for (const event of body.events_by_user[0].events) {
        if (event.event_name !== "transactional_email_status") continue;
        const data = event.event_data;
        if (data?.status === "subscribed" && typeof data.email === "string") {
          const pending = (
            await c.query(
              `SELECT o.generation FROM playne_email_outbox o JOIN playne_email_contacts e ON e.user_id=o.user_id AND e.generation=o.generation WHERE lower(e.email)=lower($1) AND e.requested_at IS NOT NULL AND NOT e.enabled AND o.kind='verify' AND o.payload->>'providerResubscribe'='true' AND o.submitted_at>now()-interval '24 hours' AND o.status IN('sending','accepted','uncertain') ORDER BY o.submitted_at DESC LIMIT 1`,
              [data.email],
            )
          ).rows[0];
          if (pending)
            await confirmEmailSubscription(
              c,
              config,
              signEmailToken(config, "confirm", {
                g: pending.generation,
                exp: Date.now() + 60000,
              }),
            );
        }
        if (!data || !validUuid(data.metadata?.outbox_id)) continue;
        const initial = (
          await c.query("SELECT user_id FROM playne_email_outbox WHERE id=$1", [
            data.metadata.outbox_id,
          ])
        ).rows[0];
        if (!initial) continue;
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "email-user:" + initial.user_id,
        ]);
        const row = (
          await c.query(
            "SELECT * FROM playne_email_outbox WHERE id=$1 FOR UPDATE",
            [data.metadata.outbox_id],
          )
        ).rows[0];
        if (
          !row ||
          !row.submitted_at ||
          typeof data.email !== "string" ||
          data.email.toLowerCase() !== row.payload.email ||
          (row.provider_job && row.provider_job !== data.job_id)
        )
          continue;
        const delivered = ["delivered", "opened", "clicked"].includes(
          data.status,
        );
        if (
          ["accepted", "sent", "delivered", "opened", "clicked"].includes(
            data.status,
          )
        ) {
          await c.query(
            `UPDATE playne_email_outbox SET status=CASE WHEN status IN('sending','uncertain') THEN 'accepted' ELSE status END,provider_job=coalesce(provider_job,$1),delivered_at=CASE WHEN $2 THEN coalesce(delivered_at,now()) ELSE delivered_at END,updated_at=now() WHERE id=$3`,
            [
              typeof data.job_id === "string" ? data.job_id : null,
              delivered,
              row.id,
            ],
          );
          await c.query(
            "UPDATE playne_email_events SET handled_at=now() WHERE id=ANY($1::uuid[])",
            [row.event_ids],
          );
        }
        if (["unsubscribed", "spam", "hard_bounced"].includes(data.status)) {
          // An old-address bounce must not suppress a newly verified different address.
          const contact = (
            await c.query(
              "SELECT generation FROM playne_email_contacts WHERE user_id=$1",
              [row.user_id],
            )
          ).rows[0];
          if (contact?.generation === row.generation) {
            await stopEmails(
              c,
              config,
              row.user_id,
              data.status === "unsubscribed" ? "unsubscribe" : data.status,
            );
            if (data.status === "unsubscribed")
              await c.query(
                "UPDATE playne_email_contacts SET provider_unsubscribed=true WHERE user_id=$1",
                [row.user_id],
              );
          }
          if (data.status === "unsubscribed")
            await c.query(
              "UPDATE playne_email_outbox SET unsubscribed_at=coalesce(unsubscribed_at,now()) WHERE id=$1",
              [row.id],
            );
          if (data.status === "spam")
            await c.query(
              "UPDATE playne_email_outbox SET complaint_at=coalesce(complaint_at,now()) WHERE id=$1",
              [row.id],
            );
        }
      }
    });
    return { ok: true };
  });
}

export async function recordEmailGameStart(
  c: any,
  config: EmailConfig,
  req: FastifyRequest,
  runId: string,
) {
  const data = readEmailToken(
    config,
    req.cookies.playne_email_visit,
    "attribution",
  );
  if (!data || !validUuid(data.o)) return;
  await c.query(
    `UPDATE playne_games g SET email_origin=o.id FROM playne_email_outbox o WHERE g.id=$1 AND o.id=$2 AND o.kind='rank' AND o.submitted_at>now()-interval '7 days' AND ${activeEmailConsentSQL}`,
    [runId, data.o],
  );
  // Only an authenticated matching owner counts as a game start; guest runs are linked when claimed.
  await c.query(
    `UPDATE playne_email_outbox o SET game_started_at=coalesce(o.game_started_at,now()) FROM playne_games g WHERE g.id=$1 AND g.email_origin=o.id AND g.owner_id=o.user_id AND ${activeEmailConsentSQL}`,
    [runId],
  );
}
export async function recordEmailGameCompletion(c: any, runId: string) {
  await c.query(
    `UPDATE playne_email_outbox o SET game_started_at=coalesce(o.game_started_at,now()),game_completed_at=coalesce(o.game_completed_at,now()) FROM playne_games g WHERE g.id=$1 AND g.email_origin=o.id AND g.owner_id=o.user_id AND g.published_at IS NOT NULL AND o.submitted_at>now()-interval '7 days' AND ${activeEmailConsentSQL}`,
    [runId],
  );
}
