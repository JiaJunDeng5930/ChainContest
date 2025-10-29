import { randomUUID } from 'node:crypto';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { getEnv } from '@/lib/config/env';

let loggerInstance: Logger | null = null;

interface DeploymentStatsAccumulator {
  total: number;
  failures: number;
}

const componentDeploymentStats: DeploymentStatsAccumulator = { total: 0, failures: 0 };
const contestDeploymentStats: DeploymentStatsAccumulator = { total: 0, failures: 0 };

const computeStatsSnapshot = (stats: DeploymentStatsAccumulator) => {
  const failureRate = stats.total === 0 ? 0 : stats.failures / stats.total;
  return {
    total: stats.total,
    failures: stats.failures,
    failureRate
  };
};

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
  durationMs?: number;
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
    failureReason: payload.failureReason,
    durationMs: payload.durationMs,
    stats: computeStatsSnapshot(componentDeploymentStats)
  };

  componentDeploymentStats.total += 1;

  if (payload.status === 'failed') {
    componentDeploymentStats.failures += 1;
    logger.error({ ...base, error }, 'Component deployment failed');
    return;
  }

  logger.info({ ...base, status: payload.status }, 'Component deployment recorded');
};

export interface ContestDeploymentLogPayload {
  status: 'pending' | 'confirmed' | 'failed';
  networkId: number;
  organizer: string;
  requestId: string;
  contestId: string;
  vaultComponentId: string;
  priceSourceComponentId: string;
  contestAddress?: string | null;
  vaultFactoryAddress?: string | null;
  transactionHash?: string | null;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  failureReason?: Record<string, unknown> | null;
}

export const logContestDeployment = (
  payload: ContestDeploymentLogPayload,
  error?: unknown
): void => {
  const logger = getLogger();
  const base = {
    event: 'contestDeployment',
    networkId: payload.networkId,
    organizer: payload.organizer,
    requestId: payload.requestId,
    contestId: payload.contestId,
    vaultComponentId: payload.vaultComponentId,
    priceSourceComponentId: payload.priceSourceComponentId,
    contestAddress: payload.contestAddress,
    vaultFactoryAddress: payload.vaultFactoryAddress,
    transactionHash: payload.transactionHash,
    durationMs: payload.durationMs,
    metadata: payload.metadata,
    failureReason: payload.failureReason,
    stats: computeStatsSnapshot(contestDeploymentStats)
  };

  contestDeploymentStats.total += 1;

  if (payload.status === 'failed') {
    contestDeploymentStats.failures += 1;
    logger.error({ ...base, error }, 'Contest deployment failed');
    return;
  }

  logger.info({ ...base, status: payload.status }, 'Contest deployment recorded');
};

export const getDeploymentStats = () => ({
  components: computeStatsSnapshot(componentDeploymentStats),
  contests: computeStatsSnapshot(contestDeploymentStats)
});
