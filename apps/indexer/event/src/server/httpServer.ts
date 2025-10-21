import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/loadConfig.js';
import { serializeMetrics, type IndexerMetrics } from '../telemetry/metrics.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  reason?: string;
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
}

export const createHttpServer = (options: HttpServerOptions): HttpServer => {
  const { config, logger, metrics } = options;
  const serverLogger = logger.child({ component: 'http' });
  const instance = Fastify({ logger: false });

  let listening = false;
  let healthEvaluator: () => Promise<HealthStatus> = async () => ({ status: 'ok' });
  let statusProvider: () => Promise<StatusSnapshot> = async () => ({ streams: [] });

  instance.get('/healthz', async (request, reply) => {
    const status = await healthEvaluator();
    const body = {
      status: status.status === 'ok' ? 'ok' : 'error',
      detail: status.reason,
      timestamp: new Date().toISOString(),
    };

    if (status.status === 'ok') {
      return body;
    }

    reply.code(503);
    return body;
  });

  instance.get('/metrics', async (_request, reply) => {
    const payload = await serializeMetrics(metrics);
    reply.type('text/plain');
    reply.send(payload);
  });

  instance.get('/v1/indexer/status', async (_request, reply) => {
    const snapshot = await statusProvider();
    reply.send(snapshot);
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
  };
};
