import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { HealthStatus, StatusSnapshot } from './httpServer.js';
import type { IndexerMetrics } from '../telemetry/metrics.js';
import { serializeMetrics } from '../telemetry/metrics.js';

export interface ReplayRouteRequest {
  contestId: string;
  chainId: number;
  fromBlock: string;
  toBlock: string;
  reason: string;
  actor?: string;
}

export interface ReplayRouteResponse {
  jobId: string | null;
  scheduledRange: { fromBlock: string; toBlock: string };
}

export type ReplayRouteHandler = (input: ReplayRouteRequest) => Promise<ReplayRouteResponse>;

export interface RegisterHttpRoutesOptions {
  evaluateHealth: () => Promise<HealthStatus>;
  provideStatus: () => Promise<StatusSnapshot>;
  metrics: IndexerMetrics;
  logger: Logger;
  handleReplay: ReplayRouteHandler;
}

export const registerHttpRoutes = (
  instance: FastifyInstance,
  options: RegisterHttpRoutesOptions,
): void => {
  const { evaluateHealth, provideStatus, metrics, logger, handleReplay } = options;
  const routeLogger = logger.child({ component: 'httpRoutes' });

  instance.get('/healthz', async (_request, reply) => {
    const health = await evaluateHealth();
    const body = {
      status: health.status === 'ok' ? 'ok' : 'error',
      reasons: health.reasons,
      timestamp: new Date().toISOString(),
    };

    if (health.status === 'ok') {
      return reply.send(body);
    }

    const httpStatus = health.status === 'error' ? 503 : 503;
    return reply.code(httpStatus).send(body);
  });

  instance.get('/metrics', async (_request, reply) => {
    const payload = await serializeMetrics(metrics);
    return reply.type('text/plain').send(payload);
  });

  instance.get('/v1/indexer/status', async (_request, reply) => {
    const status = await provideStatus();
    routeLogger.debug({ streamCount: status.streams.length }, 'status snapshot served');
    return reply.send(status);
  });

  instance.post('/v1/indexer/replays', async (request, reply) => {
    const parsed = parseReplayBody(request.body);

    if (!parsed.valid) {
      return reply.code(400).send({ message: parsed.error });
    }

    try {
      const result = await handleReplay(parsed.value);
      return reply.code(202).send(result);
    } catch (error) {
      const statusCode = isHttpError(error) ? error.statusCode : 500;
      const message = error instanceof Error ? error.message : String(error);
      if (statusCode >= 500) {
        routeLogger.error({ err: message }, 'replay scheduling failed');
      }
      return reply.code(statusCode).send({ message });
    }
  });
};

interface HttpErrorLike {
  statusCode: number;
}

const isHttpError = (error: unknown): error is HttpErrorLike =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof (error as { statusCode: unknown }).statusCode === 'number',
  );

const parseReplayBody = (body: unknown):
  | { valid: true; value: ReplayRouteRequest }
  | { valid: false; error: string } => {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: 'request body must be a JSON object' };
  }

  const value = body as Record<string, unknown>;
  const contestId = typeof value.contestId === 'string' && value.contestId.length > 0 ? value.contestId : null;
  const chainId = Number.isInteger(value.chainId) ? Number(value.chainId) : null;
  const fromBlock = typeof value.fromBlock === 'string' && value.fromBlock.length > 0 ? value.fromBlock : null;
  const toBlock = typeof value.toBlock === 'string' && value.toBlock.length > 0 ? value.toBlock : null;
  const reason = typeof value.reason === 'string' && value.reason.length > 0 ? value.reason : null;
  const actor = typeof value.actor === 'string' && value.actor.length > 0 ? value.actor : undefined;

  if (!contestId || chainId === null || !fromBlock || !toBlock || !reason) {
    return { valid: false, error: 'contestId, chainId, fromBlock, toBlock and reason are required' };
  }

  const parseBlockNumber = (
    fieldName: 'fromBlock' | 'toBlock',
    rawValue: string,
  ): { valid: true; value: bigint } | { valid: false; error: string } => {
    try {
      const parsed = BigInt(rawValue);
      if (parsed < 0n) {
        return { valid: false, error: `${fieldName} must be greater than or equal to zero` };
      }
      return { valid: true, value: parsed };
    } catch {
      return { valid: false, error: `${fieldName} must be a numeric string` };
    }
  };

  const fromBlockNumber = parseBlockNumber('fromBlock', fromBlock);
  if (!fromBlockNumber.valid) {
    return fromBlockNumber;
  }

  const toBlockNumber = parseBlockNumber('toBlock', toBlock);
  if (!toBlockNumber.valid) {
    return toBlockNumber;
  }

  if (fromBlockNumber.value > toBlockNumber.value) {
    return { valid: false, error: 'fromBlock must be less than or equal to toBlock' };
  }

  return {
    valid: true,
    value: {
      contestId,
      chainId,
      fromBlock,
      toBlock,
      reason,
      actor,
    },
  };
};
