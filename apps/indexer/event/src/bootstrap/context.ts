import type { Logger } from 'pino';
import { loadConfig, type AppConfig, resetConfigCache } from '../config/loadConfig.js';
import { createRootLogger, withIngestionBindings } from '../telemetry/logging.js';
import { createMetricsRegistry } from '../telemetry/metrics.js';
import { createDbClient, type DbClient } from '../services/dbClient.js';
import { createQueueClient, type QueueClient } from '../services/queueClient.js';
import { createHttpServer, type HttpServer } from '../server/httpServer.js';
import { IngestionRegistry, type RegistryStream } from '../services/ingestionRegistry.js';
import { ContestGatewayAdapter } from '../adapters/contestGateway.js';
import { IngestionWriter } from '../services/ingestionWriter.js';
import { runLiveIngestion } from '../pipelines/liveIngestion.js';
import type { ContestChainGateway } from '@chaincontest/chain';

export interface BootstrapOptions {
  config?: AppConfig;
  configOverrides?: Record<string, string | undefined>;
  forceReloadConfig?: boolean;
  contestGateway?: ContestChainGateway;
}

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  metrics: ReturnType<typeof createMetricsRegistry>;
  db: DbClient;
  queue: QueueClient;
  http: HttpServer;
  registry: IngestionRegistry;
  gateway: ContestGatewayAdapter;
  writer: IngestionWriter;
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
  runLiveCycle: () => Promise<void>;
}

export const bootstrapContext = (options: BootstrapOptions = {}): AppContext => {
  if (options.forceReloadConfig) {
    resetConfigCache();
  }

  const config = options.config ?? loadConfig({ overrides: options.configOverrides });
  const logger = createRootLogger({ environment: config.environment });
  const metrics = createMetricsRegistry({ defaultLabels: { service: 'indexer-event' } });

  const db = createDbClient({ config, logger, metricsHook: () => {} });
  const queue = createQueueClient({ config, logger });
  const http = createHttpServer({ config, logger, metrics });
  const registry = new IngestionRegistry(config, logger);

  const contestGateway = options.contestGateway;
  if (!contestGateway) {
    throw new Error('Contest gateway instance is required to bootstrap context');
  }

  const gateway = new ContestGatewayAdapter(contestGateway, logger);
  const writer = new IngestionWriter(db, logger);

  http.setHealthEvaluator(async () => {
    if (!db.isReady) {
      return { status: 'degraded', reason: 'database-not-initialised' };
    }

    const queueHealth = queue.getHealth();
    if (queueHealth.status === 'error') {
      return { status: 'degraded', reason: 'queue-error' };
    }

    return { status: 'ok' };
  });

  http.setStatusProvider(async () => ({ streams: registry.list().map(normalizeStreamForStatus) }));

  const start = async (): Promise<void> => {
    await registry.initialise();
    await db.init();
    await queue.start();
    await http.start();
  };

  registry.subscribe((streams) => {
    http.setStatusProvider(async () => ({ streams: streams.map(normalizeStreamForStatus) }));
  });

  const shutdown = async (): Promise<void> => {
    await http.stop();
    await queue.stop();
    await db.shutdown();
  };

  const runLiveCycle = async (): Promise<void> => {
    const streams = registry.list();
    for (const stream of streams) {
      const scopedLogger = withIngestionBindings(logger, {
        contestId: stream.contestId,
        chainId: stream.chainId,
        pipeline: 'live',
      });

      try {
        await runLiveIngestion(
          { config, db, gateway, writer, metrics, logger: scopedLogger },
          stream,
        );
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } },
          'live ingestion cycle failed',
        );
      }
    }
  };

  return {
    config,
    logger,
    metrics,
    db,
    queue,
    http,
    registry,
    gateway,
    writer,
    start,
    shutdown,
    runLiveCycle,
  };
};

const normalizeStreamForStatus = (stream: RegistryStream): Record<string, unknown> => ({
  contestId: stream.contestId,
  chainId: stream.chainId,
  mode: 'live',
  nextScheduledAt: null,
});
