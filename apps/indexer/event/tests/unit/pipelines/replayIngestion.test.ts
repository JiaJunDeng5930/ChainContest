import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../../../src/config/loadConfig.js';
import type { IndexerMetrics } from '../../../src/telemetry/metrics.js';
import type { Logger } from 'pino';
import type { RegistryStream } from '../../../src/services/ingestionRegistry.js';
import type { DbClient } from '../../../src/services/dbClient.js';
import type { ContestGatewayAdapter, ContestGatewayPullResult } from '../../../src/adapters/contestGateway.js';
import type { IngestionWriter } from '../../../src/services/ingestionWriter.js';
import type { RpcEndpointManager } from '../../../src/services/rpcEndpointManager.js';
import { HealthTracker } from '../../../src/services/healthTracker.js';
import type { JobDispatcher } from '../../../src/services/jobDispatcher.js';
import type { ReconciliationReportService, ReconciliationReport } from '../../../src/services/reconciliationReport.js';
import { runReplayIngestion, type ReplayIngestionDependencies, type ReplayIngestionParams } from '../../../src/pipelines/replayIngestion.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, '../../replay/sample-contest.json');

interface SampleFile {
  contestId: string;
  chainId: number;
  addresses: Record<string, string>;
  startBlock: string;
  batches: Array<{
    events: Array<{
      blockNumber: string;
      logIndex: number;
      txHash: string;
      cursor: { blockNumber: string; logIndex: number };
      derivedAt: { blockNumber: string; blockHash: string; timestamp: string };
      type: string;
      payload: Record<string, unknown>;
      reorgFlag: boolean;
    }>;
    nextCursor: { blockNumber: string; logIndex: number };
    latestBlock: { blockNumber: string; blockHash: string; timestamp: string };
  }>;
}

describe('runReplayIngestion', () => {
  let sample: SampleFile;
  let stream: RegistryStream;
  let config: AppConfig;
  let metrics: IndexerMetrics;
  let logger: Logger;
  let db: DbClient;
  let gateway: ContestGatewayAdapter;
  let writer: IngestionWriter;
  let rpc: RpcEndpointManager;
  let health: HealthTracker;
  let dispatcher: JobDispatcher;
  let reconciliation: ReconciliationReportService;
  let params: ReplayIngestionParams;
  let report: ReconciliationReport;
  let pullEventsMock: Mock<[unknown], Promise<ContestGatewayPullResult>>;
  let writeBatchMock: Mock<[unknown], Promise<void>>;
  let dispatchReconcileMock: Mock<[ReconciliationReport], Promise<unknown>>;
  let buildReportMock: Mock<[unknown], ReconciliationReport>;

  beforeEach(() => {
    sample = JSON.parse(fs.readFileSync(samplePath, 'utf8')) as SampleFile;
    stream = {
      contestId: sample.contestId,
      chainId: sample.chainId,
      addresses: { registrar: sample.addresses.registrar },
      startBlock: BigInt(sample.startBlock),
      metadata: {},
    };

    config = {
      environment: 'test',
      service: {
        port: 0,
        pollIntervalMs: 100,
        maxBatchSize: 200,
      },
      registry: {
        refreshIntervalMs: 60_000,
        sourcePath: samplePath,
      },
      database: { url: 'postgres://example' },
      queue: { url: 'postgres://example' },
      rpc: {
        failureThreshold: 3,
        cooldownMs: 60_000,
        chains: [],
      },
      validation: {
        registry: [],
        environmentId: 'test',
      },
    } as unknown as AppConfig;

    metrics = {
      registry: {
        metrics: vi.fn(),
        resetMetrics: vi.fn(),
        setDefaultLabels: vi.fn(),
      },
      ingestionLagBlocks: { set: vi.fn() },
      ingestionBatchDuration: { observe: vi.fn() },
      ingestionBatchSize: { observe: vi.fn() },
      rpcFailureCounter: { inc: vi.fn() },
      rpcSwitchCounter: { inc: vi.fn() },
    } as unknown as IndexerMetrics;

    logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;

    db = {
      isReady: true,
      init: vi.fn(),
      shutdown: vi.fn(),
      readIngestionStatus: vi.fn(),
      writeIngestionEvent: vi.fn(),
      writeContestDomain: vi.fn(),
    } as unknown as DbClient;

    const batches = sample.batches.slice(0, 2).map((batch) => ({
      events: batch.events.map((event) => ({
        type: event.type,
        blockNumber: BigInt(event.blockNumber),
        logIndex: event.logIndex,
        txHash: event.txHash as `0x${string}`,
        cursor: {
          blockNumber: BigInt(event.cursor.blockNumber),
          logIndex: event.cursor.logIndex,
        },
        payload: event.payload,
        reorgFlag: event.reorgFlag,
        derivedAt: {
          blockNumber: BigInt(event.derivedAt.blockNumber),
          blockHash: event.derivedAt.blockHash as `0x${string}`,
          timestamp: event.derivedAt.timestamp,
        },
      })),
      nextCursor: {
        blockNumber: BigInt(batch.nextCursor.blockNumber),
        logIndex: batch.nextCursor.logIndex,
      },
      latestBlock: {
        blockNumber: BigInt(batch.latestBlock.blockNumber),
        blockHash: batch.latestBlock.blockHash as `0x${string}`,
        timestamp: batch.latestBlock.timestamp,
      },
    }));

    let call = 0;
    pullEventsMock = vi.fn<[unknown], Promise<ContestGatewayPullResult>>().mockImplementation(() => {
        const result = batches[Math.min(call, batches.length - 1)]!;
        call += 1;
        return Promise.resolve({ batch: result, rpc: null } satisfies ContestGatewayPullResult);
      });
    gateway = {
      pullEvents: pullEventsMock,
    } as unknown as ContestGatewayAdapter;

    writeBatchMock = vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined);
    writer = {
      writeBatch: writeBatchMock,
      registerDomainHandler: vi.fn(),
    } as unknown as IngestionWriter;

    rpc = {
      getActiveEndpoint: vi.fn().mockReturnValue(null),
    } as unknown as RpcEndpointManager;

    health = new HealthTracker({ clock: () => Date.now() });
    health.register(stream, 'live');

    dispatchReconcileMock = vi.fn<[ReconciliationReport], Promise<unknown>>().mockResolvedValue('job-123');
    dispatcher = {
      dispatchReplay: vi.fn(),
      dispatchReconcile: dispatchReconcileMock,
      dispatchMilestone: vi.fn(),
    } as unknown as JobDispatcher;

    report = {
      reportId: 'rep-1',
      contestId: stream.contestId,
      chainId: stream.chainId,
      range: { fromBlock: '1', toBlock: '2' },
      generatedAt: new Date().toISOString(),
      discrepancies: [],
      status: 'pending_review',
      actorContext: null,
    } as unknown as ReconciliationReport;

    buildReportMock = vi.fn<[unknown], ReconciliationReport>().mockReturnValue(report);
    reconciliation = {
      buildReport: buildReportMock,
    } as unknown as ReconciliationReportService;

    params = {
      stream,
      fromBlock: BigInt(sample.batches[0]!.events[0]!.cursor.blockNumber),
      toBlock: BigInt(sample.batches.at(-1)!.latestBlock.blockNumber),
      reason: 'reorg-detected',
      actor: 'ops@example',
    } satisfies ReplayIngestionParams;
  });

  it('replays the requested range and dispatches reconciliation report', async () => {
    const result = await runReplayIngestion(
      {
        config,
        db,
        gateway,
        writer,
        metrics,
        logger,
        rpc,
        health,
        jobDispatcher: dispatcher,
        reconciliation,
      } as unknown as ReplayIngestionDependencies,
      params,
    );

    expect(writeBatchMock).toHaveBeenCalled();
    expect(writeBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stream,
        advanceCursor: false,
      }),
    );
    expect(dispatchReconcileMock).toHaveBeenCalledWith(report);
    expect(buildReportMock).toHaveBeenCalled();
    expect(result.eventsProcessed).toBeGreaterThan(0);
    expect(health.getMode({ contestId: stream.contestId, chainId: stream.chainId })).toBe('live');
  });

  it('restores live mode and records failure when writer throws', async () => {
    writeBatchMock.mockRejectedValueOnce(new Error('db down'));

    await expect(
      runReplayIngestion(
        {
          config,
          db,
          gateway,
          writer,
          metrics,
          logger,
          rpc,
          health,
          jobDispatcher: dispatcher,
          reconciliation,
        } as unknown as ReplayIngestionDependencies,
        params,
      ),
    ).rejects.toThrow('db down');

    expect(health.getMode({ contestId: stream.contestId, chainId: stream.chainId })).toBe('live');
    const snapshot = health.getState({ contestId: stream.contestId, chainId: stream.chainId });
    expect(snapshot?.errorStreak).toBeGreaterThan(0);
  });
});
