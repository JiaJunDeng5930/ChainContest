import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from 'drizzle-orm/node-postgres/migrator';

const createStatusEnum = sql`
  DO $$
  BEGIN
    CREATE TYPE milestone_execution_status AS ENUM ('pending', 'in_progress', 'succeeded', 'retrying', 'needs_attention');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END
  $$;
`;

const dropStatusEnum = sql`DROP TYPE IF EXISTS milestone_execution_status;`;

const createTable = sql`
  CREATE TABLE IF NOT EXISTS milestone_execution_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key text NOT NULL,
    job_id text NOT NULL,
    contest_id text NOT NULL,
    chain_id integer NOT NULL,
    milestone text NOT NULL,
    source_tx_hash text NOT NULL,
    source_log_index integer NOT NULL,
    source_block_number text NOT NULL,
    status milestone_execution_status NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error jsonb,
    actor_context jsonb,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT milestone_execution_unique_event UNIQUE (contest_id, chain_id, milestone, source_tx_hash, source_log_index),
    CONSTRAINT milestone_execution_idempotency_key_unique UNIQUE (idempotency_key),
    CONSTRAINT milestone_execution_job_id_unique UNIQUE (job_id),
    CONSTRAINT milestone_execution_tx_hash_format CHECK (source_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
    CONSTRAINT milestone_execution_source_log_index_non_negative CHECK (source_log_index >= 0),
    CONSTRAINT milestone_execution_chain_id_non_negative CHECK (chain_id >= 0)
  );
`;

const dropTable = sql`DROP TABLE IF EXISTS milestone_execution_records;`;

const createIndexes = sql`
  CREATE INDEX IF NOT EXISTS milestone_execution_status_idx ON milestone_execution_records (status);
  CREATE INDEX IF NOT EXISTS milestone_execution_updated_at_idx ON milestone_execution_records (updated_at DESC);
`;

const dropIndexes = sql`
  DROP INDEX IF EXISTS milestone_execution_status_idx;
  DROP INDEX IF EXISTS milestone_execution_updated_at_idx;
`;

export const up: MigrationExecutor = async (db) => {
  await db.execute(createStatusEnum);
  await db.execute(createTable);
  await db.execute(createIndexes);
};

export const down: MigrationExecutor = async (db) => {
  await db.execute(dropIndexes);
  await db.execute(dropTable);
  await db.execute(dropStatusEnum);
};

export default { up, down };
