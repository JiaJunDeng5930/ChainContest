import type { Logger } from 'pino';
import {
  init as initDatabase,
  shutdown as shutdownDatabase,
  readIngestionStatus,
  writeContestDomain,
  writeIngestionEvent,
  recordContestDeploymentArtifact,
  updateContestCreationRequestStatus,
  type DbError,
  type DbInitOptions,
  type MetricsHook,
  type ReadIngestionStatusRequest,
  type ReadIngestionStatusResponse,
  type WriteContestDomainRequest,
  type WriteContestDomainResponse,
  type WriteIngestionEventResponse,
  type IngestionWriteAction,
  type RecordContestDeploymentArtifactRequest,
  type RecordContestDeploymentArtifactResponse,
  type UpdateContestCreationRequestStatusRequest,
  type UpdateContestCreationRequestStatusResponse,
} from '@chaincontest/db';
import type { AppConfig } from '../config/loadConfig.js';

export interface DbClientOptions {
  config: AppConfig;
  logger: Logger;
  metricsHook?: MetricsHook;
}

export interface DbClient {
  readonly isReady: boolean;
  init: () => Promise<void>;
  shutdown: () => Promise<void>;
  readIngestionStatus: (request: ReadIngestionStatusRequest) => Promise<ReadIngestionStatusResponse>;
  writeIngestionEvent: (action: IngestionWriteAction) => Promise<WriteIngestionEventResponse>;
  writeContestDomain: (request: WriteContestDomainRequest) => Promise<WriteContestDomainResponse>;
  recordContestDeploymentArtifact: (
    request: RecordContestDeploymentArtifactRequest
  ) => Promise<RecordContestDeploymentArtifactResponse>;
  updateContestCreationRequestStatus: (
    request: UpdateContestCreationRequestStatusRequest
  ) => Promise<UpdateContestCreationRequestStatusResponse>;
}

export class DbClientError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'DbClientError';
  }
}

type DbErrorLogger = (error: DbError) => void;

export const createDbClient = (options: DbClientOptions): DbClient => {
  const { config, logger, metricsHook } = options;
  let ready = false;

  const ensureRegistry = (): void => {
    if (!Array.isArray(config.validation.registry) || config.validation.registry.length === 0) {
      throw new DbClientError(
        'Validation registry is empty. Provide INDEXER_EVENT_VALIDATION_REGISTRY_PATH to bootstrap database validators.',
      );
    }
  };

  const errorLogger: DbErrorLogger = (error) => {
    logger.error(
      {
        err: {
          message: error.message,
          code: error.code,
          detail: error.detail,
        },
      },
      'database operation failed',
    );
  };

  const init = async (): Promise<void> => {
    if (ready) {
      return;
    }

    ensureRegistry();

    const options: DbInitOptions = {
      databaseUrl: config.database.url,
      logger: true,
      validators: {
        registry: config.validation.registry,
        overrides: config.validation.environmentOverrides,
        environmentId: config.validation.environmentId,
      },
      metricsHook: metricsHook ?? null,
      errorLogger,
    };

    try {
      await initDatabase(options);
      ready = true;
      logger.info({ databaseUrl: maskConnectionString(config.database.url) }, 'database connection initialised');
    } catch (error) {
      ready = false;
      logger.error(
        { err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } },
        'failed to initialise database',
      );
      throw new DbClientError('Failed to initialise database client', error);
    }
  };

  const shutdown = async (): Promise<void> => {
    if (!ready) {
      return;
    }

    await shutdownDatabase();
    ready = false;
    logger.info('database connection closed');
  };

  return {
    get isReady() {
      return ready;
    },
    init,
    shutdown,
    readIngestionStatus,
    writeIngestionEvent,
    writeContestDomain,
    recordContestDeploymentArtifact,
    updateContestCreationRequestStatus,
  };
};

const maskConnectionString = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***';
    }
    if (url.username) {
      url.username = '***';
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};
