import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { getEnv } from '@/lib/config/env';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-redundant-type-constituents */

let pool: Pool | null = null;

const buildPool = (): Pool => {
  const env = getEnv();
  const config: PoolConfig = {
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  };

  const pgPool = new Pool(config);
  return pgPool;
};

export const getPool = (): Pool => {
  if (!pool) {
    pool = buildPool();
  }

  return pool;
};

export const resetPool = async (): Promise<void> => {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  await currentPool.end();
  pool = null;
};
