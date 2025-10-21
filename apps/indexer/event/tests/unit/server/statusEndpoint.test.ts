import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppConfig } from '../../../src/config/loadConfig.js';
import type { IndexerMetrics } from '../../../src/telemetry/metrics.js';
import type { Logger } from 'pino';
import { createHttpServer } from '../../../src/server/httpServer.js';
import { HealthTracker } from '../../../src/services/healthTracker.js';
import type { RegistryStream } from '../../../src/services/ingestionRegistry.js';
import type { RpcEndpointSelection } from '../../../src/services/rpcEndpointManager.js';

const createConfig = (): AppConfig => ({
  environment: 'test',
  service: {
    port: 0,
    pollIntervalMs: 1_000,
    maxBatchSize: 200,
  },
  registry: {
    refreshIntervalMs: 60_000,
    sourcePath: undefined,
  },
  database: {
    url: 'postgres://example',
  },
  queue: {
    url: 'postgres://example',
  },
  rpc: {
    failureThreshold: 3,
    cooldownMs: 30_000,
    chains: [],
  },
  validation: {
    registry: [],
    environmentId: 'test',
  },
});

describe('status endpoint', () => {
  let config: AppConfig;
  let metrics: IndexerMetrics;
  let logger: Logger;
  let tracker: HealthTracker;
  let stream: RegistryStream;
  let rpc: RpcEndpointSelection;
  let replayHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    config = createConfig();
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
    tracker = new HealthTracker({ clock: () => Date.now() });
    stream = {
      contestId: 'cont-1',
      chainId: 11155111,
      addresses: { registrar: '0xabc' },
      startBlock: 0n,
      metadata: {},
    };
    tracker.register(stream, 'live');
    rpc = {
      chainId: stream.chainId,
      endpointId: 'primary',
      url: 'https://primary.rpc',
      degraded: false,
    };
    replayHandler = vi.fn();
  });

  it('returns stream snapshot with lag information', async () => {
    tracker.recordSuccess({ stream, lagBlocks: 12, rpc, nextPollAt: Date.now() + 6_000 });

    const http = createHttpServer({ config, logger, metrics });
    http.setHealthEvaluator(() => Promise.resolve(tracker.getHealth()));
    http.setStatusProvider(() => Promise.resolve(tracker.snapshot()));
    http.setReplayHandler((payload) => replayHandler(payload));

    const response = await http.instance.inject({ method: 'GET', url: '/v1/indexer/status' });
    expect(response.statusCode).toBe(200);

    const payload: unknown = response.json();
    const streams = (payload as { streams: Array<Record<string, unknown>> }).streams;
    expect(Array.isArray(streams)).toBe(true);
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({
      contestId: stream.contestId,
      chainId: stream.chainId,
      blockLag: 12,
      activeRpc: 'primary',
      mode: 'live',
    });
  });

  it('reflects degraded state in /healthz when error streak exceeds threshold', async () => {
    const http = createHttpServer({ config, logger, metrics });
    http.setHealthEvaluator(() => Promise.resolve(tracker.getHealth()));
    http.setStatusProvider(() => Promise.resolve(tracker.snapshot()));
    http.setReplayHandler((payload) => replayHandler(payload));

    tracker.recordFailure({ stream, reason: 'timeout', rpc: { ...rpc, degraded: true } });
    tracker.recordFailure({ stream, reason: 'timeout', rpc: { ...rpc, degraded: true } });
    tracker.recordFailure({ stream, reason: 'timeout', rpc: { ...rpc, degraded: true } });

    const response = await http.instance.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    const payload: unknown = response.json();
    const { status, reasons } = payload as { status: string; reasons: string[] };
    expect(status).toBe('error');
    expect(reasons).toContain('error-streak');
  });

  it('queues replay request via POST /v1/indexer/replays', async () => {
    replayHandler.mockResolvedValue({
      jobId: 'job-1',
      scheduledRange: { fromBlock: '10', toBlock: '20' },
    });

    const http = createHttpServer({ config, logger, metrics });
    http.setHealthEvaluator(() => Promise.resolve(tracker.getHealth()));
    http.setStatusProvider(() => Promise.resolve(tracker.snapshot()));
    http.setReplayHandler((payload) => replayHandler(payload));

    const response = await http.instance.inject({
      method: 'POST',
      url: '/v1/indexer/replays',
      payload: {
        contestId: stream.contestId,
        chainId: stream.chainId,
        fromBlock: '10',
        toBlock: '20',
        reason: 'manual-check',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(replayHandler).toHaveBeenCalledWith({
      contestId: stream.contestId,
      chainId: stream.chainId,
      fromBlock: '10',
      toBlock: '20',
      reason: 'manual-check',
      actor: undefined,
    });
  });

  it('propagates handler errors with status codes', async () => {
    replayHandler.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }));

    const http = createHttpServer({ config, logger, metrics });
    http.setHealthEvaluator(() => Promise.resolve(tracker.getHealth()));
    http.setStatusProvider(() => Promise.resolve(tracker.snapshot()));
    http.setReplayHandler((payload) => replayHandler(payload));

    const response = await http.instance.inject({
      method: 'POST',
      url: '/v1/indexer/replays',
      payload: {
        contestId: 'missing',
        chainId: stream.chainId,
        fromBlock: '10',
        toBlock: '12',
        reason: 'manual-check',
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
