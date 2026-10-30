import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../server/app";
import { scoreVersion } from "../server/scoring";
import { prepareReminderEmails } from "../server/email-reminders";
import {
  reminderClock,
  validReminderSchedule,
} from "../server/email-reminders-policy";
import {
  confirmEmailSubscription,
  deliverEmails,
  emailSettings,
  hashAddress,
  notificationSnapshot,
  prepareRankEmails,
  queueDisplacements,
  requestEmailSubscription,
  signEmailToken,
  stopEmails,
  type EmailConfig,
} from "../server/email-core";
import {
  EMAIL_CONSENT_VERSION,
  LEGACY_EMAIL_CONSENT_VERSION,
} from "../src/emailConsent";
const db = process.env.TEST_DATABASE_URL;
const now = Date.parse("2026-11-02T16:00:00Z"); // Monday 19:00 Moscow.
const config: EmailConfig = {
  origin: "https://mail.test",
  secret: "local-test-secret-at-least-32-characters",
  apiKey: "local-only",
  projectId: "test",
  from: "hello@example.com",
  replyTo: "hello@example.com",
  enabled: true,
  yandexEmail: true,
  deliveryReady: true,
};
describe("Reminder schedule boundaries", () => {
  it("uses Moscow weekdays and rejects duplicate days, missing consent switches and quiet-hour times", () => {
    expect(reminderClock(now)).toMatchObject({
      day: "2026-11-02",
      weekday: 1,
      minutes: 19 * 60,
    });
    expect(
      validReminderSchedule({ enabled: true, days: [1, 3, 5], time: "19:00" }),
    ).toBe(true);
    for (const value of [
      { enabled: true, days: [], time: "19:00" },
      { enabled: true, days: [1, 1], time: "19:00" },
      { enabled: true, days: [8], time: "19:00" },
      { enabled: true, days: [1], time: "09:59" },
      { enabled: true, days: [1], time: "21:00" },
      { days: [1], time: "19:00" },
    ])
      expect(validReminderSchedule(value)).toBe(false);
  });
});
(db ? describe : describe.skip)(
  "General Playne consent and reminder PostgreSQL",
  () => {
    let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
    const tx = async <T>(fn: (c: any) => Promise<T>) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await fn(c);
        await c.query("COMMIT");
        return r;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    };
    const person = async () => {
      const id = (
        await pool.query(
          "INSERT INTO playne_users(nickname) VALUES('Проверка писем') RETURNING id",
        )
      ).rows[0].id as string;
      const token = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [createHash("sha256").update(token).digest("hex"), id],
      );
      return {
        id,
        cookie: "playne_session=" + token,
        email: id + "@example.com",
      };
    };
    async function subscribe(version = EMAIL_CONSENT_VERSION) {
      const p = await person();
      await pool.query(
        "INSERT INTO playne_identities(provider,subject,user_id,provider_email,email_received_at) VALUES('yandex',$1,$2,$3,now())",
        [p.id, p.id, p.email],
      );
      await tx((c) =>
        requestEmailSubscription(
          c,
          config,
          p.id,
          p.email,
          "test",
          now,
          version,
        ),
      );
      return p;
    }
    const contact = async (id: string) =>
      (
        await pool.query(
          "SELECT * FROM playne_email_contacts WHERE user_id=$1",
          [id],
        )
      ).rows[0];
    const post = (cookie: string, url: string, payload: any) =>
      app.inject({
        method: "POST",
        url,
        headers: { origin: config.origin, cookie },
        payload,
      });
    const remote = () =>
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ status: "success", job_id: "local-job" }),
          ),
      );
    async function played(id: string) {
      await pool.query(
        "INSERT INTO playne_games(browser_hash,owner_id,game,mode,challenge,answers,score_units,completed_at) VALUES('mail-test',$1,'rotate','practice','{}','[]',0,$2)",
        [id, new Date(now - 3600000)],
      );
    }
    async function rankEvent(id: string) {
      await pool.query(
        "INSERT INTO playne_games(browser_hash,owner_id,game,version,challenge,score_units,completed_at,published_at) VALUES('mail-test',$1,'colorfle',$2,'{}',3500,$3,$3)",
        [id, scoreVersion("colorfle"), new Date(now - 86400000)],
      );
      const before = await notificationSnapshot(pool, "colorfle", "classic"),
        rival = await person();
      const cause = (
        await pool.query(
          "INSERT INTO playne_games(browser_hash,owner_id,game,version,challenge,score_units,completed_at,published_at) VALUES('mail-test',$1,'colorfle',$2,'{}',4000,$3,$3) RETURNING id",
          [rival.id, scoreVersion("colorfle"), new Date(now - 86400000)],
        )
      ).rows[0].id;
      await queueDisplacements(
        pool,
        before,
        rival.id,
        cause,
        "colorfle",
        "classic",
      );
      await pool.query("UPDATE playne_email_events SET created_at=$1", [
        new Date(now - 31 * 60000),
      ]);
    }
    beforeAll(async () => {
      if (!db || new URL(db).pathname !== "/playne_test")
        throw Error("Isolated test database required");
      admin = new Pool({ connectionString: db });
      await admin.query("CREATE SCHEMA IF NOT EXISTS playne_reminder_test");
      pool = new Pool({
        connectionString: db,
        options: "-c search_path=playne_reminder_test",
      });
      await pool.query(readFileSync("server/schema.sql", "utf8"));
      await pool.query(readFileSync("server/reminders-schema.sql", "utf8"));
      app = await buildApp(
        pool,
        {
          origin: config.origin,
          yandexId: "test",
          yandexSecret: "test",
          redirect: config.origin + "/api/auth/yandex/callback",
          secure: true,
          revision: "reminders-test",
          email: config,
        },
        (async (url: any) =>
          new Response(
            JSON.stringify(
              String(url).includes("/token")
                ? { access_token: "local" }
                : {
                    id: "scope-oauth",
                    client_id: "test",
                    first_name: "Проверка",
                    default_email: "oauth-scope@example.com",
                  },
            ),
          )) as typeof fetch,
      );
    });
    beforeEach(async () => {
      await pool.query(
        "TRUNCATE playne_users,playne_games,playne_email_suppressions,playne_email_callbacks CASCADE",
      );
    });
    afterAll(async () => {
      await app?.close();
      await pool?.end();
      await admin?.query("DROP SCHEMA playne_reminder_test CASCADE");
      await admin?.end();
    });
    it("preserves legacy rank-only consent and requires explicit general consent for an upgrade", async () => {
      const p = await subscribe(LEGACY_EMAIL_CONSENT_VERSION);
      expect(await contact(p.id)).toMatchObject({
        purpose: "rank",
        reminders_enabled: false,
        consent_version: LEGACY_EMAIL_CONSENT_VERSION,
      });
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT * FROM playne_email_outbox")).rowCount,
      ).toBe(0);
      expect(
        (
          await post(p.cookie, "/api/email/reminders", {
            enabled: true,
            days: [1],
            time: "19:00",
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await post(p.cookie, "/api/email/settings", {
            enabled: true,
            email: p.email,
            consentVersion: EMAIL_CONSENT_VERSION,
          })
        ).statusCode,
      ).toBe(400);
      const upgraded = await post(p.cookie, "/api/email/settings", {
        enabled: true,
        email: p.email,
        consentVersion: EMAIL_CONSENT_VERSION,
        dataConsent: true,
      });
      expect(upgraded.statusCode, upgraded.body).toBe(200);
      expect(upgraded.json()).toMatchObject({
        purpose: "general",
        enabled: true,
        reminders: {
          enabled: true,
          days: [1, 3, 5],
          time: "19:00",
          timezone: "Europe/Moscow",
        },
      });
      expect(
        (
          await pool.query(
            "SELECT version FROM playne_email_consents WHERE user_id=$1 AND action='requested' ORDER BY id",
            [p.id],
          )
        ).rows.map((r) => r.version),
      ).toEqual([LEGACY_EMAIL_CONSENT_VERSION, EMAIL_CONSENT_VERSION]);
    });
    it("keeps persisted legacy OAuth consent narrow, opt-out sign-in neutral, and explicit OAuth upgrade general", async () => {
      const oauth = async (version?: string) => {
        const start = await app.inject(
          version
            ? {
                method: "POST",
                url: "/api/auth/yandex/start",
                headers: { origin: config.origin },
                payload: {
                  emailOptIn: true,
                  consentVersion: version,
                  dataConsent: true,
                },
              }
            : { url: "/api/auth/yandex/start" },
        );
        expect([200, 302]).toContain(start.statusCode);
        const url = version ? start.json().url : start.headers.location;
        const state = new URL(url).searchParams.get("state");
        const cookie = start.cookies
          .map((c) => c.name + "=" + c.value)
          .join("; ");
        const cb = await app.inject({
          url: `/api/auth/yandex/callback?state=${state}&code=local`,
          headers: { cookie },
        });
        expect(cb.headers.location).toContain("auth=success");
      };
      await oauth(LEGACY_EMAIL_CONSENT_VERSION);
      let row = (await pool.query("SELECT * FROM playne_email_contacts"))
        .rows[0];
      expect(row).toMatchObject({
        purpose: "rank",
        reminders_enabled: false,
        enabled: true,
      });
      await oauth();
      expect((await contact(row.user_id)).purpose).toBe("rank");
      await oauth(EMAIL_CONSENT_VERSION);
      expect(await contact(row.user_id)).toMatchObject({
        purpose: "general",
        reminders_enabled: true,
        enabled: true,
      });
    });
    it("queues one due reminder across concurrent workers and skips unselected days and quiet hours", async () => {
      const p = await subscribe();
      for (const time of [
        now - 60000,
        Date.parse("2026-11-03T16:00:00Z"),
        Date.parse("2026-11-02T18:00:00Z"),
      ])
        await prepareReminderEmails(pool, config, time);
      expect(
        (await pool.query("SELECT * FROM playne_email_outbox")).rowCount,
      ).toBe(0);
      await Promise.all([
        prepareReminderEmails(pool, config, now),
        prepareReminderEmails(pool, config, now),
      ]);
      const rows = (await pool.query("SELECT * FROM playne_email_outbox")).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_id: p.id,
        kind: "reminder",
        status: "pending",
      });
      expect(JSON.stringify(rows[0].payload)).not.toContain("score");
    });
    it("skips a completed zero-score private game both before preparation and before delivery", async () => {
      const p = await subscribe();
      await played(p.id);
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT * FROM playne_email_outbox")).rowCount,
      ).toBe(0);
      await pool.query("DELETE FROM playne_games WHERE owner_id=$1", [p.id]);
      await prepareReminderEmails(pool, config, now);
      await played(p.id);
      const send = remote();
      await deliverEmails(pool, config, send as typeof fetch, now);
      expect(send).not.toHaveBeenCalled();
      expect(
        (await pool.query("SELECT status FROM playne_email_outbox")).rows[0]
          .status,
      ).toBe("cancelled");
    });
    it("shares rank and reminder budgets at preparation and delivery", async () => {
      const p = await subscribe();
      await rankEvent(p.id);
      await prepareRankEmails(pool, config, now);
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT kind FROM playne_email_outbox")).rows.map(
          (r) => r.kind,
        ),
      ).toEqual(["rank"]);
      const c = await contact(p.id);
      await pool.query(
        "INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,reminder_day,payload,available_at) VALUES($1,$2,'reminder','A','playne-reminders-v1',$3,$4,$5)",
        [
          p.id,
          c.generation,
          "2026-11-02",
          JSON.stringify({ email: p.email, day: "2026-11-02" }),
          new Date(now),
        ],
      );
      const send = remote();
      await deliverEmails(pool, config, send as typeof fetch, now);
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        (
          await pool.query(
            "SELECT status FROM playne_email_outbox ORDER BY kind",
          )
        ).rows
          .map((r) => r.status)
          .sort(),
      ).toEqual(["accepted", "pending"]);
      await prepareReminderEmails(pool, config, now + 60000);
      expect(
        (await pool.query("SELECT count(*)::int n FROM playne_email_outbox"))
          .rows[0].n,
      ).toBe(2);
    });
    it("enforces three combined marketing messages in a rolling seven-day window", async () => {
      const p = await subscribe(),
        c = await contact(p.id);
      for (let i = 0; i < 3; i++)
        await pool.query(
          "INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,payload,status,submitted_at) VALUES($1,$2,$3,'A','mail-budget-test',$4,'accepted',$5)",
          [
            p.id,
            c.generation,
            i % 2 ? "rank" : "reminder",
            JSON.stringify({ email: p.email }),
            new Date(now - (2 + i) * 86400000),
          ],
        );
      await rankEvent(p.id);
      await prepareRankEmails(pool, config, now);
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT count(*)::int n FROM playne_email_outbox"))
          .rows[0].n,
      ).toBe(3);
    });
    it("retries an explicit provider429 with the same idempotency key", async () => {
      await subscribe();
      await prepareReminderEmails(pool, config, now);
      const bodies: any[] = [];
      let limited = true;
      const send = vi.fn(async (_url: any, options: any) => {
        bodies.push(JSON.parse(options.body));
        return new Response(
          JSON.stringify(
            limited
              ? { status: "error", code: 429 }
              : { status: "success", job_id: "retry" },
          ),
          { status: limited ? 429 : 200 },
        );
      });
      await deliverEmails(pool, config, send as typeof fetch, now);
      expect(
        (
          await pool.query(
            "SELECT status,submitted_at FROM playne_email_outbox",
          )
        ).rows[0],
      ).toMatchObject({ status: "pending", submitted_at: null });
      limited = false;
      await deliverEmails(pool, config, send as typeof fetch, now + 16 * 60000);
      expect(bodies[0].message.idempotence_key).toBe(
        bodies[1].message.idempotence_key,
      );
      expect(
        (await pool.query("SELECT status FROM playne_email_outbox")).rows[0]
          .status,
      ).toBe("accepted");
      expect(bodies[1].message.headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
    });
    it("honors suppression and one-click unsubscribe for every pending marketing kind", async () => {
      const p = await subscribe();
      await pool.query(
        "INSERT INTO playne_email_suppressions(address_hash,reason) VALUES($1,'hard_bounced')",
        [hashAddress(config, p.email)],
      );
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT * FROM playne_email_outbox")).rowCount,
      ).toBe(0);
      await pool.query("DELETE FROM playne_email_suppressions");
      await prepareReminderEmails(pool, config, now);
      const savedContact = await contact(p.id);
      await pool.query(
        "INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,payload) VALUES($1,$2,'rank','A','rank-email-design-v1',$3)",
        [p.id, savedContact.generation, JSON.stringify({ email: p.email })],
      );
      const c = await contact(p.id),
        token = signEmailToken(config, "unsubscribe", { g: c.generation });
      const unsub = await app.inject({
        method: "POST",
        url: "/api/email/unsubscribe/" + token,
        payload: { "List-Unsubscribe": "One-Click" },
      });
      expect(unsub.statusCode, unsub.body).toBe(200);
      expect((await contact(p.id)).enabled).toBe(false);
      const send = remote();
      await deliverEmails(pool, config, send as typeof fetch, now);
      expect(send).not.toHaveBeenCalled();
      const cancelled = (
        await pool.query("SELECT status FROM playne_email_outbox")
      ).rows;
      expect(cancelled).toHaveLength(2);
      expect(cancelled.every((row) => row.status === "cancelled")).toBe(true);
    });
    it("never retries a reminder with an ambiguous network outcome", async () => {
      await subscribe();
      await prepareReminderEmails(pool, config, now);
      const send = vi.fn(async () => {
        throw Error("ambiguous network timeout");
      });
      await deliverEmails(pool, config, send as typeof fetch, now);
      expect(
        (await pool.query("SELECT status FROM playne_email_outbox")).rows[0]
          .status,
      ).toBe("uncertain");
      await prepareReminderEmails(pool, config, now + 20 * 60000);
      await deliverEmails(pool, config, send as typeof fetch, now + 20 * 60000);
      expect(send).toHaveBeenCalledTimes(1);
    });
    it("keeps old manual confirmation tokens rank-only and audits their original consent version", async () => {
      const p = await person();
      await tx((c) =>
        requestEmailSubscription(
          c,
          config,
          p.id,
          p.email,
          "test",
          now,
          LEGACY_EMAIL_CONSENT_VERSION,
        ),
      );
      const saved = await contact(p.id);
      await tx((c) =>
        confirmEmailSubscription(
          c,
          config,
          signEmailToken(config, "confirm", {
            g: saved.generation,
            exp: now + 86400000,
          }),
          now,
        ),
      );
      expect(await contact(p.id)).toMatchObject({
        purpose: "rank",
        reminders_enabled: false,
        consent_version: LEGACY_EMAIL_CONSENT_VERSION,
        enabled: true,
      });
      const audit = (
        await pool.query(
          "SELECT version FROM playne_email_consents WHERE user_id=$1 AND action='confirmed'",
          [p.id],
        )
      ).rows;
      expect(audit.map((row) => row.version)).toEqual([
        LEGACY_EMAIL_CONSENT_VERSION,
      ]);
    });
    it("migrates pre-existing enabled rank contacts conservatively and idempotently", async () => {
      const p = await person();
      await pool.query(
        "INSERT INTO playne_email_contacts(user_id,email,verified_at,enabled,consent_at,consent_version,variant) VALUES($1,$2,now(),true,now(),$3,'A')",
        [p.id, p.email, LEGACY_EMAIL_CONSENT_VERSION],
      );
      await pool.query(readFileSync("server/reminders-schema.sql", "utf8"));
      await pool.query(readFileSync("server/reminders-schema.sql", "utf8"));
      expect(await contact(p.id)).toMatchObject({
        purpose: "rank",
        reminders_enabled: false,
        enabled: true,
      });
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT * FROM playne_email_outbox")).rowCount,
      ).toBe(0);
    });
    it("validates native schedule settings and pauses reminders without cancelling rank consent", async () => {
      const p = await subscribe();
      for (const body of [
        { enabled: true, days: [1, 1], time: "19:00" },
        { enabled: true, days: [1], time: "21:00" },
      ])
        expect(
          (await post(p.cookie, "/api/email/reminders", body)).statusCode,
        ).toBe(400);
      const saved = await post(p.cookie, "/api/email/reminders", {
        enabled: false,
        days: [2, 4],
        time: "10:30",
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toMatchObject({
        enabled: true,
        purpose: "general",
        reminders: { enabled: false, days: [2, 4], time: "10:30" },
      });
      await prepareReminderEmails(pool, config, now);
      expect(
        (await pool.query("SELECT * FROM playne_email_outbox")).rowCount,
      ).toBe(0);
    });
  },
);
