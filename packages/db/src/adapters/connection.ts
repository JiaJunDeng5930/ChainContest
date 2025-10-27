import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core/session.js';

type EmptySchema = Record<string, never>;

type TransactionRunner<TSchema extends Record<string, unknown>> =
  Parameters<NodePgDatabase<TSchema>['transaction']>[0];

type TransactionScope<TSchema extends Record<string, unknown>> =
  TransactionRunner<TSchema> extends (tx: infer TTx, ...args: unknown[]) => Promise<unknown> ? TTx : never;

type RunnerResult<TSchema extends Record<string, unknown>, TRunner extends TransactionRunner<TSchema>> =
  TRunner extends (tx: TransactionScope<TSchema>, ...args: unknown[]) => Promise<infer TResult> ? TResult : never;

export type DrizzleDatabase<TSchema extends Record<string, unknown> = EmptySchema> = NodePgDatabase<TSchema>;

export type DrizzleTransaction<TSchema extends Record<string, unknown> = EmptySchema> =
  TransactionScope<TSchema>;

export interface DatabasePoolOptions<TSchema extends Record<string, unknown> = EmptySchema> {
  connectionString: string;
  schema?: TSchema;
  pool?: Pick<PoolConfig, 'max' | 'min' | 'idleTimeoutMillis' | 'connectionTimeoutMillis'>;
  logger?: boolean;
}

export interface DatabasePool<TSchema extends Record<string, unknown> = EmptySchema> {
  readonly pool: Pool;
  readonly db: DrizzleDatabase<TSchema>;
  withTransaction<TRunner extends TransactionRunner<TSchema>>(
    runner: TRunner,
    config?: PgTransactionConfig
  ): Promise<RunnerResult<TSchema, TRunner>>;
  close(): Promise<void>;
}

const READ_COMMITTED: PgTransactionConfig['isolationLevel'] = 'read committed';

export function createDatabasePool<TSchema extends Record<string, unknown> = EmptySchema>(
  options: DatabasePoolOptions<TSchema>
): DatabasePool<TSchema> {
  const { connectionString, pool: poolOptions, schema, logger } = options;

  if (!connectionString) {
    throw new Error('Database connection string must be provided.');
  }

  const pgPool = new Pool({
    connectionString,
    max: poolOptions?.max,
    min: poolOptions?.min,
    idleTimeoutMillis: poolOptions?.idleTimeoutMillis,
    connectionTimeoutMillis: poolOptions?.connectionTimeoutMillis
  });

  const db = drizzle(pgPool, {
    schema,
    logger
  });

  async function withTransaction<TRunner extends TransactionRunner<TSchema>>(
    runner: TRunner,
    config?: PgTransactionConfig
  ): Promise<RunnerResult<TSchema, TRunner>> {
    const isolationLevel = config?.isolationLevel ?? READ_COMMITTED;
    return db.transaction(runner, {
      ...config,
      isolationLevel
    }) as Promise<RunnerResult<TSchema, TRunner>>;
  }

  async function close(): Promise<void> {
    await pgPool.end();
  }

  return {
    pool: pgPool,
    db,
    withTransaction,
    close
  };
}
