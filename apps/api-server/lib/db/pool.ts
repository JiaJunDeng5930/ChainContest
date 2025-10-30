import { getConnectionPool, isInitialised, shutdown } from '@chaincontest/db';

type DbPool = ReturnType<typeof getConnectionPool>;

export const getPool = (): DbPool => {
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
