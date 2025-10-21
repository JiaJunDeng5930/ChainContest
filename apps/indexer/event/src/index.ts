import process from 'node:process';
import { clearInterval, setInterval as scheduleInterval } from 'node:timers';
import { bootstrapContext } from './bootstrap/context.js';
import { loadConfig } from './config/loadConfig.js';
import { createContestGateway } from './bootstrap/contestGatewayFactory.js';
import { createRootLogger } from './telemetry/logging.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const rootLogger = createRootLogger({ environment: config.environment });
  const contestGateway = createContestGateway({
    config,
    logger: rootLogger.child({ component: 'contestGateway' }),
  });
  const context = bootstrapContext({
    config,
    logger: rootLogger,
    contestGateway,
  });

  await context.start();

  const initialSnapshot = context.health.snapshot();
  context.logger.info(
    {
      streams: initialSnapshot.streams.map((stream) => ({
        contestId: stream.contestId,
        chainId: stream.chainId,
        mode: stream.mode,
      })),
    },
    'indexer event service started',
  );

  const executeCycle = async () => {
    try {
      await context.runLiveCycle();
    } catch (error) {
      context.logger.error(
        { err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } },
        'live ingestion cycle failed',
      );
    }
  };

  await executeCycle();

  const interval = scheduleInterval(() => {
    void executeCycle();
  }, context.config.service.pollIntervalMs);

  const shutdown = async () => {
    clearInterval(interval);
    context.registry.list().forEach((stream) => {
      context.health.setMode(stream, 'paused');
    });
    await context.shutdown();
    context.logger.info({ status: context.health.getHealth() }, 'indexer event service stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Indexer failed to start', error);
  process.exit(1);
});
