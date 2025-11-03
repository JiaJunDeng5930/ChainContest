import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import {
  getMilestoneExecutionByIdempotencyKey,
  getMilestoneExecutionByEvent,
  getReconciliationReportByReportId,
  listTrackedContests,
  updateMilestoneExecutionStatus,
  updateReconciliationReportStatus,
  upsertMilestoneExecution,
  upsertReconciliationReport,
  type MetricsEvent as DbMetricsEvent,
  type MetricsHook as DbMetricsHook
} from '@chaincontest/db';
import { loadConfig, resetConfig, type TasksConfig } from './config.js';
import {
  bootstrapDatabase,
  shutdownDatabaseConnection,
  isDatabaseReady
} from './database.js';
import {
  bootstrapQueue,
  shutdownQueue,
  registerWorker,
  publishJob,
  isQueueRunning
} from './queue.js';
import { createHttpServer, type HttpServer } from '../http/server.js';
import {
  createTaskMetrics,
  recordJobResult,
  recordJobRetry,
  type TaskMetrics
} from '../telemetry/metrics.js';
import { getLogger } from '../telemetry/logger.js';
import { createMilestoneProcessor } from '../services/milestoneProcessor.js';
import { createReconciliationProcessor } from '../services/reconciliationProcessor.js';
import { createMilestoneManualActions } from '../services/milestoneControl.js';
import { createReconciliationAdminActions } from '../services/reconciliationAdmin.js';
import { createHealthSnapshotBuilder } from '../telemetry/healthSnapshot.js';
import { readQueueBacklog } from '../queue/diagnostics.js';
import { parseMilestonePayload } from '../queue/parsers/milestonePayload.js';
import { parseReconciliationPayload } from '../queue/parsers/reconciliationPayload.js';
import { registerMilestoneWorker } from '../queue/workers/milestoneWorker.js';
import { registerReconciliationWorker } from '../queue/workers/reconciliationWorker.js';
import { registerStatusRoutes } from '../http/routes/statusRoute.js';
import { registerMilestoneRetryRoute } from '../http/routes/milestoneRetryRoute.js';
import { registerMilestoneModeRoute } from '../http/routes/milestoneModeRoute.js';
import { registerReportStatusRoute } from '../http/routes/reportStatusRoute.js';
import { createDeploymentRuntime } from '@chaincontest/chain';
import { ContestLifecycleOrchestrator } from '../services/lifecycleOrchestrator.js';

export interface AppBootstrapOptions {
  config?: TasksConfig;
  configOverrides?: Record<string, string | undefined>;
  logger?: Logger;
  metrics?: TaskMetrics;
}

export interface TasksApplication {
  readonly config: TasksConfig;
  readonly logger: Logger;
  readonly metrics: TaskMetrics;
  readonly http: HttpServer;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  registerWorker: typeof registerWorker;
  publishJob: typeof publishJob;
}

export const createApp = (options: AppBootstrapOptions = {}): TasksApplication => {
  const config = options.config ?? loadConfig(options.configOverrides ?? {});
  const logger = options.logger ?? getLogger();
  const metrics = options.metrics ?? createTaskMetrics({ defaultLabels: { service: 'indexer-tasks' } });
  const databaseLogger = logger.child({ component: 'database' });
  const milestoneLogger = logger.child({ worker: 'milestone' });
  const reconciliationLogger = logger.child({ worker: 'reconciliation' });
  const notificationLogger = logger.child({ component: 'notifications' });
  const milestoneAdminLogger = logger.child({ component: 'milestone-admin' });
  const reconciliationAdminLogger = logger.child({ component: 'reconciliation-admin' });
  const databaseMetricsHook = createDatabaseMetricsHook(metrics, databaseLogger);

  const milestoneManualActions = createMilestoneManualActions({
    logger: milestoneAdminLogger,
    publish: publishJob,
    fetchExecution: getMilestoneExecutionByEvent,
    transitionExecution: updateMilestoneExecutionStatus
  });

  const reconciliationAdmin = createReconciliationAdminActions({
    logger: reconciliationAdminLogger
  });

  const buildHealthSnapshot = createHealthSnapshotBuilder({
    config,
    metrics,
    queueNames: ['indexer.milestone', 'indexer.reconcile'],
    readQueueBacklog: (queueNames) => readQueueBacklog(queueNames),
    isQueueRunning
  });

  const milestoneProcessor = createMilestoneProcessor({
    logger: milestoneLogger,
    maxAttempts: config.thresholds.rpcFailure,
    db: {
      upsert: upsertMilestoneExecution,
      transition: updateMilestoneExecutionStatus,
      getByIdempotencyKey: getMilestoneExecutionByIdempotencyKey
    }
  });

  const reconciliationProcessor = createReconciliationProcessor({
    logger: reconciliationLogger,
    maxAttempts: config.thresholds.rpcFailure,
    features: {
      notificationsEnabled: config.features.notificationsEnabled
    },
    db: {
      upsert: upsertReconciliationReport,
      transition: updateReconciliationReportStatus,
      getByReportId: getReconciliationReportByReportId
    },
    notifications: {
      // Synchronous dispatch; return a resolved promise to satisfy typing.
      dispatch: ({ report, targets }) => {
        notificationLogger.info(
          {
            reportId: report.reportId,
            targets
          },
          'reconciliation notifications dispatched'
        );
        return Promise.resolve();
      }
    }
  });

  const lifecycleLogger = logger.child({ component: 'contest-lifecycle' });
  const lifecycleRuntime = createDeploymentRuntime();
  const lifecycleOrchestrator = new ContestLifecycleOrchestrator({
    logger: lifecycleLogger,
    runtime: lifecycleRuntime,
    db: {
      listTrackedContests
    },
    pollIntervalMs: config.lifecycle.pollIntervalMs
  });

  let milestoneWorkerRegistered = false;
  let reconciliationWorkerRegistered = false;
  // Build ensure* helpers to accept the application explicitly to avoid capturing uninitialised bindings.

  const ensureMilestoneWorker = async (app: TasksApplication): Promise<void> => {
    if (milestoneWorkerRegistered) {
      return;
    }

    await registerMilestoneWorker(app, {
      processor: milestoneProcessor,
      parsePayload: (raw) => parseMilestonePayload(raw).payload
    });

    milestoneWorkerRegistered = true;
  };

  const ensureReconciliationWorker = async (app: TasksApplication): Promise<void> => {
    if (reconciliationWorkerRegistered) {
      return;
    }

    await registerReconciliationWorker(app, {
      processor: reconciliationProcessor,
      parsePayload: (raw) => parseReconciliationPayload(raw)
    });

    reconciliationWorkerRegistered = true;
  };

  const http = createHttpServer({ config, logger, metrics });
  const adminBearerTokenBuffer = config.auth.adminBearerToken
    ? Buffer.from(config.auth.adminBearerToken, 'utf8')
    : null;
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (config.env === 'development') {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      void reply.status(401).send({ error: 'unauthorised' });
      return;
    }

    const presentedToken = authHeader.slice(7).trim();
    if (!presentedToken) {
      void reply.status(401).send({ error: 'unauthorised' });
      return;
    }

    if (!adminBearerTokenBuffer) {
      request.log.error('admin bearer token not configured');
      void reply.status(500).send({ error: 'unauthorised' });
      return;
    }

    const presentedTokenBuffer = Buffer.from(presentedToken, 'utf8');
    if (presentedTokenBuffer.length !== adminBearerTokenBuffer.length) {
      void reply.status(401).send({ error: 'unauthorised' });
      return;
    }

    if (!timingSafeEqual(presentedTokenBuffer, adminBearerTokenBuffer)) {
      void reply.status(401).send({ error: 'unauthorised' });
      return;
    }
  };

  void registerStatusRoutes(http.instance, {
    authenticate,
    buildSnapshot: buildHealthSnapshot
  });

  void registerMilestoneRetryRoute(http.instance, {
    authenticate,
    retryMilestone: milestoneManualActions.retryMilestone
  });

  void registerMilestoneModeRoute(http.instance, {
    authenticate,
    setContestMode: milestoneManualActions.setContestMode
  });

  void registerReportStatusRoute(http.instance, {
    authenticate,
    updateStatus: reconciliationAdmin.updateReportStatus
  });
  let started = false;

  const application: TasksApplication = {
    config,
    logger,
    metrics,
    http,
    start: async (): Promise<void> => {
      if (started) {
        return;
      }

      await bootstrapDatabase({ config, logger: databaseLogger, metricsHook: databaseMetricsHook });
      await bootstrapQueue({ config, logger });
      await ensureMilestoneWorker(application);
      await ensureReconciliationWorker(application);
      await http.start();
      lifecycleOrchestrator.start();

      started = true;
      logger.info('indexer tasks application started');
    },
    stop: async (): Promise<void> => {
      if (!started) {
        return;
      }

      lifecycleOrchestrator.stop();
      await http.stop();
      await shutdownQueue();
      await shutdownDatabaseConnection(logger);

      milestoneWorkerRegistered = false;
      reconciliationWorkerRegistered = false;

      started = false;
      logger.info('indexer tasks application stopped');
    },
    isRunning: (): boolean => started && isDatabaseReady() && isQueueRunning() && http.isStarted(),
    registerWorker,
    publishJob
  };
  return application;
};

export const resetAppConfig = (): void => {
  resetConfig();
};

const createDatabaseMetricsHook = (metrics: TaskMetrics, logger: Logger): DbMetricsHook => {
  return (event: DbMetricsEvent): void => {
    const outcome = event.outcome === 'success' ? 'success' : 'failure';
    const durationSeconds = event.durationMs / 1000;

    recordJobResult(metrics, 'database', outcome, durationSeconds);

    if (event.outcome === 'error') {
      const reason = event.errorCode ?? 'unknown_error';
      recordJobRetry(metrics, 'database', reason);
      logger.error(
        {
          operation: event.operation,
          durationMs: event.durationMs,
          errorCode: event.errorCode
        },
        'database operation failed'
      );
      return;
    }

    logger.debug(
      {
        operation: event.operation,
        durationMs: event.durationMs
      },
      'database operation completed'
    );
  };
};
