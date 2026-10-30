-- Existing subscribers keep their original rank-only purpose. A general scope is
-- written only after a new explicit consent, never inferred from enabled=true.
ALTER TABLE playne_email_contacts ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'rank' CHECK(purpose IN('rank','general'));
ALTER TABLE playne_email_contacts ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE playne_email_contacts ADD COLUMN IF NOT EXISTS reminder_days smallint[] NOT NULL DEFAULT ARRAY[1,3,5]::smallint[];
ALTER TABLE playne_email_contacts ADD COLUMN IF NOT EXISTS reminder_time text NOT NULL DEFAULT '19:00';
ALTER TABLE playne_email_outbox DROP CONSTRAINT IF EXISTS playne_email_outbox_kind_check;
ALTER TABLE playne_email_outbox ADD CONSTRAINT playne_email_outbox_kind_check CHECK(kind IN('verify','rank','reminder'));
ALTER TABLE playne_email_outbox ADD COLUMN IF NOT EXISTS reminder_day date;
CREATE UNIQUE INDEX IF NOT EXISTS playne_email_one_reminder_day ON playne_email_outbox(user_id,reminder_day) WHERE kind='reminder';
CREATE INDEX IF NOT EXISTS playne_email_marketing_frequency ON playne_email_outbox(user_id,submitted_at DESC) WHERE kind IN('rank','reminder') AND submitted_at IS NOT NULL;
