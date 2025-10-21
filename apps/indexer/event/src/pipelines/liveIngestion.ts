import { performance } from 'node:perf_hooks';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/loadConfig.js';
import type { DbClient } from '../services/dbClient.js';
import type { RegistryStream } from '../services/ingestionRegistry.js';
import { ContestGatewayAdapter } from '../adapters/contestGateway.js';
import { IngestionWriter } from '../services/ingestionWriter.js';
import type { IndexerMetrics } from '../telemetry/metrics.js';
import { logBatchResult, withIngestionBindings } from '../telemetry/logging.js';

export interface LiveIngestionDependencies {
  config: AppConfig;
  db: DbClient;
  gateway: ContestGatewayAdapter;
  writer: IngestionWriter;
  metrics: IndexerMetrics;
  logger: Logger;
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
  const { db, gateway, writer, metrics, logger, config } = deps;
  const scopedLogger = withIngestionBindings(logger, {
    contestId: stream.contestId,
    chainId: stream.chainId,
    pipeline: 'live',
  });

  const cursorState = await db.readIngestionStatus({
    contestId: stream.contestId,
    chainId: stream.chainId,
    contractAddress: stream.addresses.registrar,
  });

  const cursorHeight = cursorState.cursorHeight ? BigInt(cursorState.cursorHeight) : null;
  const cursor: { blockNumber: bigint; logIndex: number } | undefined =
    cursorHeight !== null
      ? {
          blockNumber: cursorHeight,
          logIndex: 0,
        }
      : undefined;

  const fromBlock = cursorHeight === null ? stream.startBlock : undefined;
  const limit = config.service.maxBatchSize;

  const startedAt = performance.now();

  const batch = await gateway.pullEvents({
    stream,
    cursor,
    fromBlock,
    limit,
  });

  await writer.writeBatch({ stream, batch });

  const durationMs = performance.now() - startedAt;
  const eventsProcessed = batch.events.length;

  logBatchResult(scopedLogger, {
    batchSize: eventsProcessed,
    durationMs,
    fromHeight: batch.events[0]?.cursor.blockNumber,
    toHeight: batch.events.at(-1)?.cursor.blockNumber,
    cursor: batch.nextCursor.blockNumber.toString(),
    rpcEndpointId: undefined,
  });

  const labels = {
    contestId: stream.contestId,
    chainId: stream.chainId.toString(),
    pipeline: 'live',
  } as const;

  metrics.ingestionBatchDuration.observe(labels, durationMs);
  metrics.ingestionBatchSize.observe(labels, eventsProcessed);

  const latestBlockNumber = Number(batch.latestBlock.blockNumber);
  if (!Number.isNaN(latestBlockNumber)) {
    const lag = cursorHeight !== null ? latestBlockNumber - Number(cursorHeight) : 0;
    metrics.ingestionLagBlocks.set(
      {
        contestId: stream.contestId,
        chainId: stream.chainId.toString(),
      },
      Math.max(lag, 0),
    );
  }

  return {
    contestId: stream.contestId,
    chainId: stream.chainId,
    eventsProcessed,
  };
};
