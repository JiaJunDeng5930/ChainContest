CREATE TABLE ingestion_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  cursor_height BIGINT NOT NULL,
  cursor_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT ingestion_cursors_contract_format CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$')
);

CREATE UNIQUE INDEX ingestion_cursors_contest_unique ON ingestion_cursors (contest_id);
CREATE UNIQUE INDEX ingestion_cursors_locator_unique ON ingestion_cursors (chain_id, contract_address);

CREATE TABLE ingestion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests (id) ON DELETE CASCADE,
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT ingestion_events_hash_format CHECK (tx_hash ~ '^0x[0-9a-fA-F]{64}$')
);

CREATE UNIQUE INDEX ingestion_events_unique ON ingestion_events (chain_id, tx_hash, log_index);
CREATE INDEX ingestion_events_contest_idx ON ingestion_events (contest_id, occurred_at);

CREATE TRIGGER ingestion_cursors_set_updated_at
BEFORE UPDATE ON ingestion_cursors
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ingestion_events_set_updated_at
BEFORE UPDATE ON ingestion_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
