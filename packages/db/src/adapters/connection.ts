import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type {
  NodePgDatabase,
  NodePgQueryResultHKT,
  NodePgSession,
  NodePgTransaction,
  PgTransactionConfig
} from 'drizzle-orm/node-postgres';

type EmptySchema = Record<string, never>;

export type DrizzleDatabase<TSchema extends Record<string, unknown> = EmptySchema> = NodePgDatabase<TSchema>;

export type DrizzleTransaction<
  TSchema extends Record<string, unknown> = EmptySchema
> = NodePgTransaction<TSchema, NodePgSession, NodePgQueryResultHKT>;

export interface DatabasePoolOptions<TSchema extends Record<string, unknown> = EmptySchema> {
  connectionString: string;
  schema?: TSchema;
  pool?: Pick<PoolConfig, 'max' | 'min' | 'idleTimeoutMillis' | 'connectionTimeoutMillis'>;
  logger?: boolean;
}

export interface DatabasePool<TSchema extends Record<string, unknown> = EmptySchema> {
  readonly pool: Pool;
  readonly db: DrizzleDatabase<TSchema>;
  withTransaction<TResult>(
    runner: (tx: DrizzleTransaction<TSchema>) => Promise<TResult>,
    config?: PgTransactionConfig
  ): Promise<TResult>;
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

  async function withTransaction<TResult>(
    runner: (tx: DrizzleTransaction<TSchema>) => Promise<TResult>,
    config?: PgTransactionConfig
  ): Promise<TResult> {
    const isolationLevel = config?.isolationLevel ?? READ_COMMITTED;
    return db.transaction(
      (tx) => runner(tx),
      {
        ...config,
        isolationLevel
      }
    );
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
