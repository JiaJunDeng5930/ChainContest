import process from 'node:process';
import { createApp } from './bootstrap/app.js';
import { getLogger } from './telemetry/logger.js';

const app = createApp();
const logger = app.logger ?? getLogger();

const start = async (): Promise<void> => {
  try {
    await app.start();
  } catch (error) {
    logger.fatal({ err: serialiseError(error) }, 'failed to start indexer tasks application');
    process.exit(1);
  }
};

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'received shutdown signal, stopping application');
  try {
    await app.stop();
    logger.info('indexer tasks application stopped gracefully');
    process.exit(0);
  } catch (error) {
    logger.error({ err: serialiseError(error) }, 'error during shutdown');
    process.exit(1);
  }
};

const handleException = (error: unknown, origin: string): void => {
  logger.error({ err: serialiseError(error), origin }, 'unhandled exception');
};

process.on('uncaughtException', (error) => handleException(error, 'uncaughtException'));
process.on('unhandledRejection', (reason) => handleException(reason, 'unhandledRejection'));

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.once(signal, () => {
    void shutdown(signal);
  });
});

void start();

const serialiseError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return { message: String(error) };
};
