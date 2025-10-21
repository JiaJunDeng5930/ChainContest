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
import type { ReconciliationReport, ReconciliationReportService } from '../services/reconciliationReport.js';
import type { ContestEventEnvelope } from '@chaincontest/chain';

export interface ReplayIngestionDependencies {
  config: AppConfig;
  db: DbClient;
  gateway: ContestGatewayAdapter;
  writer: IngestionWriter;
  metrics: IndexerMetrics;
  logger: Logger;
  rpc: RpcEndpointManager;
  health: HealthTracker;
  jobDispatcher: JobDispatcher;
  reconciliation: ReconciliationReportService;
}

export interface ReplayIngestionParams {
  stream: RegistryStream;
  fromBlock: bigint;
  toBlock: bigint;
  reason: string;
  actor?: string;
}

export interface ReplayIngestionResult {
  contestId: string;
  chainId: number;
  eventsProcessed: number;
  batches: number;
  report: ReconciliationReport;
}

export const runReplayIngestion = async (
  deps: ReplayIngestionDependencies,
  params: ReplayIngestionParams,
): Promise<ReplayIngestionResult> => {
  const { config, gateway, writer, metrics, logger, rpc, health, jobDispatcher, reconciliation } = deps;
  const { stream, fromBlock, toBlock, reason, actor } = params;

  const scopedLogger = withIngestionBindings(logger, {
    contestId: stream.contestId,
    chainId: stream.chainId,
    pipeline: 'replay',
  });

  health.setMode(stream, 'replay');

  const replayedEvents: ContestEventEnvelope[] = [];
  let totalEvents = 0;
  let batches = 0;
  let cursor: { blockNumber: bigint; logIndex: number } | undefined = { blockNumber: fromBlock, logIndex: 0 };
  let firstIteration = true;

  try {
    let hasMore = true;
    while (hasMore) {
      const startedAt = performance.now();
      const { batch, rpc: rpcSelection } = await gateway.pullEvents({
        stream,
        cursor: firstIteration ? undefined : cursor,
        fromBlock: firstIteration ? fromBlock : undefined,
        toBlock,
        limit: config.service.maxBatchSize,
      });

      batches += 1;
      await writer.writeBatch({ stream, batch, currentCursor: cursor, advanceCursor: false });
      totalEvents += batch.events.length;
      replayedEvents.push(...batch.events);

      const durationMs = performance.now() - startedAt;

      logBatchResult(scopedLogger, {
        batchSize: batch.events.length,
        durationMs,
        fromHeight: batch.events[0]?.cursor.blockNumber,
        toHeight: batch.events.at(-1)?.cursor.blockNumber,
        cursor: batch.nextCursor.blockNumber.toString(),
        rpcEndpointId: rpcSelection?.endpointId,
      });

      metrics.ingestionBatchDuration.observe({ contestId: stream.contestId, chainId: stream.chainId.toString(), pipeline: 'replay' }, durationMs);
      metrics.ingestionBatchSize.observe(
        { contestId: stream.contestId, chainId: stream.chainId.toString(), pipeline: 'replay' },
        batch.events.length,
      );
      metrics.ingestionLagBlocks.set(
        { contestId: stream.contestId, chainId: stream.chainId.toString() },
        0,
      );

      health.recordSuccess({ stream, lagBlocks: 0, rpc: rpcSelection ?? null, nextPollAt: null });

      const reachedEnd = batch.nextCursor.blockNumber >= toBlock || batch.events.length === 0;
      if (reachedEnd) {
        hasMore = false;
        continue;
      }

      if (cursor && cursor.blockNumber === batch.nextCursor.blockNumber && cursor.logIndex === batch.nextCursor.logIndex) {
        scopedLogger.warn({ cursor }, 'replay cursor did not advance; stopping to avoid infinite loop');
        hasMore = false;
        continue;
      }

      cursor = {
        blockNumber: batch.nextCursor.blockNumber,
        logIndex: batch.nextCursor.logIndex,
      };
      firstIteration = false;
    }

    const report = reconciliation.buildReport({
      stream,
      range: { fromBlock, toBlock },
      replayEvents: replayedEvents,
      baselineEvents: undefined,
      actor,
      reason,
    });

    await jobDispatcher.dispatchReconcile(report);

    health.setMode(stream, 'live');

    return {
      contestId: stream.contestId,
      chainId: stream.chainId,
      eventsProcessed: totalEvents,
      batches,
      report,
    };
  } catch (error) {
    const rpcSelection = extractRpcSelection(error) ?? rpc.getActiveEndpoint(stream.chainId);
    const reasonMessage = error instanceof Error ? error.message : String(error);
    health.recordFailure({ stream, reason: reasonMessage, rpc: rpcSelection ?? undefined });
    health.setMode(stream, 'live');
    throw error;
  }
};

const extractRpcSelection = (error: unknown): RpcEndpointSelection | null => {
  if (error instanceof ContestGatewayError) {
    return error.rpc;
  }
  return null;
};
