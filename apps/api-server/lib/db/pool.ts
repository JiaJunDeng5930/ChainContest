import type { Pool } from 'pg';
import { getConnectionPool, isInitialised, shutdown } from '@chaincontest/db';

export const getPool = (): Pool => {
  if (!isInitialised()) {
    throw new Error('packages/db has not been initialised');
  }

  return getConnectionPool();
};

export const resetPool = async (): Promise<void> => {
  if (!isInitialised()) {
    return;
  }

  await shutdown();
};

