import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/loadConfig.js';
import type { IndexerMetrics } from '../telemetry/metrics.js';
import { registerHttpRoutes, type ReplayRouteHandler } from './httpRoutes.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  reasons?: string[];
}

export interface StatusSnapshot {
  streams: Array<Record<string, unknown>>;
}

export interface HttpServerOptions {
  config: AppConfig;
  logger: Logger;
  metrics: IndexerMetrics;
}

export interface HttpServer {
  readonly instance: FastifyInstance;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isListening: () => boolean;
  setHealthEvaluator: (evaluator: () => Promise<HealthStatus>) => void;
  setStatusProvider: (provider: () => Promise<StatusSnapshot>) => void;
  setReplayHandler: (handler: ReplayRouteHandler) => void;
}

export const createHttpServer = (options: HttpServerOptions): HttpServer => {
  const { config, logger, metrics } = options;
  const serverLogger = logger.child({ component: 'http' });
  const instance = Fastify({ logger: false });

  let listening = false;
  let healthEvaluator: () => Promise<HealthStatus> = () => Promise.resolve({ status: 'ok', reasons: [] });
  let statusProvider: () => Promise<StatusSnapshot> = () => Promise.resolve({ streams: [] });
  let replayHandler: ReplayRouteHandler = () =>
    Promise.reject(Object.assign(new Error('replay handler not configured'), { statusCode: 503 }));

  registerHttpRoutes(instance, {
    evaluateHealth: () => healthEvaluator(),
    provideStatus: () => statusProvider(),
    metrics,
    logger: serverLogger,
    handleReplay: (payload) => replayHandler(payload),
  });

  const start = async (): Promise<void> => {
    if (listening) {
      return;
    }

    await instance.listen({ host: '0.0.0.0', port: config.service.port });
    listening = true;
    serverLogger.info({ port: config.service.port }, 'http server listening');
  };

  const stop = async (): Promise<void> => {
    if (!listening) {
      return;
    }

    await instance.close();
    listening = false;
    serverLogger.info('http server stopped');
  };

  return {
    instance,
    start,
    stop,
    isListening: () => listening,
    setHealthEvaluator: (evaluator) => {
      healthEvaluator = evaluator;
    },
    setStatusProvider: (provider) => {
      statusProvider = provider;
    },
    setReplayHandler: (handler) => {
      replayHandler = handler;
    },
  };
};
