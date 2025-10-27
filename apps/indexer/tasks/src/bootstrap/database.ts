import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Logger } from 'pino';
import {
  init as initDatabase,
  shutdown as shutdownDatabase,
  isInitialised as isDatabaseInitialised,
  type DbInitOptions,
  type ErrorLogger,
  type MetricsHook,
  type DbError
} from '@chaincontest/db';
import { getConfig, type TasksConfig } from './config.js';
import { getLogger } from '../telemetry/logger.js';

export class DatabaseBootstrapError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'DatabaseBootstrapError';
  }
}

interface ValidationArtifacts {
  registry: unknown;
  overrides?: unknown;
}

export interface DatabaseInitOptions {
  config?: TasksConfig;
  logger?: Logger;
  metricsHook?: MetricsHook | null;
}

let ready = false;
let cachedArtifacts: ValidationArtifacts | null = null;

export const bootstrapDatabase = async (options: DatabaseInitOptions = {}): Promise<void> => {
  if (ready || isDatabaseInitialised()) {
    ready = true;
    return;
  }

  const config = options.config ?? getConfig();
  const logger = options.logger ?? getLogger();

  try {
    const validators = await loadValidationArtifacts(config);

    const initOptions: DbInitOptions = {
      databaseUrl: config.database.url,
      logger: false,
      validators: {
        registry: validators.registry,
        overrides: validators.overrides,
        environmentId: config.validation.environmentId
      },
      metricsHook: options.metricsHook ?? null,
      errorLogger: createErrorLogger(logger)
    };

    await initDatabase(initOptions);
    ready = true;
    logger.info({ database: maskConnectionString(config.database.url) }, 'database connection initialised');
  } catch (error) {
    ready = false;
    logger.error({ err: serialiseError(error) }, 'failed to initialise database connection');
    throw new DatabaseBootstrapError('Failed to bootstrap database connection', error);
  }
};

export const shutdownDatabaseConnection = async (logger: Logger = getLogger()): Promise<void> => {
  if (!ready && !isDatabaseInitialised()) {
    return;
  }

  await shutdownDatabase();
  ready = false;
  logger.info('database connection closed');
};

export const isDatabaseReady = (): boolean => ready || isDatabaseInitialised();

const loadValidationArtifacts = async (config: TasksConfig): Promise<ValidationArtifacts> => {
  if (cachedArtifacts) {
    return cachedArtifacts;
  }

  const { registryPath, overridesPath } = config.validation;

  if (!registryPath) {
    throw new DatabaseBootstrapError('TASKS_VALIDATION_REGISTRY_PATH must be provided to initialise database validators');
  }

  if (!overridesPath) {
    throw new DatabaseBootstrapError(
      'TASKS_VALIDATION_OVERRIDES_PATH must be provided to initialise database validators'
    );
  }

  const registry = await loadValidationResource(registryPath, 'validation registry');
  const overrides = await loadValidationResource(overridesPath, 'validation overrides');

  cachedArtifacts = { registry, overrides };
  return cachedArtifacts;
};

const moduleRequire = createRequire(import.meta.url);

const loadValidationResource = async (inputPath: string, description: string): Promise<unknown> => {
  const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);

  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === '.json') {
    try {
      const raw = await fs.readFile(absolutePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DatabaseBootstrapError(`Unable to load ${description} from ${absolutePath}: ${reason}`, error);
    }
  }

  try {
    const loaded = moduleRequire(absolutePath);
    return loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DatabaseBootstrapError(`Unable to require ${description} from ${absolutePath}: ${reason}`, error);
  }
};

const createErrorLogger = (logger: Logger): ErrorLogger => (error: DbError) => {
  logger.error(
    {
      err: {
        message: error.message,
        code: error.code,
        detail: error.detail
      }
    },
    'database operation failed'
  );
};

const maskConnectionString = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    if (url.username) {
      url.username = '***';
    }
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return connectionString;
  }
};

const serialiseError = (error: unknown): Record<string, unknown> => {
  if (error instanceof DatabaseBootstrapError && error.cause instanceof Error) {
    return serialiseError(error.cause);
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return { message: String(error) };
};
