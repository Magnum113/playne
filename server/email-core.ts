import {
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { domainToASCII } from "node:url";
import type { Pool, PoolClient } from "pg";
import { LEADERBOARD_SQL } from "./leaderboard";
import { scoreVersion, type GameId } from "./scoring";
import {
  EMAIL_CONSENT_VERSION,
  EMAIL_EXPERIMENT,
  renderRankEmail,
  renderVerificationEmail,
  type RankEmailItem,
  type EmailVariant,
} from "./email-templates";

export type EmailConfig = {
  origin: string;
  secret: string;
  apiKey?: string;
  projectId?: string;
  from?: string;
  replyTo?: string;
  enabled?: boolean;
  yandexEmail?: boolean;
  adminId?: string;
  deliveryReady?: boolean;
};
type DB = Pick<PoolClient, "query">;
export const EMAIL_PUBLICATION_LOCK = "playne-email-publication-v1";
export const emailError = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string" || value.length > 254)
    throw emailError("Проверь адрес почты.");
  const text = value.trim().toLowerCase(),
    at = text.lastIndexOf("@");
  const local = text.slice(0, at),
    domain = domainToASCII(text.slice(at + 1));
  if (
    at < 1 ||
    local.length > 64 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  )
    throw emailError("Проверь адрес почты.");
  return `${local}@${domain}`;
}
const emailCredentialsConfigured = (config: EmailConfig) =>
  !!(
    config.enabled &&
    config.secret.length >= 32 &&
    config.apiKey &&
    config.projectId &&
    config.from &&
    config.replyTo
  );
export const mailConfigured = (config: EmailConfig) =>
  emailCredentialsConfigured(config) && config.deliveryReady !== false;
// Domain readiness is operational state, separate from each person's consent.
// Pending DNS never sends unsigned mail or requires a later manual deployment.
export async function refreshEmailReadiness(
  config: EmailConfig,
  remoteFetch: typeof fetch = fetch,
  shutdownSignal?: AbortSignal,
) {
  if (!emailCredentialsConfigured(config)) {
    config.deliveryReady = false;
    return false;
  }
  const request = async (method: string, body: object) => {
    const r = await remoteFetch(
      "https://goapi.unisender.ru/ru/transactional/api/v1/" + method + ".json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": config.apiKey!,
        },
        body: JSON.stringify(body),
        signal: shutdownSignal
          ? AbortSignal.any([AbortSignal.timeout(10000), shutdownSignal])
          : AbortSignal.timeout(10000),
      },
    );
    const result = (await r.json()) as any;
    return { ok: r.ok && result?.status === "success", result };
  };
  try {
    const domain = config.from!.split("@")[1].toLowerCase();
    const listing = await request("domain/list", {});
    if (!listing.ok) return !!config.deliveryReady;
    const entry = listing.result.domains?.find((d: any) => d.domain === domain);
    if (entry?.["verification-record"]?.status !== "confirmed") {
      config.deliveryReady = false;
      return false;
    }
    if (entry.dkim?.status === "active") {
      config.deliveryReady = true;
      return true;
    }
    const check = await request("domain/validate-dkim", { domain });
    config.deliveryReady = check.ok;
    return check.ok;
  } catch {
    return !!config.deliveryReady;
  }
}
export function signEmailToken(
  config: EmailConfig,
  kind: string,
  data: Record<string, unknown>,
) {
  if (config.secret.length < 32)
    throw emailError("Письма пока недоступны.", 503);
  const body = Buffer.from(JSON.stringify({ kind, ...data })).toString(
    "base64url",
  );
  return (
    body +
    "." +
    createHmac("sha256", config.secret).update(body).digest("base64url")
  );
}
export function readEmailToken(
  config: EmailConfig,
  value: unknown,
  kind: string,
  now = Date.now(),
): any | null {
  if (
    config.secret.length < 32 ||
    typeof value !== "string" ||
    value.length > 1200
  )
    return null;
  const [body, mac, ...rest] = value.split(".");
  if (!body || !mac || rest.length) return null;
  const expected = createHmac("sha256", config.secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return data.kind === kind &&
      (data.exp === undefined || (Number.isFinite(data.exp) && data.exp > now))
      ? data
      : null;
  } catch {
    return null;
  }
}
const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
const hashAddress = (config: EmailConfig, email: string) =>
  createHmac("sha256", config.secret)
    .update("email:" + email)
    .digest("hex");
export async function lockPublications(c: DB) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    EMAIL_PUBLICATION_LOCK,
  ]);
}
export async function notificationSnapshot(c: DB, game: GameId, mode: string) {
  return (
    await c.query(
      LEADERBOARD_SQL +
        ` SELECT r.id,r.place::int,r.score_units FROM ranked r JOIN playne_email_contacts e ON e.user_id=r.id WHERE r.place<=10 AND e.enabled AND e.verified_at IS NOT NULL`,
      [game, scoreVersion(game), "all", mode],
    )
  ).rows;
}
export async function queueDisplacements(
  c: DB,
  before: any[],
  actor: string,
  cause: string,
  game: GameId,
  mode: string,
) {
  if (!before.length) return;
  const after = (
    await c.query(
      LEADERBOARD_SQL +
        " SELECT id,place::int,score_units FROM ranked WHERE id=ANY($5::uuid[])",
      [
        game,
        scoreVersion(game),
        "all",
        mode,
        [actor, ...before.map((r) => r.id)],
      ],
    )
  ).rows;
  const rival = after.find((r) => r.id === actor);
  if (!rival) return;
  for (const old of before) {
    const next = after.find((r) => r.id === old.id);
    if (
      old.id === actor ||
      !next ||
      next.place <= old.place ||
      rival.score_units <= old.score_units
    )
      continue;
    await c.query(
      `INSERT INTO playne_email_events(user_id,cause_id,game,mode,version,old_place,new_place,score_units,opponent_units) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [
        old.id,
        cause,
        game,
        mode,
        scoreVersion(game),
        old.place,
        next.place,
        old.score_units,
        rival.score_units,
      ],
    );
  }
}
export async function stopEmails(
  c: DB,
  config: EmailConfig,
  userId: string,
  reason = "unsubscribe",
) {
  const result = await c.query(
    "UPDATE playne_email_contacts SET enabled=false,requested_at=NULL,updated_at=now() WHERE user_id=$1 RETURNING email",
    [userId],
  );
  const email = result.rows[0]?.email;
  if (email)
    await c.query(
      `INSERT INTO playne_email_suppressions(address_hash,reason) VALUES($1,$2) ON CONFLICT(address_hash) DO UPDATE SET reason=CASE WHEN playne_email_suppressions.reason IN('spam','hard_bounced') THEN playne_email_suppressions.reason ELSE excluded.reason END,expires_at=now()+interval '180 days'`,
      [hashAddress(config, email), reason],
    );
  await c.query(
    `UPDATE playne_email_outbox SET status='cancelled',updated_at=now() WHERE user_id=$1 AND status IN('pending','sending','uncertain')`,
    [userId],
  );
  await c.query(
    "UPDATE playne_email_events SET handled_at=now() WHERE user_id=$1 AND handled_at IS NULL",
    [userId],
  );
  if (reason === "unsubscribe")
    await c.query(
      `UPDATE playne_email_outbox SET unsubscribed_at=coalesce(unsubscribed_at,now()) WHERE id=(SELECT id FROM playne_email_outbox WHERE user_id=$1 AND kind='rank' AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 1)`,
      [userId],
    );
  await c.query(
    "INSERT INTO playne_email_consents(user_id,action,version,source) VALUES($1,$2,$3,$4)",
    [userId, "revoked", EMAIL_CONSENT_VERSION, reason],
  );
}
export async function requestEmailSubscription(
  c: DB,
  config: EmailConfig,
  userId: string,
  address: unknown,
  source: string,
  now = Date.now(),
) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "email-user:" + userId,
  ]);
  const existing = (
    await c.query(
      "SELECT * FROM playne_email_contacts WHERE user_id=$1 FOR UPDATE",
      [userId],
    )
  ).rows[0];
  const email = address ? normalizeEmail(address) : null;
  // Only an address actually returned by Yandex for this account is trusted.
  // Neither a request body nor a caller-provided source label can verify it.
  const yandexAddress = email
    ? !!(
        await c.query(
          "SELECT 1 FROM playne_identities WHERE user_id=$1 AND provider='yandex' AND provider_email=$2 AND email_received_at IS NOT NULL",
          [userId, email],
        )
      ).rowCount
    : false;
  if (existing?.enabled && existing.email === email) return;
  if (
    yandexAddress &&
    existing?.provider_unsubscribed &&
    existing.email === email
  )
    throw emailError(
      "Этот адрес отписан у почтового сервиса. Укажи другую почту.",
    );
  if (email) {
    const suppression = (
      await c.query(
        "SELECT reason FROM playne_email_suppressions WHERE address_hash=$1 AND expires_at>now()",
        [hashAddress(config, email)],
      )
    ).rows[0];
    if (suppression && suppression.reason !== "unsubscribe")
      throw emailError(
        "На этот адрес письма не доставляются. Укажи другую почту.",
      );
    const other = await c.query(
      "SELECT 1 FROM playne_email_contacts WHERE lower(email)=lower($1) AND user_id<>$2",
      [email, userId],
    );
    if (other.rowCount)
      throw emailError("Не удалось подключить этот адрес. Укажи другую почту.");
  }
  const count =
    !yandexAddress &&
    (await c.query(
      `SELECT count(*)::int AS n FROM playne_email_outbox WHERE user_id=$1 AND kind='verify' AND created_at>$2::timestamptz-interval '1 hour'`,
      [userId, new Date(now)],
    ));
  if (count && count.rows[0].n >= 3)
    throw emailError("Подожди час перед повторной отправкой.", 429);
  await c.query(
    `UPDATE playne_email_outbox SET status='cancelled',updated_at=now() WHERE user_id=$1 AND status IN('pending','sending','uncertain')`,
    [userId],
  );
  await c.query(
    "UPDATE playne_email_events SET handled_at=now() WHERE user_id=$1 AND handled_at IS NULL",
    [userId],
  );
  // Assignment is independent of game, score and signup time; retain it on address changes.
  const variant: EmailVariant =
    existing?.variant ?? (["A", "B", "C"] as const)[randomInt(3)];
  const contact = (
    await c.query(
      `INSERT INTO playne_email_contacts(user_id,email,variant,consent_at,consent_version,consent_source,requested_at) VALUES($1,$2,$3,$4,$5,$6,$4) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,provider_unsubscribed=CASE WHEN playne_email_contacts.email=excluded.email THEN playne_email_contacts.provider_unsubscribed ELSE false END,verified_at=NULL,enabled=false,generation=gen_random_uuid(),requested_at=excluded.requested_at,consent_at=excluded.consent_at,consent_version=excluded.consent_version,consent_source=excluded.consent_source,updated_at=now() RETURNING *`,
      [userId, email, variant, new Date(now), EMAIL_CONSENT_VERSION, source],
    )
  ).rows[0];
  await c.query(
    "INSERT INTO playne_email_consents(user_id,action,version,source) VALUES($1,$2,$3,$4)",
    [userId, "requested", EMAIL_CONSENT_VERSION, source],
  );
  await c.query(
    "INSERT INTO playne_email_consents(user_id,action,version,source) VALUES($1,$2,$3,$4)",
    [userId, "email_processing", "email-processing-2026-10-28-v1", source],
  );
  if (yandexAddress) {
    await c.query(
      "DELETE FROM playne_email_suppressions WHERE address_hash=$1 AND reason='unsubscribe'",
      [hashAddress(config, email!)],
    );
    await c.query(
      "UPDATE playne_email_contacts SET enabled=true,verified_at=$1,updated_at=$1 WHERE user_id=$2",
      [new Date(now), userId],
    );
    await c.query(
      "INSERT INTO playne_email_consents(user_id,action,version,source) VALUES($1,'confirmed',$2,'yandex_profile')",
      [userId, EMAIL_CONSENT_VERSION],
    );
  } else if (email)
    await c.query(
      `INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,payload) VALUES($1,$2,'verify',$3,$4,$5)`,
      [
        userId,
        contact.generation,
        variant,
        EMAIL_EXPERIMENT,
        JSON.stringify({
          email,
          expires: now + 86400000,
          providerResubscribe:
            !!existing?.provider_unsubscribed && existing.email === email,
        }),
      ],
    );
}
export async function confirmEmailSubscription(
  c: DB,
  config: EmailConfig,
  value: unknown,
  now = Date.now(),
) {
  const data = readEmailToken(config, value, "confirm", now);
  if (!data || !uuid(data.g))
    throw emailError("Ссылка устарела. Запроси новое письмо в кабинете.", 410);
  const initial = (
    await c.query(
      "SELECT user_id FROM playne_email_contacts WHERE generation=$1",
      [data.g],
    )
  ).rows[0];
  if (!initial)
    throw emailError("Ссылка устарела. Запроси новое письмо в кабинете.", 410);
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "email-user:" + initial.user_id,
  ]);
  const contact = (
    await c.query(
      "SELECT * FROM playne_email_contacts WHERE generation=$1 FOR UPDATE",
      [data.g],
    )
  ).rows[0];
  if (!contact?.email || !contact.requested_at)
    throw emailError("Ссылка устарела. Запроси новое письмо в кабинете.", 410);
  if (contact.enabled && contact.verified_at) return contact.user_id as string;
  const blocked = (
    await c.query(
      "SELECT reason FROM playne_email_suppressions WHERE address_hash=$1 AND expires_at>now()",
      [hashAddress(config, contact.email)],
    )
  ).rows[0];
  if (blocked && blocked.reason !== "unsubscribe")
    throw emailError("Письма на этот адрес отключены.", 409);
  await c.query(
    `DELETE FROM playne_email_suppressions WHERE address_hash=$1 AND reason='unsubscribe'`,
    [hashAddress(config, contact.email)],
  );
  await c.query(
    "UPDATE playne_email_contacts SET enabled=true,provider_unsubscribed=false,verified_at=$1,updated_at=$1 WHERE user_id=$2",
    [new Date(now), contact.user_id],
  );
  await c.query(
    "INSERT INTO playne_email_consents(user_id,action,version,source) VALUES($1,$2,$3,$4)",
    [contact.user_id, "confirmed", EMAIL_CONSENT_VERSION, "confirmation"],
  );
  return contact.user_id as string;
}
export async function emailSettings(
  c: DB,
  config: EmailConfig,
  userId: string,
) {
  const contact = (
    await c.query(
      "SELECT email,verified_at,enabled,requested_at FROM playne_email_contacts WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  const identity = (
    await c.query(
      "SELECT provider_email FROM playne_identities WHERE user_id=$1 AND provider='yandex'",
      [userId],
    )
  ).rows[0];
  const email =
    (contact?.enabled || contact?.requested_at
      ? contact?.email
      : (identity?.provider_email ?? contact?.email)) ??
    identity?.provider_email ??
    "";
  const verified =
    (!!email && email === identity?.provider_email) ||
    (email === contact?.email && !!contact?.verified_at);
  return {
    reportAvailable: !!config.adminId && config.adminId === userId,
    available: mailConfigured(config),
    yandexAvailable: !!config.yandexEmail,
    email,
    yandexEmail: identity?.provider_email ?? "",
    verified,
    enabled: !!contact?.enabled,
    pending: !!contact?.requested_at && !verified,
    consentVersion: EMAIL_CONSENT_VERSION,
  };
}
// Moscow stays on UTC+3; never use the server's host timezone for quiet hours.
export const emailSendingHour = (now: number) => {
  const h = new Date(now + 3 * 3600000).getUTCHours();
  return h >= 10 && h < 21;
};
export async function currentRankItems(c: DB, userId: string, events: any[]) {
  const groups = new Map<string, any[]>();
  for (const e of events) {
    const key = e.game + ":" + e.mode + ":" + e.version;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const items: RankEmailItem[] = [];
  for (const list of groups.values()) {
    const first = list[0],
      last = list[list.length - 1];
    if (scoreVersion(first.game) !== first.version) continue;
    const row = (
      await c.query(
        LEADERBOARD_SQL +
          " SELECT place::int,score_units FROM ranked WHERE id=$5",
        [first.game, first.version, "all", first.mode, userId],
      )
    ).rows[0];
    if (
      !row ||
      row.place <= first.old_place ||
      row.score_units > first.score_units
    )
      continue;
    items.push({
      id: last.id,
      game: first.game,
      mode: first.mode,
      oldPlace: first.old_place,
      newPlace: row.place,
      scoreUnits: row.score_units,
      opponentUnits: last.opponent_units,
    });
  }
  return items
    .sort((a, b) => b.newPlace - b.oldPlace - (a.newPlace - a.oldPlace))
    .slice(0, 3);
}

export async function prepareRankEmails(
  pool: Pool,
  config: EmailConfig,
  now = Date.now(),
) {
  if (!mailConfigured(config) || !emailSendingHour(now)) return;
  const users = (
    await pool.query(
      `SELECT e.user_id FROM playne_email_events e JOIN playne_email_contacts contact ON contact.user_id=e.user_id
       WHERE e.handled_at IS NULL AND e.created_at<=$1::timestamptz-interval '30 minutes' AND e.created_at>$1::timestamptz-interval '72 hours'
       AND contact.enabled AND contact.verified_at IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM playne_email_outbox o WHERE o.user_id=e.user_id AND o.kind='rank' AND o.status IN('pending','sending','uncertain'))
       AND NOT EXISTS(SELECT 1 FROM playne_email_outbox o WHERE o.user_id=e.user_id AND o.kind='rank' AND o.submitted_at>$1::timestamptz-interval '24 hours')
       AND (SELECT count(*) FROM playne_email_outbox o WHERE o.user_id=e.user_id AND o.kind='rank' AND o.submitted_at>$1::timestamptz-interval '7 days')<3
       GROUP BY e.user_id ORDER BY min(e.created_at) LIMIT 30`,
      [new Date(now)],
    )
  ).rows;
  for (const user of users) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "email-user:" + user.user_id,
      ]);
      const contact = (
        await c.query(
          "SELECT * FROM playne_email_contacts WHERE user_id=$1 FOR UPDATE",
          [user.user_id],
        )
      ).rows[0];
      if (!contact?.enabled || !contact.verified_at) {
        await c.query(
          "UPDATE playne_email_events SET handled_at=now() WHERE user_id=$1 AND handled_at IS NULL",
          [user.user_id],
        );
        await c.query("COMMIT");
        continue;
      }
      await c.query(
        `UPDATE playne_email_events SET handled_at=now() WHERE user_id=$1 AND handled_at IS NULL AND created_at<$2::timestamptz-interval '72 hours'`,
        [user.user_id, new Date(now)],
      );
      const pending = await c.query(
        `SELECT 1 FROM playne_email_outbox WHERE user_id=$1 AND kind='rank' AND status IN('pending','sending','uncertain')`,
        [user.user_id],
      );
      const frequency = await c.query(
        `SELECT count(*) FILTER(WHERE submitted_at>$2::timestamptz-interval '24 hours')::int AS daily,count(*)::int AS weekly FROM playne_email_outbox WHERE user_id=$1 AND kind='rank' AND submitted_at>$2::timestamptz-interval '7 days'`,
        [user.user_id, new Date(now)],
      );
      if (
        pending.rowCount ||
        frequency.rows[0].daily >= 1 ||
        frequency.rows[0].weekly >= 3
      ) {
        await c.query("COMMIT");
        continue;
      }
      const events = (
        await c.query(
          "SELECT * FROM playne_email_events WHERE user_id=$1 AND handled_at IS NULL ORDER BY created_at,id",
          [user.user_id],
        )
      ).rows;
      const items = await currentRankItems(c, user.user_id, events);
      const selected = events
        .filter((e) =>
          items.some(
            (i) =>
              i.game === e.game &&
              i.mode === e.mode &&
              scoreVersion(e.game) === e.version,
          ),
        )
        .map((e) => e.id);
      if (items.length)
        await c.query(
          `INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,event_ids,payload) VALUES($1,$2,'rank',$3,$4,$5,$6)`,
          [
            user.user_id,
            contact.generation,
            contact.variant,
            contact.experiment,
            selected,
            JSON.stringify({ email: contact.email, items }),
          ],
        );
      else
        await c.query(
          "UPDATE playne_email_events SET handled_at=now() WHERE id=ANY($1::uuid[])",
          [events.map((e) => e.id)],
        );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}

export async function deliverEmails(
  pool: Pool,
  config: EmailConfig,
  remoteFetch: typeof fetch = fetch,
  now = Date.now(),
  shutdownSignal?: AbortSignal,
) {
  if (!mailConfigured(config)) return;
  await pool.query(
    `UPDATE playne_email_events SET handled_at=now() WHERE handled_at IS NULL AND id=ANY(SELECT unnest(event_ids) FROM playne_email_outbox WHERE status='uncertain' AND submitted_at<$1::timestamptz-interval '72 hours')`,
    [new Date(now)],
  );
  await pool.query(
    `UPDATE playne_email_outbox SET status='failed',failure_code='unknown_expired',updated_at=now() WHERE status='uncertain' AND submitted_at<$1::timestamptz-interval '72 hours'`,
    [new Date(now)],
  );
  // A process crash after transmission is ambiguous: never blindly retry it.
  await pool.query(
    `UPDATE playne_email_outbox SET status='uncertain',updated_at=now() WHERE status='sending' AND updated_at<$1::timestamptz-interval '10 minutes'`,
    [new Date(now)],
  );
  for (let n = 0; n < 10; n++) {
    if (shutdownSignal?.aborted) break;
    const c = await pool.connect();
    let row: any, message: any;
    try {
      await c.query("BEGIN");
      // Fixed lock order: contact/user first, outbox row second. No HTTP while holding a DB transaction.
      const candidate = (
        await c.query(
          `SELECT user_id FROM playne_email_outbox WHERE status='pending' AND available_at<=$1 AND (kind='verify' OR $2) ORDER BY available_at,id LIMIT 1`,
          [new Date(now), emailSendingHour(now)],
        )
      ).rows[0];
      if (!candidate) {
        await c.query("COMMIT");
        break;
      }
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "email-user:" + candidate.user_id,
      ]);
      row = (
        await c.query(
          `SELECT * FROM playne_email_outbox WHERE user_id=$1 AND status='pending' AND available_at<=$2 AND (kind='verify' OR $3) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [candidate.user_id, new Date(now), emailSendingHour(now)],
        )
      ).rows[0];
      if (!row) {
        await c.query("COMMIT");
        continue;
      }
      const contact = (
        await c.query(
          "SELECT * FROM playne_email_contacts WHERE user_id=$1 FOR UPDATE",
          [row.user_id],
        )
      ).rows[0];
      const suppressed = (
        await c.query(
          "SELECT reason FROM playne_email_suppressions WHERE address_hash=$1 AND expires_at>$2",
          [hashAddress(config, row.payload.email), new Date(now)],
        )
      ).rows[0];
      let cancel =
        !contact ||
        contact.generation !== row.generation ||
        contact.email !== row.payload.email ||
        !!(
          suppressed &&
          (row.kind === "rank" || suppressed.reason !== "unsubscribe")
        );
      if (row.kind === "rank") {
        if (!emailSendingHour(now)) {
          await c.query("COMMIT");
          break;
        }
        const frequency = (
          await c.query(
            `SELECT count(*) FILTER(WHERE submitted_at>$2::timestamptz-interval '24 hours')::int AS daily,count(*)::int AS weekly FROM playne_email_outbox WHERE user_id=$1 AND kind='rank' AND submitted_at>$2::timestamptz-interval '7 days'`,
            [row.user_id, new Date(now)],
          )
        ).rows[0];
        if (frequency.daily >= 1 || frequency.weekly >= 3) {
          await c.query(
            `UPDATE playne_email_outbox SET available_at=$1::timestamptz+interval '1 hour' WHERE id=$2`,
            [new Date(now), row.id],
          );
          await c.query("COMMIT");
          continue;
        }
        const events = (
          await c.query(
            "SELECT * FROM playne_email_events WHERE id=ANY($1::uuid[]) AND handled_at IS NULL AND created_at>$2::timestamptz-interval '72 hours' ORDER BY created_at,id",
            [row.event_ids, new Date(now)],
          )
        ).rows;
        const items = await currentRankItems(c, row.user_id, events);
        cancel ||= !contact?.enabled || !contact?.verified_at || !items.length;
        if (!cancel) {
          row.payload.items = items;
          const exp = now + 7 * 86400000;
          const link = signEmailToken(config, "click", { o: row.id, exp });
          const unsub = signEmailToken(config, "unsubscribe", {
            g: row.generation,
            o: row.id,
          });
          const unsubscribeUrl =
            config.origin + "/account/?mail=unsubscribe#" + unsub;
          message = renderRankEmail({
            origin: config.origin,
            variant: row.variant,
            items,
            playUrl:
              config.origin + "/api/email/click/" + link + "?target=play",
            rankUrl:
              config.origin + "/api/email/click/" + link + "?target=rank",
            unsubscribeUrl,
          });
          message.headers = {
            "List-Unsubscribe": `<${config.origin}/api/email/unsubscribe/${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          };
        }
      } else {
        cancel ||=
          !contact?.requested_at ||
          contact?.enabled ||
          row.payload.expires <= now;
        if (!cancel)
          message = renderVerificationEmail(
            config.origin,
            config.origin +
              "/account/?mail=confirm#" +
              signEmailToken(config, "confirm", {
                g: row.generation,
                exp: row.payload.expires,
              }),
          );
      }
      if (cancel) {
        await c.query(
          `UPDATE playne_email_outbox SET status='cancelled',updated_at=now() WHERE id=$1`,
          [row.id],
        );
        await c.query(
          "UPDATE playne_email_events SET handled_at=now() WHERE id=ANY($1::uuid[])",
          [row.event_ids],
        );
        await c.query("COMMIT");
        continue;
      }
      await c.query(
        `UPDATE playne_email_outbox SET status='sending',attempts=attempts+1,submitted_at=$1,updated_at=$1,payload=$3 WHERE id=$2`,
        [new Date(now), row.id, JSON.stringify(row.payload)],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    try {
      const resubscribe =
        row.kind === "verify" && row.payload.providerResubscribe;
      const response = await remoteFetch(
        "https://goapi.unisender.ru/ru/transactional/api/v1/" +
          (resubscribe ? "email/subscribe.json" : "email/send.json"),
        {
          method: "POST",
          signal: shutdownSignal
            ? AbortSignal.any([AbortSignal.timeout(20000), shutdownSignal])
            : AbortSignal.timeout(20000),
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.apiKey!,
          },
          body: JSON.stringify(
            resubscribe
              ? {
                  from_email: config.from,
                  from_name: "Playne",
                  to_email: row.payload.email,
                }
              : {
                  message: {
                    subject: message.subject,
                    body: { html: message.html, plaintext: message.plaintext },
                    ...(message.headers ? { headers: message.headers } : {}),
                    idempotence_key: row.id,
                    from_email: config.from,
                    from_name: "Playne",
                    reply_to: config.replyTo,
                    global_language: "ru",
                    track_links: row.kind === "rank" ? 1 : 0,
                    track_read: 0,
                    recipients: [
                      {
                        email: row.payload.email,
                        metadata: {
                          outbox_id: row.id,
                          variant: row.variant,
                          experiment: row.experiment,
                        },
                      },
                    ],
                    tags: [
                      row.kind === "rank"
                        ? EMAIL_EXPERIMENT
                        : "email-confirmation",
                    ],
                  },
                },
          ),
        },
      );
      const result = (await response.json().catch(() => null)) as any;
      if (
        response.ok &&
        result?.status === "success" &&
        (resubscribe || typeof result.job_id === "string")
      ) {
        await pool.query(
          `UPDATE playne_email_outbox SET status='accepted',provider_job=$1,updated_at=now() WHERE id=$2 AND status IN('sending','uncertain')`,
          [result.job_id ?? null, row.id],
        );
        await pool.query(
          "UPDATE playne_email_events SET handled_at=now() WHERE id=ANY($1::uuid[])",
          [row.event_ids],
        );
      } else if (response.status === 429) {
        await pool.query(
          `UPDATE playne_email_outbox SET status='pending',submitted_at=NULL,available_at=$1::timestamptz+interval '15 minutes',updated_at=now(),failure_code='rate_limit' WHERE id=$2 AND status='sending'`,
          [new Date(now), row.id],
        );
      } else if (
        response.status >= 400 &&
        response.status < 500 &&
        result?.status === "error"
      ) {
        await pool.query(
          `UPDATE playne_email_outbox SET status='failed',failure_code=$1,updated_at=now() WHERE id=$2 AND status='sending'`,
          [
            "provider_" +
              String(result.code ?? response.status)
                .replace(/[^0-9]/g, "")
                .slice(0, 12),
            row.id,
          ],
        );
        await pool.query(
          "UPDATE playne_email_events SET handled_at=now() WHERE id=ANY($1::uuid[])",
          [row.event_ids],
        );
      } else throw new Error("Uncertain delivery");
    } catch {
      await pool.query(
        `UPDATE playne_email_outbox SET status='uncertain',failure_code='unknown_outcome',updated_at=now() WHERE id=$1 AND status='sending'`,
        [row.id],
      );
    }
  }
}

export async function emailExperimentReport(pool: Pool, now = Date.now()) {
  const rows = (
    await pool.query(
      `SELECT variant,count(*)::int AS messages,count(DISTINCT user_id)::int AS recipients,
   count(*) FILTER(WHERE delivered_at IS NOT NULL)::int AS delivered_messages,
   count(DISTINCT user_id) FILTER(WHERE delivered_at IS NOT NULL)::int AS delivered_users,
   count(DISTINCT user_id) FILTER(WHERE delivered_at IS NOT NULL AND visited_at IS NOT NULL)::int AS visited_users,
   count(DISTINCT user_id) FILTER(WHERE delivered_at IS NOT NULL AND game_started_at IS NOT NULL)::int AS started_users,
   count(DISTINCT user_id) FILTER(WHERE delivered_at IS NOT NULL AND game_completed_at IS NOT NULL)::int AS completed_users,
   count(*) FILTER(WHERE complaint_at IS NOT NULL)::int AS complaints,
   count(*) FILTER(WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribes,
   min(submitted_at) AS first_sent
   FROM playne_email_outbox WHERE kind='rank' AND experiment=$1 AND submitted_at IS NOT NULL AND submitted_at<=$2::timestamptz-interval '7 days' AND submitted_at>=$2::timestamptz-interval '90 days' GROUP BY variant ORDER BY variant`,
      [EMAIL_EXPERIMENT, new Date(now)],
    )
  ).rows;
  const wilson = (k: number, n: number) => {
    if (!n) return null;
    const z = 1.96,
      d = 1 + (z * z) / n,
      m = (k / n + (z * z) / (2 * n)) / d,
      h = (z * Math.sqrt(((k / n) * (1 - k / n) + (z * z) / (4 * n)) / n)) / d;
    return [Math.max(0, m - h), Math.min(1, m + h)];
  };
  const live = (
    await pool.query(
      `SELECT variant,status,count(*)::int AS messages FROM playne_email_outbox WHERE kind='rank' AND experiment=$1 GROUP BY variant,status ORDER BY variant,status`,
      [EMAIL_EXPERIMENT],
    )
  ).rows;
  return {
    live,
    experiment: EMAIL_EXPERIMENT,
    unit: "user",
    attributionDays: 7,
    reportWindowDays: 90,
    matureOnly: true,
    generatedAt: new Date(now).toISOString(),
    note: "Сравниваются уникальные получатели с доставленным письмом и полным окном 7 дней. Клики почтовых сканеров не считаются переходами. При небольшой аудитории различия могут быть случайными; автоматического выбора победителя нет.",
    variants: (["A", "B", "C"] as const).map((variant) => {
      const row = rows.find((r) => r.variant === variant) ?? {
        messages: 0,
        recipients: 0,
        delivered_messages: 0,
        delivered_users: 0,
        visited_users: 0,
        started_users: 0,
        completed_users: 0,
        complaints: 0,
        unsubscribes: 0,
      };
      return {
        ...row,
        variant,
        visitRate: row.delivered_users
          ? row.visited_users / row.delivered_users
          : null,
        visitRate95: wilson(row.visited_users, row.delivered_users),
      };
    }),
  };
}

export async function cleanupEmailData(pool: Pool) {
  await pool.query(
    "DELETE FROM playne_email_callbacks WHERE created_at<now()-interval '30 days'",
  );
  await pool.query(
    "DELETE FROM playne_email_suppressions WHERE expires_at<now()",
  );
  await pool.query(
    "UPDATE playne_email_events SET handled_at=now() WHERE handled_at IS NULL AND created_at<now()-interval '72 hours'",
  );
  await pool.query(
    "DELETE FROM playne_email_events WHERE handled_at<now()-interval '90 days'",
  );
  await pool.query(
    "UPDATE playne_email_outbox SET raw_click_at=NULL,visited_at=NULL,game_started_at=NULL,game_completed_at=NULL WHERE coalesce(submitted_at,created_at)<now()-interval '90 days' AND (raw_click_at IS NOT NULL OR visited_at IS NOT NULL OR game_started_at IS NOT NULL OR game_completed_at IS NOT NULL)",
  );
  await pool.query(
    "DELETE FROM playne_email_outbox WHERE created_at<now()-interval '180 days' AND status NOT IN('pending','sending','uncertain')",
  );
  await pool.query(
    "UPDATE playne_email_contacts SET email=NULL,verified_at=NULL WHERE NOT enabled AND requested_at IS NULL AND updated_at<now()-interval '30 days' AND email IS NOT NULL",
  );
}
