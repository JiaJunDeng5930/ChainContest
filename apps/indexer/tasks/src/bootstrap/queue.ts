import PgBoss from 'pg-boss';
import type { Job, PublishOptions, WorkOptions } from 'pg-boss';
import type { Logger } from 'pino';
import { getConfig, type TasksConfig } from './config.js';
import { getLogger, getJobLogger } from '../telemetry/logger.js';

export class QueueBootstrapError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'QueueBootstrapError';
  }
}

export interface QueueInitOptions {
  config?: TasksConfig;
  logger?: Logger;
}

export interface WorkerRegistrationOptions<TPayload> {
  concurrency?: number;
  teamSize?: number;
  includeMetadata?: boolean;
  lockDuration?: number;
  keyResolver?: (job: Job<TPayload>) => string | null | undefined;
  onError?: (error: unknown, job: Job<TPayload>) => Promise<void> | void;
  onComplete?: (job: Job<TPayload>) => Promise<void> | void;
}

export interface PublishJobOptions extends PublishOptions {
  dedupeKey?: string;
}

export interface QueueStateCounts {
  created: number;
  retry: number;
  active: number;
  completed: number;
  expired: number;
  cancelled: number;
  failed: number;
}

export interface QueueStatesSnapshot {
  overall: QueueStateCounts;
  queues: Record<string, QueueStateCounts>;
}

const TERMINATION_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

let bossInstance: PgBoss | null = null;
let queueConfig: TasksConfig | null = null;
let queueLogger: Logger | null = null;
let running = false;
let signalsRegistered = false;

class SerialExecutor {
  private chains = new Map<string, Promise<void>>();

  run(taskKey: string, handler: () => Promise<void>): Promise<void> {
    const previous = this.chains.get(taskKey) ?? Promise.resolve();

    const chain = previous.catch(() => undefined).then(handler);

    const tracked = chain
      .catch(() => undefined)
      .finally(() => {
        if (this.chains.get(taskKey) === tracked) {
          this.chains.delete(taskKey);
        }
      });

    this.chains.set(taskKey, tracked);
    return chain;
  }
}

const resolveQueueTimings = (
  config: TasksConfig,
): {
  fetchIntervalMs: number;
  pollIntervalSeconds: number;
  retryDelaySeconds: number;
} => {
  const fetchIntervalMs = Math.max(100, config.queue.fetchIntervalMs);
  const pollIntervalSeconds = Math.max(0.1, fetchIntervalMs / 1000);
  const retryDelaySeconds = Math.max(1, Math.round(pollIntervalSeconds));
  return {
    fetchIntervalMs,
    pollIntervalSeconds,
    retryDelaySeconds,
  };
};

export const bootstrapQueue = async (options: QueueInitOptions = {}): Promise<void> => {
  if (running && bossInstance) {
    return;
  }

  const config = options.config ?? getConfig();
  const logger = options.logger ?? getLogger();

  const retryLimit = Math.max(0, config.thresholds.rpcFailure - 1);
  const { fetchIntervalMs, pollIntervalSeconds, retryDelaySeconds } =
    resolveQueueTimings(config);

  const boss = new PgBoss({
    connectionString: config.queue.url,
    application_name: 'indexer-tasks',
    retryLimit,
    retryDelay: retryDelaySeconds,
    newJobCheckInterval: pollIntervalSeconds,
  });

  boss.on('error', (error: unknown) => {
    logger.error({ err: serializeError(error) }, 'pg-boss emitted an error');
  });

  try {
    await boss.start();
    bossInstance = boss;
    queueConfig = config;
    queueLogger = logger;
    running = true;
    registerSignalHandlers(logger);
    logger.info('pg-boss connection established');
  } catch (error) {
    bossInstance = null;
    running = false;
    logger.error({ err: serializeError(error) }, 'failed to start pg-boss client');
    throw new QueueBootstrapError('Failed to bootstrap pg-boss client', error);
  }
};

export const shutdownQueue = async (): Promise<void> => {
  if (!bossInstance || !running) {
    return;
  }

  await bossInstance.stop();
  bossInstance = null;
  running = false;
  queueLogger?.info('pg-boss connection closed');
};

export const isQueueRunning = (): boolean => running;

export const publishJob = async <TPayload>(
  queueName: string,
  payload: TPayload,
  options: PublishJobOptions = {}
): Promise<string | null> => {
  const boss = ensureBoss();
  const config = ensureConfig();

  const { dedupeKey, ...publishOptions } = options;
  if (!publishOptions.singletonKey && dedupeKey) {
    publishOptions.singletonKey = buildSingletonKey(config, queueName, dedupeKey);
  }

  return boss.send(queueName, payload, publishOptions);
};

export const registerWorker = async <TPayload>(
  queueName: string,
  handler: (job: Job<TPayload>) => Promise<void>,
  options: WorkerRegistrationOptions<TPayload> = {}
): Promise<void> => {
  const boss = ensureBoss();
  const config = ensureConfig();
  const logger = ensureLogger();
  const { fetchIntervalMs, pollIntervalSeconds } = resolveQueueTimings(config);

  const serialExecutor = options.keyResolver ? new SerialExecutor() : null;

  const teamSize = Math.max(1, Math.trunc(options.teamSize ?? options.concurrency ?? config.queue.concurrency));
  const workOptions: WorkOptions = {
    teamSize,
    includeMetadata: options.includeMetadata ?? true,
    lockDuration: options.lockDuration,
    newJobCheckInterval: pollIntervalSeconds,
  };

  await boss.work<TPayload>(queueName, workOptions, async (job) => {
    const jobLogger = getJobLogger({
      jobId: job.id,
      queueName,
      attempt: job.retrycount,
    });

    const execute = async (): Promise<void> => {
      try {
        await handler(job);
        await options.onComplete?.(job);
      } catch (error) {
        await options.onError?.(error, job);
        jobLogger.error({ err: serializeError(error) }, 'queue worker failed');
        throw error;
      }
    };

    const key = options.keyResolver?.(job) ?? null;
    if (serialExecutor && key) {
      await serialExecutor.run(key, execute);
      return;
    }

    await execute();
  });

  logger.info({ queue: queueName }, 'queue worker registered');
};

export const getQueueStates = async (): Promise<QueueStatesSnapshot> => {
  const boss = ensureBoss();
  const counts = (await boss.countStates()) as Partial<QueueStateCounts> & {
    queues?: Record<string, Partial<QueueStateCounts>>;
  };

  const queues = counts.queues ?? {};

  return {
    overall: normaliseCounts(counts),
    queues: Object.fromEntries(
      Object.entries(queues).map(([name, snapshot]) => [name, normaliseCounts(snapshot)])
    )
  };
};

const registerSignalHandlers = (logger: Logger): void => {
  if (signalsRegistered) {
    return;
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'received termination signal, shutting down queue');
    try {
      await shutdownQueue();
    } catch (error) {
      logger.error({ err: serializeError(error) }, 'error during queue shutdown');
    }
  };

  TERMINATION_SIGNALS.forEach((signal) => {
    process.once(signal, () => {
      void shutdown(signal);
    });
  });

  process.once('beforeExit', () => {
    if (running) {
      void shutdown('beforeExit');
    }
  });

  signalsRegistered = true;
};

const ensureBoss = (): PgBoss => {
  if (!bossInstance || !running) {
    throw new QueueBootstrapError('pg-boss client is not running');
  }
  return bossInstance;
};

const ensureConfig = (): TasksConfig => {
  if (!queueConfig) {
    queueConfig = getConfig();
  }
  return queueConfig;
};

const ensureLogger = (): Logger => {
  if (!queueLogger) {
    queueLogger = getLogger();
  }
  return queueLogger;
};

const buildSingletonKey = (config: TasksConfig, queue: string, key: string): string =>
  `${config.queue.singletonGroup}:${queue}:${key}`;

const normaliseCounts = (input: Partial<QueueStateCounts> | undefined): QueueStateCounts => ({
  created: coerceCount(input?.created),
  retry: coerceCount(input?.retry),
  active: coerceCount(input?.active),
  completed: coerceCount(input?.completed),
  expired: coerceCount(input?.expired),
  cancelled: coerceCount(input?.cancelled),
  failed: coerceCount(input?.failed)
});

const coerceCount = (value: number | undefined): number => {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
};

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
};
