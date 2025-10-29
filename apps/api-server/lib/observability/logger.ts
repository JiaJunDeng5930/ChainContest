import { randomUUID } from 'node:crypto';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { getEnv } from '@/lib/config/env';

let loggerInstance: Logger | null = null;

const buildLogger = (): Logger => {
  const env = getEnv();

  const options: LoggerOptions = {
    level: env.logging.level ?? 'info',
    base: {
      service: 'apps-api-server',
      environment: env.nodeEnv
    }
  };

  return pino(options);
};

export const getLogger = (): Logger => {
  if (!loggerInstance) {
    loggerInstance = buildLogger();
  }

  return loggerInstance;
};

export interface RequestLogContext {
  traceId?: string;
  sessionId?: string | null;
  route?: string;
  ip?: string;
}

export const getRequestLogger = (context: RequestLogContext = {}): Logger => {
  const baseLogger = getLogger();
  const traceId = context.traceId ?? randomUUID();

  return baseLogger.child({
    traceId,
    sessionId: context.sessionId ?? undefined,
    route: context.route,
    ip: context.ip
  });
};

export const resetLogger = (): void => {
  loggerInstance = null;
};

export interface ComponentDeploymentLogPayload {
  status: 'pending' | 'confirmed' | 'failed';
  componentType: 'vault_implementation' | 'price_source';
  networkId: number;
  organizer: string;
  walletAddress?: string;
  contractAddress?: string | null;
  transactionHash?: string | null;
  metadata?: Record<string, unknown>;
  failureReason?: Record<string, unknown> | null;
}

export const logComponentDeployment = (
  payload: ComponentDeploymentLogPayload,
  error?: unknown
): void => {
  const logger = getLogger();
  const base = {
    event: 'componentDeployment',
    componentType: payload.componentType,
    networkId: payload.networkId,
    organizer: payload.organizer,
    walletAddress: payload.walletAddress,
    contractAddress: payload.contractAddress,
    transactionHash: payload.transactionHash,
    metadata: payload.metadata,
    failureReason: payload.failureReason
  };

  if (payload.status === 'failed') {
    logger.error({ ...base, error }, 'Component deployment failed');
    return;
  }

  logger.info({ ...base, status: payload.status }, 'Component deployment recorded');
};
