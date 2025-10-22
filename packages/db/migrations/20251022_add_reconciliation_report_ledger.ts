import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from 'drizzle-orm/node-postgres/migrator';

const createStatusEnum = sql`
  DO $$
  BEGIN
    CREATE TYPE reconciliation_report_status AS ENUM ('pending_review', 'in_review', 'resolved', 'needs_attention');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END
  $$;
`;

const dropStatusEnum = sql`DROP TYPE IF EXISTS reconciliation_report_status;`;

const createTable = sql`
  CREATE TABLE IF NOT EXISTS reconciliation_report_ledgers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key text NOT NULL,
    report_id text NOT NULL,
    job_id text NOT NULL,
    contest_id text NOT NULL,
    chain_id integer NOT NULL,
    range_from_block text NOT NULL,
    range_to_block text NOT NULL,
    generated_at timestamptz NOT NULL,
    status reconciliation_report_status NOT NULL DEFAULT 'pending_review',
    attempts integer NOT NULL DEFAULT 0,
    differences jsonb NOT NULL DEFAULT '[]'::jsonb,
    notifications jsonb NOT NULL DEFAULT '[]'::jsonb,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor_context jsonb,
    last_error jsonb,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reconciliation_report_idempotency_key_unique UNIQUE (idempotency_key),
    CONSTRAINT reconciliation_report_id_unique UNIQUE (report_id),
    CONSTRAINT reconciliation_report_job_id_unique UNIQUE (job_id),
    CONSTRAINT reconciliation_report_chain_id_non_negative CHECK (chain_id >= 0)
  );
`;

const dropTable = sql`DROP TABLE IF EXISTS reconciliation_report_ledgers;`;

const createIndexes = sql`
  CREATE INDEX IF NOT EXISTS reconciliation_report_status_idx ON reconciliation_report_ledgers (status);
  CREATE INDEX IF NOT EXISTS reconciliation_report_updated_at_idx ON reconciliation_report_ledgers (updated_at DESC);
  CREATE INDEX IF NOT EXISTS reconciliation_report_contest_idx ON reconciliation_report_ledgers (contest_id, chain_id);
`;

const dropIndexes = sql`
  DROP INDEX IF EXISTS reconciliation_report_status_idx;
  DROP INDEX IF EXISTS reconciliation_report_updated_at_idx;
  DROP INDEX IF EXISTS reconciliation_report_contest_idx;
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
