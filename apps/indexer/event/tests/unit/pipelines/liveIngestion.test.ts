import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ContestEventBatch,
  ContestEventEnvelope,
  ContestEventType,
} from '@chaincontest/chain';
import { runLiveIngestion, type LiveIngestionDependencies } from '../../../src/pipelines/liveIngestion.js';
import type { RegistryStream } from '../../../src/services/ingestionRegistry.js';
import type { DbClient } from '../../../src/services/dbClient.js';
import type { ContestGatewayAdapter, ContestGatewayPullResult } from '../../../src/adapters/contestGateway.js';
import type { IngestionWriter } from '../../../src/services/ingestionWriter.js';
import type { IndexerMetrics } from '../../../src/telemetry/metrics.js';
import type { AppConfig } from '../../../src/config/loadConfig.js';
import type { Logger } from 'pino';
import type { RpcEndpointManager, RpcEndpointSelection } from '../../../src/services/rpcEndpointManager.js';
import { HealthTracker } from '../../../src/services/healthTracker.js';
import type { JobDispatcher } from '../../../src/services/jobDispatcher.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, '../../replay/sample-contest.json');

interface SampleFile {
  contestId: string;
  chainId: number;
  addresses: Record<string, string>;
  startBlock: string;
  batches: Array<{
    events: Array<{
      type: ContestEventType;
      blockNumber: string;
      logIndex: number;
      txHash: string;
      cursor: { blockNumber: string; logIndex: number };
      payload: Record<string, unknown>;
      reorgFlag: boolean;
      derivedAt: { blockNumber: string; blockHash: string; timestamp: string };
    }>;
    nextCursor: { blockNumber: string; logIndex: number };
    latestBlock: { blockNumber: string; blockHash: string; timestamp: string };
  }>;
}

describe('runLiveIngestion', () => {
  let sample: SampleFile;
  let stream: RegistryStream;
  let batch: ContestEventBatch;
  let db: DbClient;
  let gateway: ContestGatewayAdapter;
  let writer: IngestionWriter;
  let metrics: IndexerMetrics;
  let logger: Logger;
  let config: AppConfig;
  let rpc: RpcEndpointManager;
  let health: HealthTracker;
  let rpcSelection: RpcEndpointSelection;
  let jobDispatcher: JobDispatcher;
  let readIngestionStatusMock: Mock<[Record<string, unknown>], Promise<Record<string, unknown>>>;
  let pullEventsMock: Mock<[unknown], Promise<ContestGatewayPullResult>>;
  let writeBatchMock: Mock<[unknown], Promise<void>>;
  let batchDurationMock: Mock<[Record<string, string>, number], void>;
  let batchSizeMock: Mock<[Record<string, string>, number], void>;
  let dispatchMilestoneMock: Mock<[unknown], Promise<unknown>>;

  beforeEach(() => {
    sample = JSON.parse(fs.readFileSync(samplePath, 'utf8')) as SampleFile;
    stream = {
      contestId: sample.contestId,
      chainId: sample.chainId,
      addresses: {
        registrar: sample.addresses.registrar,
        settlement: sample.addresses.settlement,
      },
      startBlock: BigInt(sample.startBlock),
      metadata: {},
    };

    batch = createBatch(sample.batches[0]!);

    readIngestionStatusMock = vi.fn<[Record<string, unknown>], Promise<Record<string, unknown>>>().mockResolvedValue({
        status: 'untracked',
        cursorHeight: null,
        cursorHash: null,
        updatedAt: null,
        contestId: stream.contestId,
        chainId: stream.chainId,
        contractAddress: stream.addresses.registrar,
      });
    db = {
      isReady: true,
      init: vi.fn(),
      shutdown: vi.fn(),
      readIngestionStatus: readIngestionStatusMock,
      writeIngestionEvent: vi.fn(),
      writeContestDomain: vi.fn(),
    } as unknown as DbClient;

    rpcSelection = {
      chainId: stream.chainId,
      endpointId: 'primary',
      url: 'https://primary.rpc',
      degraded: false,
    };

    pullEventsMock = vi.fn<[unknown], Promise<ContestGatewayPullResult>>().mockResolvedValue({
      batch,
      rpc: rpcSelection,
    } satisfies ContestGatewayPullResult);
    gateway = {
      pullEvents: pullEventsMock,
    } as unknown as ContestGatewayAdapter;

    writeBatchMock = vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined);
    writer = {
      writeBatch: writeBatchMock,
      registerDomainHandler: vi.fn(),
    } as unknown as IngestionWriter;

    batchDurationMock = vi.fn<[Record<string, string>, number], void>();
    batchSizeMock = vi.fn<[Record<string, string>, number], void>();
    metrics = {
      registry: {
        metrics: vi.fn(),
        resetMetrics: vi.fn(),
        setDefaultLabels: vi.fn(),
      },
      ingestionLagBlocks: {
        set: vi.fn(),
      },
      ingestionBatchDuration: {
        observe: batchDurationMock,
      },
      ingestionBatchSize: {
        observe: batchSizeMock,
      },
      rpcFailureCounter: {
        inc: vi.fn(),
      },
      rpcSwitchCounter: {
        inc: vi.fn(),
      },
    } as unknown as IndexerMetrics;

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    config = {
      environment: 'test',
      service: {
        port: 0,
        pollIntervalMs: 100,
        maxBatchSize: 200,
      },
      registry: {
        refreshIntervalMs: 60000,
        sourcePath: samplePath,
      },
      database: { url: 'postgres://example' },
      queue: { url: 'postgres://example' },
      rpc: {
        failureThreshold: 3,
        cooldownMs: 60000,
        chains: [],
      },
      validation: {
        registry: [],
        environmentId: 'test',
      },
    } as unknown as AppConfig;

    rpc = {
      getActiveEndpoint: vi.fn().mockReturnValue(rpcSelection),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
      snapshot: vi.fn(),
    } as unknown as RpcEndpointManager;

    health = new HealthTracker({ clock: () => Date.now() });
    health.register(stream, 'live');

    dispatchMilestoneMock = vi.fn<[unknown], Promise<unknown>>();
    jobDispatcher = {
      dispatchReplay: vi.fn(),
      dispatchReconcile: vi.fn(),
      dispatchMilestone: dispatchMilestoneMock,
    } as unknown as JobDispatcher;
  });

  it('processes new events and advances cursor', async () => {
    const result = await runLiveIngestion(
      {
        config,
        db,
        gateway,
        writer,
        metrics,
        logger,
        rpc,
        health,
        jobDispatcher,
      } as LiveIngestionDependencies,
      stream,
    );

    expect(readIngestionStatusMock).toHaveBeenCalledWith({
      contestId: stream.contestId,
      chainId: stream.chainId,
      contractAddress: stream.addresses.registrar,
    });
    expect(pullEventsMock).toHaveBeenCalledWith({
      stream,
      cursor: undefined,
      fromBlock: stream.startBlock,
      limit: config.service.maxBatchSize,
    });
    expect(writeBatchMock).toHaveBeenCalledWith({ stream, batch });
    expect(batchDurationMock).toHaveBeenCalled();
    expect(batchSizeMock).toHaveBeenCalledWith(
      expect.objectContaining({ contestId: stream.contestId }),
      batch.events.length,
    );
    expect(result.eventsProcessed).toEqual(batch.events.length);
  });

  it('passes cursor when ingestion state exists', async () => {
    readIngestionStatusMock.mockResolvedValueOnce({
      status: 'tracked',
      cursorHeight: '120002',
      cursorHash: '0xhash',
      updatedAt: new Date(),
      contestId: stream.contestId,
      chainId: stream.chainId,
      contractAddress: stream.addresses.registrar,
    });

    await runLiveIngestion(
      {
        config,
        db,
        gateway,
        writer,
        metrics,
        logger,
        rpc,
        health,
        jobDispatcher,
      } as LiveIngestionDependencies,
      stream,
    );

    expect(pullEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stream,
        fromBlock: undefined,
        cursor: { blockNumber: BigInt('120002'), logIndex: 0 },
      }),
    );
  });

  it('propagates gateway errors', async () => {
    pullEventsMock.mockRejectedValueOnce(new Error('rpc down'));

    await expect(
      runLiveIngestion(
        {
          config,
          db,
          gateway,
          writer,
          metrics,
          logger,
          rpc,
          health,
          jobDispatcher,
        } as LiveIngestionDependencies,
        stream,
      ),
    ).rejects.toThrow('rpc down');
  });

  it('dispatches milestone jobs for eligible events', async () => {
    await runLiveIngestion(
      {
        config,
        db,
        gateway,
        writer,
        metrics,
        logger,
        rpc,
        health,
        jobDispatcher,
      } as LiveIngestionDependencies,
      stream,
    );

    expect(dispatchMilestoneMock).toHaveBeenCalled();
  });
});

const createBatch = (input: SampleFile['batches'][number]): ContestEventBatch => ({
  events: input.events.map((event) => ({
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
  } satisfies ContestEventEnvelope)),
  nextCursor: {
    blockNumber: BigInt(input.nextCursor.blockNumber),
    logIndex: input.nextCursor.logIndex,
  },
  latestBlock: {
    blockNumber: BigInt(input.latestBlock.blockNumber),
    blockHash: input.latestBlock.blockHash as `0x${string}`,
    timestamp: input.latestBlock.timestamp,
  },
});
