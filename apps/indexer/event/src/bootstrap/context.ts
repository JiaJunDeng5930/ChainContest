import type { Logger } from 'pino';
import { loadConfig, type AppConfig, resetConfigCache } from '../config/loadConfig.js';
import { createRootLogger, withIngestionBindings } from '../telemetry/logging.js';
import { createMetricsRegistry, type IndexerMetrics } from '../telemetry/metrics.js';
import { createDbClient, type DbClient } from '../services/dbClient.js';
import { createQueueClient, type QueueClient } from '../services/queueClient.js';
import { createHttpServer, type HealthStatus, type HttpServer } from '../server/httpServer.js';
import type { ReplayRouteRequest, ReplayRouteResponse } from '../server/httpRoutes.js';
import { IngestionRegistry } from '../services/ingestionRegistry.js';
import { ContestGatewayAdapter } from '../adapters/contestGateway.js';
import { IngestionWriter } from '../services/ingestionWriter.js';
import { runLiveIngestion } from '../pipelines/liveIngestion.js';
import { runReplayIngestion, type ReplayIngestionDependencies } from '../pipelines/replayIngestion.js';
import { RpcEndpointManager } from '../services/rpcEndpointManager.js';
import { HealthTracker } from '../services/healthTracker.js';
import { JobDispatcher } from '../services/jobDispatcher.js';
import { ReconciliationReportService } from '../services/reconciliationReport.js';
import type { ContestChainGateway, ContestEventType } from '@chaincontest/chain';
import { createDeploymentEventHandler } from '../pipelines/deploymentHandler.js';
import { createRegistrationEventHandler } from '../pipelines/registrationHandler.js';
import { createSettlementEventHandler } from '../pipelines/settlementHandler.js';
import { createRewardEventHandler } from '../pipelines/rewardHandler.js';

export interface BootstrapOptions {
  config?: AppConfig;
  configOverrides?: Record<string, string | undefined>;
  forceReloadConfig?: boolean;
  contestGateway?: ContestChainGateway;
  logger?: Logger;
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
  rpc: RpcEndpointManager;
  health: HealthTracker;
  jobs: JobDispatcher;
  reconciliation: ReconciliationReportService;
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
  runLiveCycle: () => Promise<void>;
}

export const bootstrapContext = (options: BootstrapOptions = {}): AppContext => {
  if (options.forceReloadConfig) {
    resetConfigCache();
  }

  const config = options.config ?? loadConfig({ overrides: options.configOverrides });
  const logger = options.logger ?? createRootLogger({ environment: config.environment });
  const metrics: IndexerMetrics = createMetricsRegistry({ defaultLabels: { service: 'indexer-event' } });

  const db = createDbClient({ config, logger, metricsHook: () => {} });
  const queue = createQueueClient({ config, logger });
  const http = createHttpServer({ config, logger, metrics });
  const registry = new IngestionRegistry(config, logger, db);
  const rpc = new RpcEndpointManager({ config, logger, metrics });
  const health = new HealthTracker();
  const jobs = new JobDispatcher(queue, logger);
  const reconciliation = new ReconciliationReportService();

  const contestGateway = options.contestGateway;
  if (!contestGateway) {
    throw new Error('Contest gateway instance is required to bootstrap context');
  }

  const gateway = new ContestGatewayAdapter(contestGateway, logger, rpc);
  const writer = new IngestionWriter(db, logger);
  writer.registerDomainHandler('deployment' as ContestEventType, createDeploymentEventHandler({ db, logger }));
  writer.registerDomainHandler('registration', createRegistrationEventHandler({ db, logger }));
  writer.registerDomainHandler('settlement', createSettlementEventHandler({ db, logger }));
  writer.registerDomainHandler('reward', createRewardEventHandler({ db, logger }));

  http.setHealthEvaluator(() => Promise.resolve(aggregateHealth({ db, queue, health })));
  http.setStatusProvider(() => Promise.resolve(health.snapshot()));
  http.setReplayHandler(async (request) =>
    scheduleReplay({
      request,
      registry,
      health,
      jobs,
      config,
      db,
      gateway,
      metrics,
      writer,
      logger,
      rpc,
      reconciliation,
    }),
  );

  const start = async (): Promise<void> => {
    await db.init();
    await registry.initialise();
    await queue.start();
    await http.start();
  };

  registry.subscribe((streams) => {
    streams.forEach((stream) => health.register(stream));
    http.setStatusProvider(() => Promise.resolve(health.snapshot()));
  });

  const shutdown = async (): Promise<void> => {
    await http.stop();
    await queue.stop();
    await db.shutdown();
  };

  const runLiveCycle = async (): Promise<void> => {
    const streams = registry.list();
    for (const stream of streams) {
      const mode = health.getMode({ contestId: stream.contestId, chainId: stream.chainId });
      if (mode !== 'live') {
        logger.debug({ contestId: stream.contestId, chainId: stream.chainId, mode }, 'skipping live cycle due to non-live mode');
        continue;
      }
      const scopedLogger = withIngestionBindings(logger, {
        contestId: stream.contestId,
        chainId: stream.chainId,
        pipeline: 'live',
      });

      try {
        await runLiveIngestion(
          {
            config,
            db,
            gateway,
            writer,
            metrics,
            logger: scopedLogger,
            rpc,
            health,
            jobDispatcher: jobs,
          },
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
    rpc,
    health,
    jobs,
    reconciliation,
    start,
    shutdown,
    runLiveCycle,
  };
};

const aggregateHealth = ({
  db,
  queue,
  health,
}: {
  db: DbClient;
  queue: QueueClient;
  health: HealthTracker;
}): HealthStatus => {
  if (!db.isReady) {
    return { status: 'error', reasons: ['database-not-initialised'] };
  }

  const queueHealth = queue.getHealth();
  if (queueHealth.status === 'error') {
    return {
      status: 'error',
      reasons: ['queue-error'],
    };
  }

  const trackerHealth = health.getHealth();
  const reasons = [...(trackerHealth.reasons ?? [])];

  if (queueHealth.status === 'stopped') {
    reasons.push('queue-stopped');
  }

  if (trackerHealth.status === 'error') {
    return { status: 'error', reasons };
  }

  if (queueHealth.status === 'stopped' || trackerHealth.status === 'degraded') {
    return { status: 'degraded', reasons };
  }

  return { status: 'ok', reasons };
};

const scheduleReplay = async ({
  request,
  registry,
  health,
  jobs,
  config,
  db,
  gateway,
  metrics,
  writer,
  logger,
  rpc,
  reconciliation,
}: {
  request: ReplayRouteRequest;
  registry: IngestionRegistry;
  health: HealthTracker;
  jobs: JobDispatcher;
  config: AppConfig;
  db: DbClient;
  gateway: ContestGatewayAdapter;
  metrics: IndexerMetrics;
  writer: IngestionWriter;
  logger: Logger;
  rpc: RpcEndpointManager;
  reconciliation: ReconciliationReportService;
}): Promise<ReplayRouteResponse> => {
  const stream = registry.get(request.contestId, request.chainId);
  if (!stream) {
    throw createHttpError(404, 'contest or chain not registered');
  }

  const mode = health.getMode({ contestId: stream.contestId, chainId: stream.chainId });
  if (mode !== 'live') {
    throw createHttpError(409, `stream currently in ${mode} mode`);
  }

  const fromBlock = BigInt(request.fromBlock);
  const toBlock = BigInt(request.toBlock);

  if (fromBlock < stream.startBlock) {
    throw createHttpError(400, `fromBlock must be >= stream start block ${stream.startBlock.toString()}`);
  }

  health.setMode(stream, 'paused');

  let jobId: string | null;
  try {
    jobId = await jobs.dispatchReplay({
      contestId: stream.contestId,
      chainId: stream.chainId,
      fromBlock,
      toBlock,
      reason: request.reason,
      actor: request.actor,
    });
  } catch (error) {
    health.setMode(stream, 'live');
    throw error;
  }

  const replayParams = {
    stream,
    fromBlock,
    toBlock,
    reason: request.reason,
    actor: request.actor,
  };

  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  const replayDeps = {
    config,
    db,
    gateway,
    metrics,
    writer,
    logger,
    rpc,
    health,
    jobDispatcher: jobs,
    reconciliation,
  } satisfies ReplayIngestionDependencies;
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */

  void runReplayIngestion(replayDeps, replayParams).catch((error: unknown) => {
    logger.error(
      {
        err: normalizeError(error),
        contestId: stream.contestId,
        chainId: stream.chainId,
      },
      'replay ingestion failed',
    );
    health.setMode(stream, 'live');
  });

  return {
    jobId,
    scheduledRange: {
      fromBlock: request.fromBlock,
      toBlock: request.toBlock,
    },
  };
};

const createHttpError = (statusCode: number, message: string): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

const normalizeError = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
};
