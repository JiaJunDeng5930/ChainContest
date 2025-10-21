import PgBoss from 'pg-boss';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/loadConfig.js';

type PgBossSendOptions = Record<string, unknown>;

export interface QueueClientOptions {
  config: AppConfig;
  logger: Logger;
}

export interface QueueHealthState {
  status: 'stopped' | 'ready' | 'error';
  lastError?: {
    message: string;
  };
}

export interface QueueClient {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  getHealth: () => QueueHealthState;
  send: <TPayload>(queueName: string, payload: TPayload, options?: PgBossSendOptions) => Promise<string | null>;
  schedule: <TPayload>(
    queueName: string,
    cron: string,
    payload: TPayload,
    options?: PgBossSendOptions,
  ) => Promise<string>;
  cancel: (jobId: string) => Promise<void>;
}

export class QueueClientError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'QueueClientError';
  }
}

export const createQueueClient = (options: QueueClientOptions): QueueClient => {
  const { config, logger } = options;

  let boss: PgBoss | null = null;
  let running = false;
  let lastError: Error | null = null;

  const start = async (): Promise<void> => {
    if (running) {
      return;
    }

    boss = new PgBoss({
      connectionString: config.queue.url,
      application_name: 'indexer-event',
      retryLimit: 3,
      retryDelay: 60,
      newJobCheckInterval: 1000,
    });

    boss.on('error', (error: unknown) => {
      const normalised = normaliseError(error);
      lastError = normalised;
      logger.error({ err: errorToLogPayload(normalised) }, 'pg-boss encountered an error');
    });

    try {
      await boss.start();
      running = true;
      lastError = null;
      logger.info('pg-boss connection established');
    } catch (error) {
      running = false;
      boss = null;
      lastError = normaliseError(error);
      logger.error({ err: errorToLogPayload(lastError) }, 'failed to start pg-boss');
      throw new QueueClientError('Failed to start pg-boss client', error);
    }
  };

  const stop = async (): Promise<void> => {
    if (!boss || !running) {
      return;
    }

    await boss.stop();
    running = false;
    boss = null;
    logger.info('pg-boss connection stopped');
  };

  const ensureRunning = (): PgBoss => {
    if (!boss || !running) {
      throw new QueueClientError('pg-boss client is not running');
    }
    return boss;
  };

  const send = async <TPayload>(
    queueName: string,
    payload: TPayload,
    options?: PgBossSendOptions,
  ): Promise<string | null> => ensureRunning().send(queueName, payload, options);

  const schedule = async <TPayload>(
    queueName: string,
    cron: string,
    payload: TPayload,
    options?: PgBossSendOptions,
  ): Promise<string> => ensureRunning().schedule(queueName, cron, payload, options);

  const cancel = async (jobId: string): Promise<void> => {
    await ensureRunning().cancel(jobId);
  };

  const getHealth = (): QueueHealthState => {
    if (!running) {
      return { status: 'stopped', lastError: lastError ? { message: lastError.message } : undefined };
    }

    return lastError ? { status: 'error', lastError: { message: lastError.message } } : { status: 'ready' };
  };

  return {
    start,
    stop,
    isRunning: () => running,
    getHealth,
    send,
    schedule,
    cancel,
  };
};

const normaliseError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown pg-boss error');
};

const errorToLogPayload = (error: Error): Record<string, unknown> => ({
  message: error.message,
  stack: error.stack,
});
