import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/loadConfig.js';
import type { DbClient } from '../services/dbClient.js';
import type { RegistryStream } from '../services/ingestionRegistry.js';
import { ContestGatewayAdapter, ContestGatewayError } from '../adapters/contestGateway.js';
import { IngestionWriter } from '../services/ingestionWriter.js';
import type { IndexerMetrics } from '../telemetry/metrics.js';
import { logBatchResult, withIngestionBindings } from '../telemetry/logging.js';
import type { RpcEndpointManager, RpcEndpointSelection } from '../services/rpcEndpointManager.js';
import { HealthTracker } from '../services/healthTracker.js';
import type { JobDispatcher } from '../services/jobDispatcher.js';
import type { ContestEventEnvelope, ContestEventType } from '@chaincontest/chain';

export interface LiveIngestionDependencies {
  config: AppConfig;
  db: DbClient;
  gateway: ContestGatewayAdapter;
  writer: IngestionWriter;
  metrics: IndexerMetrics;
  logger: Logger;
  rpc: RpcEndpointManager;
  health: HealthTracker;
  jobDispatcher: JobDispatcher;
}

export interface LiveIngestionResult {
  contestId: string;
  chainId: number;
  eventsProcessed: number;
}

export const runLiveIngestion = async (
  deps: LiveIngestionDependencies,
  stream: RegistryStream,
): Promise<LiveIngestionResult> => {
  const { db, gateway, writer, metrics, logger, config, rpc, health, jobDispatcher } = deps;
  const scopedLogger = withIngestionBindings(logger, {
    contestId: stream.contestId,
    chainId: stream.chainId,
    pipeline: 'live',
  });

  const initialRpc = rpc.getActiveEndpoint(stream.chainId);

  try {
    const cursorState = await db.readIngestionStatus({
      contestId: stream.contestId,
      chainId: stream.chainId,
      contractAddress: stream.addresses.registrar,
    });

    const cursorHeight = cursorState.cursorHeight ? BigInt(cursorState.cursorHeight) : null;
    const cursorLogIndex = cursorState.cursorLogIndex ?? null;
    const cursor: { blockNumber: bigint; logIndex: number } | undefined =
      cursorHeight !== null
        ? {
            blockNumber: cursorHeight,
            logIndex: cursorLogIndex ?? 0,
          }
        : undefined;

    const fromBlock = cursorHeight === null ? stream.startBlock : undefined;
    const limit = config.service.maxBatchSize;

    const startedAt = performance.now();

    const { batch, rpc: rpcSelection } = await gateway.pullEvents({
      stream,
      cursor,
      fromBlock,
      limit,
    });

    await writer.writeBatch({ stream, batch, currentCursor: cursor });
    await dispatchMilestones(jobDispatcher, scopedLogger, stream, batch.events);

    const durationMs = performance.now() - startedAt;
    const eventsProcessed = batch.events.length;
    const rpcEndpoint = rpcSelection ?? initialRpc;

    logBatchResult(scopedLogger, {
      batchSize: eventsProcessed,
      durationMs,
      fromHeight: batch.events[0]?.cursor.blockNumber,
      toHeight: batch.events.at(-1)?.cursor.blockNumber,
      cursor: batch.nextCursor.blockNumber.toString(),
      rpcEndpointId: rpcEndpoint?.endpointId,
    });

    const labels = {
      contestId: stream.contestId,
      chainId: stream.chainId.toString(),
      pipeline: 'live',
    } as const;

    metrics.ingestionBatchDuration.observe(labels, durationMs);
    metrics.ingestionBatchSize.observe(labels, eventsProcessed);

    const latestBlockNumber = Number(batch.latestBlock.blockNumber);
    const nextCursorBlock = Number(batch.nextCursor.blockNumber);
    let lag = 0;
    if (!Number.isNaN(latestBlockNumber) && !Number.isNaN(nextCursorBlock)) {
      lag = Math.max(latestBlockNumber - nextCursorBlock, 0);
      metrics.ingestionLagBlocks.set(
        {
          contestId: stream.contestId,
          chainId: stream.chainId.toString(),
        },
        lag,
      );
    }

    health.recordSuccess({
      stream,
      lagBlocks: lag,
      rpc: rpcEndpoint ?? null,
      nextPollAt: Date.now() + config.service.pollIntervalMs,
    });

    return {
      contestId: stream.contestId,
      chainId: stream.chainId,
      eventsProcessed,
    };
  } catch (error) {
    const rpcEndpoint = extractRpcSelection(error) ?? initialRpc;
    const reason = error instanceof Error ? error.message : String(error);
    health.recordFailure({
      stream,
      reason,
      rpc: rpcEndpoint ?? undefined,
    });
    throw error;
  }
};

const extractRpcSelection = (error: unknown): RpcEndpointSelection | null => {
  if (error instanceof ContestGatewayError) {
    return error.rpc;
  }
  return null;
};

const milestoneMap: Partial<Record<ContestEventType, string>> = {
  settlement: 'settled',
  reward: 'reward_ready',
  redemption: 'redemption_ready',
};

const dispatchMilestones = async (
  dispatcher: JobDispatcher,
  logger: Logger,
  stream: RegistryStream,
  events: ContestEventEnvelope[],
): Promise<void> => {
  for (const event of events) {
    const milestone = milestoneMap[event.type];
    if (!milestone) {
      continue;
    }

    try {
      await dispatcher.dispatchMilestone({
        contestId: stream.contestId,
        chainId: stream.chainId,
        milestone,
        sourceEvent: {
          txHash: event.txHash,
          blockNumber: event.blockNumber.toString(),
          logIndex: event.logIndex,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? { message: error.message } : { message: String(error) },
          milestone,
        },
        'failed to dispatch milestone job',
      );
    }
  }
};
