CREATE TYPE contest_status AS ENUM ('registered', 'active', 'sealed', 'settled');
CREATE TYPE contest_origin_tag AS ENUM ('factory', 'imported');

CREATE TABLE contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  internal_key TEXT,
  status contest_status NOT NULL DEFAULT 'registered',
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  origin_tag contest_origin_tag NOT NULL DEFAULT 'factory',
  sealed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT contests_contract_address_format CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT contests_time_window_order CHECK (time_window_start <= time_window_end)
);

CREATE UNIQUE INDEX contests_chain_contract_unique ON contests (chain_id, contract_address);
CREATE UNIQUE INDEX contests_internal_key_unique ON contests (internal_key) WHERE internal_key IS NOT NULL;
CREATE INDEX contests_status_window_idx ON contests (status, time_window_start, time_window_end);
CREATE INDEX contests_metadata_keywords_idx ON contests USING gin ((metadata -> 'keywords'));

CREATE TABLE contest_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  cursor_height BIGINT NOT NULL,
  payload JSONB NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX contest_snapshots_cursor_unique ON contest_snapshots (contest_id, cursor_height);
CREATE INDEX contest_snapshots_effective_idx ON contest_snapshots (contest_id, effective_at DESC);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  vault_reference TEXT,
  amount_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_locator JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT participants_wallet_format CHECK (wallet_address ~ '^0x[0-9a-zA-Z]{1,64}$'),
  CONSTRAINT participants_amount_non_negative CHECK (amount_wei >= 0),
  CONSTRAINT participants_event_locator_shape CHECK (event_locator ? 'tx_hash' AND event_locator ? 'log_index')
);

CREATE UNIQUE INDEX participants_event_unique
  ON participants (contest_id, (event_locator ->> 'tx_hash'), (event_locator ->> 'log_index'));
CREATE INDEX participants_contest_time_idx ON participants (contest_id, occurred_at);
CREATE INDEX participants_wallet_idx ON participants (wallet_address);

CREATE TABLE leaderboard_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  entries JSONB NOT NULL,
  written_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT leaderboard_versions_positive_version CHECK (version > 0)
);

CREATE UNIQUE INDEX leaderboard_versions_unique ON leaderboard_versions (contest_id, version);
CREATE INDEX leaderboard_versions_written_idx ON leaderboard_versions (contest_id, written_at DESC);

CREATE TABLE reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  amount_wei NUMERIC(78, 0) NOT NULL DEFAULT 0,
  event_locator JSONB NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT reward_claims_wallet_format CHECK (wallet_address ~ '^0x[0-9a-zA-Z]{1,64}$'),
  CONSTRAINT reward_claims_event_locator_shape CHECK (event_locator ? 'tx_hash' AND event_locator ? 'log_index')
);

CREATE UNIQUE INDEX reward_claims_event_unique
  ON reward_claims (contest_id, (event_locator ->> 'tx_hash'), (event_locator ->> 'log_index'));
CREATE INDEX reward_claims_claimed_idx ON reward_claims (contest_id, claimed_at);
CREATE INDEX reward_claims_wallet_idx ON reward_claims (wallet_address);

CREATE TRIGGER contests_set_updated_at
BEFORE UPDATE ON contests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER contest_snapshots_set_updated_at
BEFORE UPDATE ON contest_snapshots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER participants_set_updated_at
BEFORE UPDATE ON participants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER leaderboard_versions_set_updated_at
BEFORE UPDATE ON leaderboard_versions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reward_claims_set_updated_at
BEFORE UPDATE ON reward_claims
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
