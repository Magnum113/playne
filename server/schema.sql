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
 game text NOT NULL CHECK(game IN('naglaz','circle','colorfle','geo','pressure')),
 version integer NOT NULL DEFAULT 1, challenge jsonb NOT NULL, answers jsonb NOT NULL DEFAULT '[]',
 score_units integer, completed_at timestamptz, published_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(score_units IS NULL OR score_units BETWEEN 0 AND 5000),
 CHECK(published_at IS NULL OR (completed_at IS NOT NULL AND owner_id IS NOT NULL AND score_units IS NOT NULL))
);
ALTER TABLE playne_games DROP CONSTRAINT IF EXISTS playne_games_game_check;
ALTER TABLE playne_games ADD CONSTRAINT playne_games_game_check CHECK(game IN('naglaz','circle','colorfle','geo','pressure'));
ALTER TABLE playne_games ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'classic';
ALTER TABLE playne_games DROP CONSTRAINT IF EXISTS playne_games_score_units_check;
ALTER TABLE playne_games ADD CONSTRAINT playne_games_score_units_check CHECK(score_units IS NULL OR score_units BETWEEN 0 AND 250000);
CREATE INDEX IF NOT EXISTS playne_games_modes ON playne_games(game,version,mode,score_units DESC,completed_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_games_leaderboard ON playne_games(game,version,score_units DESC,completed_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_games_owner ON playne_games(owner_id,completed_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS playne_games_expiry ON playne_games(expires_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS playne_sessions_expiry ON playne_auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS playne_color_score_backups (
 game_id uuid PRIMARY KEY REFERENCES playne_games(id) ON DELETE CASCADE,
 version integer NOT NULL, answers jsonb NOT NULL, score_units integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
