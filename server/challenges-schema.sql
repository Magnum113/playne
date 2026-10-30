CREATE TABLE IF NOT EXISTS playne_challenges (
 token varchar(43) PRIMARY KEY CHECK(token ~ '^[A-Za-z0-9_-]{43}$'),
 run_id uuid NOT NULL UNIQUE REFERENCES playne_games(id) ON DELETE CASCADE,
 created_by uuid REFERENCES playne_users(id) ON DELETE CASCADE,
 browser_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS playne_comparison_owner ON playne_games(owner_id,game,(challenge->>'comparisonToken'),created_at) WHERE challenge->>'comparison'='true';
