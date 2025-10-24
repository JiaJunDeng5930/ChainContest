import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { getConfig, type TasksConfig } from '../bootstrap/config.js';
import { getLogger } from '../telemetry/logger.js';
import {
  createTaskMetrics,
  serializeTaskMetrics,
  type TaskMetrics
} from '../telemetry/metrics.js';

export interface HttpServerOptions {
  config?: TasksConfig;
  logger?: Logger;
  metrics?: TaskMetrics;
}

export interface HttpServer {
  readonly instance: FastifyInstance;
  readonly metrics: TaskMetrics;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isStarted: () => boolean;
}

export const createHttpServer = (options: HttpServerOptions = {}): HttpServer => {
  const config = options.config ?? getConfig();
  const baseLogger = options.logger ?? getLogger();
  const metrics = options.metrics ?? createTaskMetrics({ defaultLabels: { service: 'indexer-tasks' } });

  const fastifyLogger = baseLogger.child({ component: 'http' }) as unknown as FastifyBaseLogger;

  const app: FastifyInstance = Fastify({
    logger: fastifyLogger,
    disableRequestLogging: true,
    trustProxy: true
  });

  app.addHook('onRequest', async (request, reply) => {
    (request as typeof request & { startTime?: bigint }).startTime = process.hrtime.bigint();
    void reply.header('X-Request-Id', request.id);
    request.log.debug({ url: request.url, method: request.method }, 'incoming request');
  });

  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as typeof request & { startTime?: bigint }).startTime;
    if (startTime) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      request.log.debug({ statusCode: reply.statusCode, durationMs: duration }, 'request completed');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: serialiseError(error) }, 'unhandled error in http server');
    if (!reply.sent) {
      void reply.status(500).send({ status: 'error', message: 'Internal Server Error' });
    }
  });

  app.get('/healthz', () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.get('/metrics', async (request, reply) => {
    const body = await serializeTaskMetrics(metrics);
    void reply.header('Content-Type', 'text/plain; version=0.0.4');
    void reply.send(body);
  });

  let started = false;

  const start = async (): Promise<void> => {
    if (started) {
      return;
    }

    await app.listen({ port: config.http.port, host: '0.0.0.0' });
    started = true;
    baseLogger.info({ port: config.http.port }, 'http server listening');
  };

  const stop = async (): Promise<void> => {
    if (!started) {
      return;
    }

    await app.close();
    started = false;
    baseLogger.info('http server stopped');
  };

  return {
    instance: app,
    metrics,
    start,
    stop,
    isStarted: () => started
  };
};

const serialiseError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return { message: String(error) };
};
