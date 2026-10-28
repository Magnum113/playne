import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { buildApp } from "../server/app";
import { scoreVersion } from "../server/scoring";
import {
  requestEmailSubscription,
  confirmEmailSubscription,
  signEmailToken,
  readEmailToken,
  normalizeEmail,
  emailSendingHour,
  notificationSnapshot,
  queueDisplacements,
  prepareRankEmails,
  deliverEmails,
  stopEmails,
  emailExperimentReport,
  type EmailConfig,
} from "../server/email-core";
import {
  EMAIL_CONSENT_VERSION,
  renderRankEmail,
  renderVerificationEmail,
} from "../server/email-templates";
const db = process.env.TEST_DATABASE_URL;
const config: EmailConfig = {
  origin: "https://test.playne.invalid",
  secret: "test-email-secret-with-at-least-32-characters",
  apiKey: "test-project-key",
  projectId: "123",
  from: "hello@playne.ru",
  replyTo: "test@example.com",
  enabled: true,
  yandexEmail: true,
};
const noon = () => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
};
describe("Email capabilities and templates", () => {
  it("normalizes addresses and rejects malformed input", () => {
    expect(normalizeEmail(" A+B@Example.COM ")).toBe("a+b@example.com");
    for (const s of ["a@", "a..b@example.com", "x\n@y.ru", "<script>@x.ru"])
      expect(() => normalizeEmail(s)).toThrow();
  });
  it("checks signature, purpose, expiry and secret", () => {
    const t = signEmailToken(config, "confirm", { g: randomUUID(), exp: 2000 });
    expect(readEmailToken(config, t, "confirm", 1000)).toBeTruthy();
    expect(readEmailToken(config, t, "confirm", 2000)).toBeNull();
    expect(readEmailToken(config, t, "click", 1000)).toBeNull();
    expect(readEmailToken(config, t + "x", "confirm", 1000)).toBeNull();
    expect(
      readEmailToken(
        { ...config, secret: "other-secret-with-at-least-32-characters" },
        t,
        "confirm",
        1000,
      ),
    ).toBeNull();
  });
  it("uses Moscow quiet hours independently of host timezone", () => {
    expect(emailSendingHour(Date.UTC(2026, 9, 28, 6, 59))).toBe(false);
    expect(emailSendingHour(Date.UTC(2026, 9, 28, 7))).toBe(true);
    expect(emailSendingHour(Date.UTC(2026, 9, 28, 18))).toBe(false);
  });
  it("keeps experimental copy identical and renders every mode safely", () => {
    const data = {
      origin: config.origin,
      items: [
        {
          id: "test",
          game: "geo" as const,
          mode: "landmarks",
          oldPlace: 3,
          newPlace: 5,
          scoreUnits: 400,
          opponentUnits: 420,
        },
      ],
      playUrl: 'https://playne.ru/?x="bad',
      rankUrl: "https://playne.ru/leaderboard/",
      unsubscribeUrl: "https://playne.ru/account/",
    };
    const all = (["A", "B", "C"] as const).map((variant) =>
      renderRankEmail({ ...data, variant }),
    );
    expect(new Set(all.map((x) => x.subject)).size).toBe(1);
    expect(new Set(all.map((x) => x.plaintext)).size).toBe(1);
    expect(new Set(all.map((x) => x.html)).size).toBe(3);
    for (const mail of all) {
      expect(mail.html).not.toContain("<script");
      expect(mail.html).toContain("&quot;");
      expect(mail.html).toContain("Отписаться");
    }
    expect(
      renderVerificationEmail(config.origin, "https://playne.ru/test").html,
    ).toContain("Подтвердить");
  });
});
(db ? describe : describe.skip)("Email PostgreSQL integration", () => {
  let pool: Pool, admin: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const tx = async <T>(fn: (c: any) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const v = await fn(c);
      await c.query("COMMIT");
      return v;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  const user = async (name = "Игрок") =>
    (
      await pool.query(
        "INSERT INTO playne_users(nickname) VALUES($1) RETURNING id",
        [name],
      )
    ).rows[0].id as string;
  const game = async (owner: string, score: number, mode = "classic") =>
    (
      await pool.query(
        `INSERT INTO playne_games(browser_hash,owner_id,game,version,mode,challenge,score_units,completed_at,published_at) VALUES('test-browser',$1,'colorfle',$2,$3,'{}',$4,now(),now()) RETURNING id`,
        [owner, scoreVersion("colorfle"), mode, score],
      )
    ).rows[0].id as string;
  const subscribe = async (id: string, address = "owner@example.com") => {
    await tx((c) => requestEmailSubscription(c, config, id, address, "test"));
    const contact = (
      await pool.query("SELECT * FROM playne_email_contacts WHERE user_id=$1", [
        id,
      ])
    ).rows[0];
    await tx((c) =>
      confirmEmailSubscription(
        c,
        config,
        signEmailToken(config, "confirm", {
          g: contact.generation,
          exp: Date.now() + 3600000,
        }),
      ),
    );
    await pool.query(
      "UPDATE playne_email_outbox SET status='cancelled' WHERE kind='verify'",
    );
    return contact;
  };
  const displaced = async () => {
    const owner = await user(),
      rival = await user("Соперник");
    await game(owner, 350);
    await subscribe(owner);
    const before = await notificationSnapshot(pool, "colorfle", "classic");
    const cause = await game(rival, 400);
    await queueDisplacements(pool, before, rival, cause, "colorfle", "classic");
    await pool.query(
      "UPDATE playne_email_events SET created_at=$1::timestamptz-interval '31 minutes'",
      [new Date(noon())],
    );
    return { owner, rival, cause };
  };
  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test")
      throw Error("Isolated database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA IF NOT EXISTS playne_email_test");
    pool = new Pool({
      connectionString: db,
      options: "-c search_path=playne_email_test",
      max: 8,
    });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(
      pool,
      {
        origin: config.origin,
        yandexId: "test",
        yandexSecret: "test",
        redirect: config.origin + "/api/auth/yandex/callback",
        secure: true,
        revision: "test",
        email: config,
      },
      (async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).includes("/token")
              ? { access_token: "test" }
              : {
                  id: "email-test",
                  client_id: "test",
                  first_name: "Тест",
                  default_email: "oauth@example.com",
                },
          ),
        )) as typeof fetch,
    );
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE playne_users,playne_email_suppressions,playne_email_callbacks CASCADE",
    );
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query("DROP SCHEMA playne_email_test CASCADE");
    await admin?.end();
  });
  it("requires explicit email and data consent, rejects CSRF and uses optional email scope", async () => {
    const no = await app.inject({
      method: "POST",
      url: "/api/auth/yandex/start",
      headers: { origin: config.origin },
      payload: { emailOptIn: true, consentVersion: EMAIL_CONSENT_VERSION },
    });
    expect(no.statusCode).toBe(400);
    const csrf = await app.inject({
      method: "POST",
      url: "/api/auth/yandex/start",
      headers: { origin: "https://evil.example" },
      payload: {
        emailOptIn: true,
        consentVersion: EMAIL_CONSENT_VERSION,
        dataConsent: true,
      },
    });
    expect(csrf.statusCode).toBe(403);
    const yes = await app.inject({
      method: "POST",
      url: "/api/auth/yandex/start",
      headers: { origin: config.origin },
      payload: {
        emailOptIn: true,
        consentVersion: EMAIL_CONSENT_VERSION,
        dataConsent: true,
      },
    });
    expect(yes.statusCode).toBe(200);
    expect(new URL(yes.json().url).searchParams.get("optional_scope")).toBe(
      "login:email",
    );
    const normal = await app.inject("/api/auth/yandex/start");
    expect(
      new URL(normal.headers.location!).searchParams.has("optional_scope"),
    ).toBe(false);
  });
  it("confirms idempotently; old token cannot reenable after unsubscribe", async () => {
    const id = await user();
    const c = await subscribe(id);
    const token = signEmailToken(config, "confirm", {
      g: c.generation,
      exp: Date.now() + 3600000,
    });
    await tx((c) => confirmEmailSubscription(c, config, token));
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM playne_email_consents WHERE action='confirmed'",
        )
      ).rows[0].n,
    ).toBe(1);
    await tx((c) => stopEmails(c, config, id));
    await expect(
      tx((c) => confirmEmailSubscription(c, config, token)),
    ).rejects.toThrow();
  });
  it("only notifies previously subscribed top10; ties and self improvements do not notify", async () => {
    const owner = await user(),
      rival = await user();
    await subscribe(owner);
    await game(owner, 350);
    const before = await notificationSnapshot(pool, "colorfle", "classic");
    let cause = await game(rival, 350);
    await queueDisplacements(pool, before, rival, cause, "colorfle", "classic");
    expect(
      (await pool.query("SELECT * FROM playne_email_events")).rowCount,
    ).toBe(0);
    cause = await game(owner, 400);
    await queueDisplacements(pool, before, owner, cause, "colorfle", "classic");
    expect(
      (await pool.query("SELECT * FROM playne_email_events")).rowCount,
    ).toBe(0);
  });
  it("deduplicates displacement; debounces, rechecks and sends once under concurrent workers", async () => {
    const { owner, rival, cause } = await displaced();
    await queueDisplacements(
      pool,
      [{ id: owner, place: 1, score_units: 350 }],
      rival,
      cause,
      "colorfle",
      "classic",
    );
    expect(
      (await pool.query("SELECT * FROM playne_email_events")).rowCount,
    ).toBe(1);
    await prepareRankEmails(pool, config, noon());
    expect(
      (await pool.query("SELECT * FROM playne_email_outbox WHERE kind='rank'"))
        .rowCount,
    ).toBe(1);
    let calls = 0;
    const remote = (async (_: any, options: any) => {
      calls++;
      const m = JSON.parse(options.body).message;
      expect(m.idempotence_key).toBeTruthy();
      expect(m.recipients[0].email).toBe("owner@example.com");
      return new Response(
        JSON.stringify({ status: "success", job_id: "test-job" }),
      );
    }) as typeof fetch;
    await Promise.all([
      deliverEmails(pool, config, remote, noon() + 1000),
      deliverEmails(pool, config, remote, noon() + 1000),
    ]);
    expect(calls).toBe(1);
    await deliverEmails(pool, config, remote, noon() + 2000);
    expect(calls).toBe(1);
  });
  it("cancels email if position restored before sending", async () => {
    const { owner } = await displaced();
    await prepareRankEmails(pool, config, noon());
    await game(owner, 450);
    let calls = 0;
    await deliverEmails(
      pool,
      config,
      (async () => {
        calls++;
        return new Response();
      }) as typeof fetch,
      noon() + 1000,
    );
    expect(calls).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT status FROM playne_email_outbox WHERE kind='rank'",
        )
      ).rows[0].status,
    ).toBe("cancelled");
  });
  it("enforces one per day across game modes", async () => {
    const { owner } = await displaced();
    const c = (
      await pool.query("SELECT * FROM playne_email_contacts WHERE user_id=$1", [
        owner,
      ])
    ).rows[0];
    await pool.query(
      `INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,payload,status,submitted_at) VALUES($1,$2,'rank','A','rank-email-design-v1','{}','accepted',$3)`,
      [owner, c.generation, new Date(noon() - 3600000)],
    );
    await prepareRankEmails(pool, config, noon());
    expect(
      (
        await pool.query(
          "SELECT * FROM playne_email_outbox WHERE kind='rank' AND status='pending'",
        )
      ).rowCount,
    ).toBe(0);
  });
  it("does not retry ambiguous provider result", async () => {
    await displaced();
    await prepareRankEmails(pool, config, noon());
    let calls = 0;
    const remote = (async () => {
      calls++;
      throw Error("timeout");
    }) as typeof fetch;
    await deliverEmails(pool, config, remote, noon() + 1000);
    await deliverEmails(pool, config, remote, noon() + 2000);
    expect(calls).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT status FROM playne_email_outbox WHERE kind='rank'",
        )
      ).rows[0].status,
    ).toBe("uncertain");
  });
  it("GET unsubscribe does not unsubscribe; one-click POST does", async () => {
    const id = await user();
    const c = await subscribe(id);
    const token = signEmailToken(config, "unsubscribe", { g: c.generation });
    expect(
      (await app.inject("/api/email/unsubscribe/" + token)).statusCode,
    ).toBe(302);
    expect(
      (await pool.query("SELECT enabled FROM playne_email_contacts")).rows[0]
        .enabled,
    ).toBe(true);
    const result = await app.inject({
      method: "POST",
      url: "/api/email/unsubscribe/" + token,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(result.statusCode).toBe(200);
    expect(
      (await pool.query("SELECT enabled FROM playne_email_contacts")).rows[0]
        .enabled,
    ).toBe(false);
  });
  it("rejects forged callbacks and deduplicates signed callbacks", async () => {
    const { owner } = await displaced();
    await prepareRankEmails(pool, config, noon());
    await deliverEmails(
      pool,
      config,
      (async () =>
        new Response(
          JSON.stringify({ status: "success", job_id: "job-webhook" }),
        )) as typeof fetch,
      noon() + 1000,
    );
    const row = (
      await pool.query("SELECT * FROM playne_email_outbox WHERE kind='rank'")
    ).rows[0];
    const body = {
      auth: config.apiKey,
      events_by_user: [
        {
          project_id: config.projectId,
          events: [
            {
              event_name: "transactional_email_status",
              event_data: {
                metadata: { outbox_id: row.id },
                job_id: "job-webhook",
                email: "owner@example.com",
                status: "delivered",
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(body);
    const signed = raw.replace(
      '"auth":"' + config.apiKey + '"',
      '"auth":"' + createHash("md5").update(raw).digest("hex") + '"',
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/email/provider",
          headers: { "content-type": "application/json" },
          payload: JSON.stringify({ ...body, auth: "0".repeat(32) }),
        })
      ).statusCode,
    ).toBe(403);
    for (let n = 0; n < 2; n++)
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/email/provider",
            headers: { "content-type": "application/json" },
            payload: signed,
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT delivered_at FROM playne_email_outbox WHERE id=$1",
          [row.id],
        )
      ).rows[0].delivered_at,
    ).toBeTruthy();
    expect(
      (await pool.query("SELECT * FROM playne_email_callbacks")).rowCount,
    ).toBe(1);
  });
  it("separates scanner GET from interaction and has no arbitrary redirects", async () => {
    await displaced();
    await prepareRankEmails(pool, config, noon());
    await deliverEmails(
      pool,
      config,
      (async () =>
        new Response(
          JSON.stringify({ status: "success", job_id: "job-click" }),
        )) as typeof fetch,
      noon() + 1000,
    );
    const row = (
      await pool.query("SELECT * FROM playne_email_outbox WHERE kind='rank'")
    ).rows[0];
    const token = signEmailToken(config, "click", {
      o: row.id,
      exp: Date.now() + 3600000,
    });
    const result = await app.inject(
      "/api/email/click/" + token + "?target=play",
    );
    expect(result.statusCode).toBe(302);
    expect(result.headers.location).toContain("/colorfle/");
    expect(result.headers.location).toContain("utm_content=" + row.variant);
    expect(
      (
        await pool.query(
          "SELECT visited_at FROM playne_email_outbox WHERE id=$1",
          [row.id],
        )
      ).rows[0].visited_at,
    ).toBeNull();
    const cookie = result.cookies.map((c) => c.name + "=" + c.value).join("; ");
    await app.inject({
      method: "POST",
      url: "/api/email/visit",
      headers: { origin: config.origin, cookie },
      payload: { interacted: true },
    });
    expect(
      (
        await pool.query(
          "SELECT visited_at FROM playne_email_outbox WHERE id=$1",
          [row.id],
        )
      ).rows[0].visited_at,
    ).toBeTruthy();
    expect(
      (
        await app.inject(
          "/api/email/click/" + token + "?target=https://evil.example",
        )
      ).statusCode,
    ).toBe(410);
  });
  it("keeps experiment assignment on address change and reports aggregate data", async () => {
    const id = await user();
    const c = await subscribe(id);
    await tx((c) =>
      requestEmailSubscription(c, config, id, "other@example.com", "test"),
    );
    expect(
      (await pool.query("SELECT variant FROM playne_email_contacts")).rows[0]
        .variant,
    ).toBe(c.variant);
    const report = await emailExperimentReport(pool);
    expect(report.variants).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain("@");
  });
  it("verifies subscriptions at night even with rank mail waiting", async () => {
    await displaced();
    await prepareRankEmails(pool, config, noon());
    const id = await user();
    await tx((c) =>
      requestEmailSubscription(
        c,
        config,
        id,
        "night@example.com",
        "test",
        noon(),
      ),
    );
    let calls = 0;
    const remote = (async (_: any, options: any) => {
      calls++;
      const m = JSON.parse(options.body).message;
      expect(m.subject).toContain("Подтверди");
      expect(m.body.html).toContain("Подтвердить подписку");
      return new Response(
        JSON.stringify({ status: "success", job_id: "verify-night" }),
      );
    }) as typeof fetch;
    const night = noon() + 10 * 3600000;
    await deliverEmails(pool, config, remote, night);
    expect(calls).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT status FROM playne_email_outbox WHERE kind='rank'",
        )
      ).rows[0].status,
    ).toBe("pending");
  });
  it("requires provider reconfirmation after provider unsubscribe", async () => {
    const id = await user();
    await subscribe(id);
    await tx((c) => stopEmails(c, config, id));
    await pool.query(
      "UPDATE playne_email_contacts SET provider_unsubscribed=true WHERE user_id=$1",
      [id],
    );
    await tx((c) =>
      requestEmailSubscription(c, config, id, "owner@example.com", "test"),
    );
    let called = "";
    await deliverEmails(
      pool,
      config,
      (async (url: any, options: any) => {
        called = String(url);
        expect(JSON.parse(options.body).to_email).toBe("owner@example.com");
        return new Response(JSON.stringify({ status: "success" }));
      }) as typeof fetch,
      noon(),
    );
    expect(called).toContain("email/subscribe.json");
    expect(
      (await pool.query("SELECT enabled FROM playne_email_contacts")).rows[0]
        .enabled,
    ).toBe(false);
    const body = {
      auth: config.apiKey,
      events_by_user: [
        {
          project_id: config.projectId,
          events: [
            {
              event_name: "transactional_email_status",
              event_data: { email: "owner@example.com", status: "subscribed" },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(body);
    const signed = raw.replace(
      '"auth":"' + config.apiKey + '"',
      '"auth":"' + createHash("md5").update(raw).digest("hex") + '"',
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/email/provider",
          headers: { "content-type": "application/json" },
          payload: signed,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT enabled,provider_unsubscribed FROM playne_email_contacts",
        )
      ).rows[0],
    ).toMatchObject({ enabled: true, provider_unsubscribed: false });
  });
  it("enforces three rank emails per rolling week", async () => {
    const { owner } = await displaced();
    const c = (
      await pool.query("SELECT * FROM playne_email_contacts WHERE user_id=$1", [
        owner,
      ])
    ).rows[0];
    for (const days of [2, 3, 4])
      await pool.query(
        `INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,payload,status,submitted_at) VALUES($1,$2,'rank','A','rank-email-design-v1','{}','accepted',$3)`,
        [owner, c.generation, new Date(noon() - days * 86400000)],
      );
    await prepareRankEmails(pool, config, noon());
    expect(
      (
        await pool.query(
          "SELECT * FROM playne_email_outbox WHERE kind='rank' AND status='pending'",
        )
      ).rowCount,
    ).toBe(0);
  });
  it("saves Yandex email only on the opted-in flow and does not activate until confirmation", async () => {
    async function login(optIn: boolean) {
      const start = await app.inject(
        optIn
          ? {
              method: "POST",
              url: "/api/auth/yandex/start",
              headers: { origin: config.origin },
              payload: {
                emailOptIn: true,
                consentVersion: EMAIL_CONSENT_VERSION,
                dataConsent: true,
                return: "/account/",
              },
            }
          : { method: "GET", url: "/api/auth/yandex/start" },
      );
      const url = new URL(optIn ? start.json().url : start.headers.location!);
      const cookie = start.cookies
        .map((c) => c.name + "=" + c.value)
        .join("; ");
      return app.inject({
        url:
          "/api/auth/yandex/callback?state=" +
          url.searchParams.get("state") +
          "&code=test",
        headers: { cookie },
      });
    }
    expect((await login(false)).headers.location).toContain("auth=success");
    expect(
      (await pool.query("SELECT * FROM playne_email_contacts")).rowCount,
    ).toBe(0);
    expect((await login(true)).headers.location).toContain("auth=success");
    expect(
      (await pool.query("SELECT email,enabled FROM playne_email_contacts"))
        .rows[0],
    ).toMatchObject({ email: "oauth@example.com", enabled: false });
  });

  it("confirms without a login session and keeps GET non-mutating", async () => {
    const id = await user();
    await tx((c) =>
      requestEmailSubscription(c, config, id, "confirm@example.com", "test"),
    );
    const contact = (
      await pool.query("SELECT * FROM playne_email_contacts WHERE user_id=$1", [
        id,
      ])
    ).rows[0];
    const token = signEmailToken(config, "confirm", {
      g: contact.generation,
      exp: Date.now() + 3600000,
    });
    expect(
      (await pool.query("SELECT enabled FROM playne_email_contacts")).rows[0]
        .enabled,
    ).toBe(false);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/email/confirm",
          headers: { origin: config.origin },
          payload: { token },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await pool.query("SELECT enabled FROM playne_email_contacts")).rows[0]
        .enabled,
    ).toBe(true);
  });
  it("reports people instead of repeated messages and excludes scanners and immature cohorts", async () => {
    const a1 = await user(),
      a2 = await user(),
      b = await user(),
      c = await user();
    async function sent(
      id: string,
      variant: string,
      days: number,
      visited = false,
      raw = false,
    ) {
      await pool.query(
        `INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,payload,status,submitted_at,delivered_at,visited_at,raw_click_at,game_completed_at) VALUES($1,$2,'rank',$3,'rank-email-design-v1','{}','accepted',now()-($4::int*interval '1 day'),now()-($4::int*interval '1 day'),CASE WHEN $5 THEN now()-interval '1 day' END,CASE WHEN $6 THEN now()-interval '1 day' END,CASE WHEN $5 THEN now()-interval '1 day' END)`,
        [id, randomUUID(), variant, days, visited, raw],
      );
    }
    await sent(a1, "A", 8, true);
    await sent(a1, "A", 9, true);
    await sent(a2, "A", 8);
    await sent(b, "B", 8, false, true);
    await sent(c, "C", 6, true);
    await sent(c, "C", 100, true);
    const r = await emailExperimentReport(pool);
    const a = r.variants.find((v) => v.variant === "A")!,
      bv = r.variants.find((v) => v.variant === "B")!,
      cv = r.variants.find((v) => v.variant === "C")!;
    expect(a.messages).toBe(3);
    expect(a.delivered_users).toBe(2);
    expect(a.visited_users).toBe(1);
    expect(a.visitRate).toBe(0.5);
    expect(a.visitRate95![0]).toBeLessThan(0.5);
    expect(a.visitRate95![1]).toBeGreaterThan(0.5);
    expect(bv.visited_users).toBe(0);
    expect(cv.delivered_users).toBe(0);
  });
  it("restricts the report to the configured owner", async () => {
    const id = await user(),
      token = "r".repeat(43);
    await pool.query(
      "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(token).digest("hex"), id],
    );
    const headers = { cookie: "playne_session=" + token };
    expect(
      (await app.inject({ url: "/api/email/report", headers })).statusCode,
    ).toBe(403);
    const ownerApp = await buildApp(pool, {
      origin: config.origin,
      yandexId: "test",
      yandexSecret: "test",
      redirect: config.origin + "/api/auth/yandex/callback",
      secure: true,
      revision: "test",
      email: { ...config, adminId: id },
    });
    try {
      const r = await ownerApp.inject({ url: "/api/email/report", headers });
      expect(r.statusCode).toBe(200);
      expect(r.json().variants).toHaveLength(3);
      expect((await ownerApp.inject("/api/email/report")).statusCode).toBe(401);
    } finally {
      await ownerApp.close();
    }
  });
  it("queues only the affected leaderboard across every game and geography mode", async () => {
    for (const [g, mode, units] of [
      ["naglaz", "classic", 4500],
      ["circle", "classic", 990],
      ["pressure", "classic", 150],
      ["geo", "landmarks", 4000],
      ["geo", "moving", 4200],
      ["colorfle", "timed", 3500],
    ] as const) {
      const owner = await user(),
        rival = await user();
      await subscribe(owner, owner + "@example.com");
      async function score(id: string, value: number) {
        return (
          await pool.query(
            `INSERT INTO playne_games(browser_hash,owner_id,game,version,mode,challenge,score_units,completed_at,published_at) VALUES('test',$1,$2,$3,$4,'{}',$5,now(),now()) RETURNING id`,
            [id, g, scoreVersion(g), mode, value],
          )
        ).rows[0].id;
      }
      await score(owner, units);
      const before = await notificationSnapshot(pool, g, mode);
      const cause = await score(rival, units + 10);
      await queueDisplacements(pool, before, rival, cause, g, mode);
      const events = (
        await pool.query(
          "SELECT game,mode,old_place,new_place FROM playne_email_events WHERE user_id=$1",
          [owner],
        )
      ).rows;
      expect(events).toEqual([{ game: g, mode, old_place: 1, new_place: 2 }]);
    }
  });
  it("stops email attribution immediately after consent withdrawal", async () => {
    const { owner } = await displaced();
    await prepareRankEmails(pool, config, noon());
    await deliverEmails(
      pool,
      config,
      (async () =>
        new Response(
          JSON.stringify({ status: "success", job_id: "withdrawal" }),
        )) as typeof fetch,
      noon() + 1000,
    );
    const row = (
      await pool.query("SELECT * FROM playne_email_outbox WHERE kind='rank'")
    ).rows[0];
    const token = signEmailToken(config, "click", {
      o: row.id,
      exp: Date.now() + 3600000,
    });
    const link = await app.inject("/api/email/click/" + token + "?target=play");
    const cookie = link.cookies.map((c) => c.name + "=" + c.value).join("; ");
    await tx((c) => stopEmails(c, config, owner));
    await app.inject({
      method: "POST",
      url: "/api/email/visit",
      headers: { origin: config.origin, cookie },
      payload: { interacted: true },
    });
    expect(
      (
        await pool.query(
          "SELECT visited_at FROM playne_email_outbox WHERE id=$1",
          [row.id],
        )
      ).rows[0].visited_at,
    ).toBeNull();
    expect(
      (
        await app.inject("/api/email/click/" + token + "?target=play")
      ).cookies.some((c) => c.name === "playne_email_visit" && c.value),
    ).toBe(false);
  });
  it("honors provider unsubscribe from an older email after reconfirming the same address", async () => {
    const { owner } = await displaced();
    await prepareRankEmails(pool, config, noon());
    await deliverEmails(
      pool,
      config,
      (async () =>
        new Response(
          JSON.stringify({ status: "success", job_id: "older-message" }),
        )) as typeof fetch,
      noon() + 1000,
    );
    const row = (
      await pool.query("SELECT * FROM playne_email_outbox WHERE kind='rank'")
    ).rows[0];
    await tx((c) => stopEmails(c, config, owner));
    await tx((c) =>
      requestEmailSubscription(c, config, owner, "owner@example.com", "test"),
    );
    const contact = (
      await pool.query("SELECT * FROM playne_email_contacts WHERE user_id=$1", [
        owner,
      ])
    ).rows[0];
    await tx((c) =>
      confirmEmailSubscription(
        c,
        config,
        signEmailToken(config, "confirm", {
          g: contact.generation,
          exp: Date.now() + 3600000,
        }),
      ),
    );
    const body = {
      auth: config.apiKey,
      events_by_user: [
        {
          project_id: config.projectId,
          events: [
            {
              event_name: "transactional_email_status",
              event_data: {
                metadata: { outbox_id: row.id },
                job_id: "older-message",
                email: "owner@example.com",
                status: "unsubscribed",
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(body);
    const signed = raw.replace(
      '"auth":"' + config.apiKey + '"',
      '"auth":"' + createHash("md5").update(raw).digest("hex") + '"',
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/email/provider",
          headers: { "content-type": "application/json" },
          payload: signed,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT enabled FROM playne_email_contacts WHERE user_id=$1",
          [owner],
        )
      ).rows[0].enabled,
    ).toBe(false);
  });
});
