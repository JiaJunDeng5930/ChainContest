import { db } from '@chaincontest/db';
import { getEnv } from '@/lib/config/env';
import { buildDbValidatorOptions, type ValidatorRegistrationOptions } from '@/lib/db/validators';

interface DbPoolOptions {
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

interface DbInitOptions {
  databaseUrl: string;
  pool?: DbPoolOptions;
  logger?: boolean;
  validators: ValidatorRegistrationOptions;
  metricsHook?: ((event: unknown) => void) | null;
  errorLogger?: (error: unknown) => void;
}

interface InternalDb {
  init(options: DbInitOptions): Promise<void>;
  shutdown(): Promise<void>;
  isInitialised(): boolean;
  lookupUserWallet: (...args: unknown[]) => Promise<unknown>;
  mutateUserWallet: (...args: unknown[]) => Promise<unknown>;
  queryContests: (...args: unknown[]) => Promise<unknown>;
  queryUserContests: (...args: unknown[]) => Promise<unknown>;
  writeContestDomain: (...args: unknown[]) => Promise<unknown>;
  readIngestionStatus: (...args: unknown[]) => Promise<unknown>;
  writeIngestionEvent: (...args: unknown[]) => Promise<unknown>;
}

export type DatabaseClient = Pick<
  InternalDb,
  |
    'lookupUserWallet'
  | 'mutateUserWallet'
  | 'queryContests'
  | 'queryUserContests'
  | 'writeContestDomain'
  | 'readIngestionStatus'
  | 'writeIngestionEvent'
>;

const internalDb = db as unknown as InternalDb;

let initialisationPromise: Promise<void> | null = null;

const createInitOptions = (): DbInitOptions => {
  const env = getEnv();
  const logError = (error: unknown): void => {
    if (env.nodeEnv === 'test') {
      return;
    }

    if (error && typeof error === 'object') {
      const maybe = error as { code?: unknown; message?: unknown; detail?: unknown };
      const code = typeof maybe.code === 'string' ? maybe.code : 'UNKNOWN';
      const message = typeof maybe.message === 'string' ? maybe.message : 'Database error';
      const detail = maybe.detail ?? {};
      // eslint-disable-next-line no-console
      console.error('[db]', code, message, detail);
      return;
    }

    // eslint-disable-next-line no-console
    console.error('[db]', 'UNKNOWN', error);
  };

  return {
    databaseUrl: env.databaseUrl,
    validators: buildDbValidatorOptions({ environmentId: env.nodeEnv }),
    logger: env.nodeEnv !== 'production',
    metricsHook: null,
    errorLogger: logError
  };
};

export const initDatabase = async (): Promise<void> => {
  if (internalDb.isInitialised()) {
    return;
  }

  if (!initialisationPromise) {
    const options = createInitOptions();
    initialisationPromise = internalDb
      .init(options)
      .catch((error) => {
        // reset the cache on failure so that callers can retry
        initialisationPromise = null;
        throw error;
      })
      .then(() => {
        initialisationPromise = null;
      });
  }

  await initialisationPromise;
};

const ensureDatabase = (): DatabaseClient => {
  if (!internalDb.isInitialised()) {
    throw new Error('Database client has not been initialised');
  }

  return internalDb;
};

export const database: DatabaseClient = {
  lookupUserWallet(request) {
    return ensureDatabase().lookupUserWallet(request);
  },
  mutateUserWallet(request) {
    return ensureDatabase().mutateUserWallet(request);
  },
  queryContests(request) {
    return ensureDatabase().queryContests(request);
  },
  queryUserContests(request) {
    return ensureDatabase().queryUserContests(request);
  },
  writeContestDomain(request) {
    return ensureDatabase().writeContestDomain(request);
  },
  readIngestionStatus(request) {
    return ensureDatabase().readIngestionStatus(request);
  },
  writeIngestionEvent(request) {
    return ensureDatabase().writeIngestionEvent(request);
  }
};

export const shutdownDatabase = async (): Promise<void> => {
  if (internalDb.isInitialised()) {
    await internalDb.shutdown();
  }
};

export const withDatabase = async <T>(runner: (client: DatabaseClient) => Promise<T>): Promise<T> => {
  const client = ensureDatabase();
  return runner(client);
};
