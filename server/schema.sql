BEGIN;
CREATE TABLE IF NOT EXISTS playne_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nickname varchar(40) NOT NULL,
 nickname_confirmed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS playne_identities (
 provider text NOT NULL CHECK(provider='yandex'), subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES playne_users(id) ON DELETE CASCADE,
 PRIMARY KEY(provider,subject)
);
ALTER TABLE playne_identities ADD COLUMN IF NOT EXISTS provider_email text;
ALTER TABLE playne_identities ADD COLUMN IF NOT EXISTS email_received_at timestamptz;
CREATE TABLE IF NOT EXISTS playne_auth_sessions (
 token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES playne_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS playne_oauth_states (
 state_hash char(64) PRIMARY KEY, browser_hash char(64) NOT NULL, verifier text NOT NULL,
 return_path text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS playne_games (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), browser_hash char(64) NOT NULL,
 owner_id uuid REFERENCES playne_users(id) ON DELETE CASCADE,
 game text NOT NULL CHECK(game IN('naglaz','circle','colorfle','geo','pressure','line','flash','rotate','slide','dispatch')),
 version integer NOT NULL DEFAULT 1, challenge jsonb NOT NULL, answers jsonb NOT NULL DEFAULT '[]',
 score_units integer, completed_at timestamptz, published_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(score_units IS NULL OR score_units BETWEEN 0 AND 5000),
 CHECK(published_at IS NULL OR (completed_at IS NOT NULL AND owner_id IS NOT NULL AND score_units IS NOT NULL))
);
ALTER TABLE playne_games DROP CONSTRAINT IF EXISTS playne_games_game_check;
ALTER TABLE playne_games ADD CONSTRAINT playne_games_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure','line','flash','rotate','slide','dispatch'));
ALTER TABLE playne_games ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'classic';
ALTER TABLE playne_games DROP CONSTRAINT IF EXISTS playne_games_score_units_check;
ALTER TABLE playne_games ADD CONSTRAINT playne_games_score_units_check CHECK(score_units IS NULL OR score_units BETWEEN 0 AND 250000);
CREATE INDEX IF NOT EXISTS playne_games_modes ON playne_games(game,version,mode,score_units DESC,completed_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_games_leaderboard ON playne_games(game,version,score_units DESC,completed_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_games_owner ON playne_games(owner_id,completed_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_completed_activity ON playne_games(owner_id,completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_games_expiry ON playne_games(expires_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS playne_sessions_expiry ON playne_auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS playne_color_score_backups (
 game_id uuid PRIMARY KEY REFERENCES playne_games(id) ON DELETE CASCADE,
 version integer NOT NULL, answers jsonb NOT NULL, score_units integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS playne_guest_trials (
 browser_hash char(64) NOT NULL, game text NOT NULL CHECK(game IN('naglaz','circle','colorfle','geo','pressure','line','flash','rotate','slide','dispatch')),
 run_id uuid REFERENCES playne_games(id) ON DELETE SET NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(browser_hash,game)
);
CREATE INDEX IF NOT EXISTS playne_guest_trials_run ON playne_guest_trials(run_id);
ALTER TABLE playne_guest_trials DROP CONSTRAINT IF EXISTS playne_guest_trials_game_check;
ALTER TABLE playne_guest_trials ADD CONSTRAINT playne_guest_trials_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure','line','flash','rotate','slide','dispatch'));
CREATE TABLE IF NOT EXISTS playne_line_days (
 day date NOT NULL, browser_hash char(64) NOT NULL,
 owner_id uuid REFERENCES playne_users(id) ON DELETE SET NULL,
 run_id uuid REFERENCES playne_games(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(day,browser_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS playne_line_one_daily_account ON playne_line_days(day,owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_line_days_run ON playne_line_days(run_id);
CREATE TABLE IF NOT EXISTS playne_brain_packs (
 day date NOT NULL, game text NOT NULL CHECK(game IN('flash','rotate','slide','dispatch')),
 version integer NOT NULL CHECK(version=1), challenge jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(day,game,version)
);
CREATE TABLE IF NOT EXISTS playne_brain_days (
 day date NOT NULL, game text NOT NULL CHECK(game IN('flash','rotate','slide','dispatch')),
 browser_hash char(64) NOT NULL, owner_id uuid REFERENCES playne_users(id) ON DELETE SET NULL,
 run_id uuid REFERENCES playne_games(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(day,game,browser_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS playne_brain_one_daily_account ON playne_brain_days(day,game,owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_brain_days_run ON playne_brain_days(run_id);
CREATE INDEX IF NOT EXISTS playne_brain_completed_history ON playne_games(owner_id,completed_at DESC) WHERE game IN('flash','rotate','slide','dispatch') AND completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_brain_private_history ON playne_games(owner_id,created_at DESC) WHERE game IN('flash','rotate','slide','dispatch');
ALTER TABLE playne_oauth_states ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE playne_oauth_states ADD COLUMN IF NOT EXISTS email_consent_version text;
CREATE TABLE IF NOT EXISTS playne_email_contacts (
 user_id uuid PRIMARY KEY REFERENCES playne_users(id) ON DELETE CASCADE,
 email text, verified_at timestamptz, enabled boolean NOT NULL DEFAULT false,
 consent_at timestamptz, consent_version text, consent_source text,
 generation uuid NOT NULL DEFAULT gen_random_uuid(), requested_at timestamptz,
 variant text NOT NULL CHECK(variant IN('A','B','C')),
 experiment text NOT NULL DEFAULT 'rank-email-design-v1',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT enabled OR (email IS NOT NULL AND verified_at IS NOT NULL AND consent_at IS NOT NULL))
);
ALTER TABLE playne_email_contacts ADD COLUMN IF NOT EXISTS provider_unsubscribed boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS playne_email_one_address ON playne_email_contacts(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS playne_email_generation ON playne_email_contacts(generation);
CREATE TABLE IF NOT EXISTS playne_email_consents (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES playne_users(id) ON DELETE CASCADE,
 action text NOT NULL, version text NOT NULL, source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS playne_email_suppressions (
 address_hash char(64) PRIMARY KEY, reason text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '180 days'
);
CREATE TABLE IF NOT EXISTS playne_email_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES playne_users(id) ON DELETE CASCADE,
 cause_id uuid NOT NULL REFERENCES playne_games(id) ON DELETE CASCADE,
 game text NOT NULL, mode text NOT NULL, version integer NOT NULL,
 old_place integer NOT NULL, new_place integer NOT NULL,
 score_units integer NOT NULL, opponent_units integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), handled_at timestamptz,
 UNIQUE(user_id,cause_id,game,mode,version)
);
CREATE INDEX IF NOT EXISTS playne_email_event_queue ON playne_email_events(user_id,created_at) WHERE handled_at IS NULL;
CREATE TABLE IF NOT EXISTS playne_email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES playne_users(id) ON DELETE CASCADE,
 generation uuid NOT NULL, kind text NOT NULL CHECK(kind IN('verify','rank')),
 variant text NOT NULL CHECK(variant IN('A','B','C')), experiment text NOT NULL,
 event_ids uuid[] NOT NULL DEFAULT '{}', payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','accepted','uncertain','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz, provider_job text, delivered_at timestamptz,
 raw_click_at timestamptz, visited_at timestamptz, game_started_at timestamptz,
 game_completed_at timestamptz, unsubscribed_at timestamptz, complaint_at timestamptz,
 failure_code text
);
CREATE UNIQUE INDEX IF NOT EXISTS playne_email_one_pending ON playne_email_outbox(user_id,kind) WHERE status IN('pending','sending','uncertain');
CREATE INDEX IF NOT EXISTS playne_email_pending ON playne_email_outbox(available_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS playne_email_frequency ON playne_email_outbox(user_id,submitted_at) WHERE kind='rank' AND submitted_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS playne_email_callbacks (
 digest char(64) PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE playne_games ADD COLUMN IF NOT EXISTS email_origin uuid REFERENCES playne_email_outbox(id) ON DELETE SET NULL;
-- challenges
CREATE TABLE IF NOT EXISTS playne_challenges (
 token varchar(43) PRIMARY KEY CHECK(token ~ '^[A-Za-z0-9_-]{43}$'),
 run_id uuid NOT NULL UNIQUE REFERENCES playne_games(id) ON DELETE CASCADE,
 created_by uuid REFERENCES playne_users(id) ON DELETE CASCADE,
 browser_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);

-- reminders
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

CREATE INDEX IF NOT EXISTS playne_comparison_owner ON playne_games(owner_id,game,(challenge->>'comparisonToken'),created_at) WHERE challenge->>'comparison'='true';
ALTER TABLE playne_challenges ADD COLUMN IF NOT EXISTS short_code varchar(16);
CREATE UNIQUE INDEX IF NOT EXISTS playne_challenges_short_code ON playne_challenges(short_code);
COMMIT;
