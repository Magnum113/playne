import type { Pool } from "pg";
import { EMAIL_CONSENT_VERSION } from "../src/emailConsent";
import {
  emailFrequency,
  hashAddress,
  mailConfigured,
  type EmailConfig,
} from "./email-core";
import {
  playedToday,
  reminderClock,
  reminderDue,
} from "./email-reminders-policy";

export async function prepareReminderEmails(
  pool: Pool,
  config: EmailConfig,
  now = Date.now(),
) {
  if (!mailConfigured(config)) return;
  const clock = reminderClock(now);
  if (clock.minutes < 600 || clock.minutes >= 1260) return;
  const users = (
    await pool.query(
      `SELECT user_id FROM playne_email_contacts contact WHERE enabled AND verified_at IS NOT NULL AND purpose='general' AND consent_version=$1 AND reminders_enabled
      AND $2=ANY(reminder_days) AND reminder_time<=$3
      AND NOT EXISTS(SELECT 1 FROM playne_email_outbox o WHERE o.user_id=contact.user_id AND kind='reminder' AND reminder_day=$4)
      AND NOT EXISTS(SELECT 1 FROM playne_games g WHERE g.owner_id=contact.user_id AND completed_at>=($4::date AT TIME ZONE 'Europe/Moscow') AND completed_at<(($4::date+1) AT TIME ZONE 'Europe/Moscow'))
      AND NOT EXISTS(SELECT 1 FROM playne_email_outbox o WHERE o.user_id=contact.user_id AND kind IN('rank','reminder') AND (status IN('pending','sending','uncertain') OR submitted_at>$5::timestamptz-interval '24 hours'))
      AND (SELECT count(*) FROM playne_email_outbox o WHERE o.user_id=contact.user_id AND kind IN('rank','reminder') AND submitted_at>$5::timestamptz-interval '7 days')<3
      ORDER BY user_id LIMIT 100`,
      [
        EMAIL_CONSENT_VERSION,
        clock.weekday,
        String(Math.floor(clock.minutes / 60)).padStart(2, "0") +
          ":" +
          String(clock.minutes % 60).padStart(2, "0"),
        clock.day,
        new Date(now),
      ],
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
      if (
        !contact?.enabled ||
        !contact.verified_at ||
        contact.consent_version !== EMAIL_CONSENT_VERSION ||
        !reminderDue(contact, now) ||
        (await playedToday(c, user.user_id, now))
      ) {
        await c.query("COMMIT");
        continue;
      }
      const suppressed = await c.query(
        "SELECT 1 FROM playne_email_suppressions WHERE address_hash=$1 AND expires_at>$2",
        [hashAddress(config, contact.email), new Date(now)],
      );
      const pending = await c.query(
        "SELECT 1 FROM playne_email_outbox WHERE user_id=$1 AND kind IN('rank','reminder') AND status IN('pending','sending','uncertain')",
        [user.user_id],
      );
      const frequency = await emailFrequency(c, user.user_id, now);
      if (
        !suppressed.rowCount &&
        !pending.rowCount &&
        frequency.daily < 1 &&
        frequency.weekly < 3
      )
        await c.query(
          "INSERT INTO playne_email_outbox(user_id,generation,kind,variant,experiment,reminder_day,payload,available_at) VALUES($1,$2,'reminder',$3,'playne-reminders-v1',$4,$5,$6) ON CONFLICT(user_id,reminder_day) WHERE kind='reminder' DO NOTHING",
          [
            user.user_id,
            contact.generation,
            contact.variant,
            clock.day,
            JSON.stringify({ email: contact.email, day: clock.day }),
            new Date(now),
          ],
        );
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
}
