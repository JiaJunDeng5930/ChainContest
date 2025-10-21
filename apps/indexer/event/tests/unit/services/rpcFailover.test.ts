import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppConfig } from '../../../src/config/loadConfig.js';
import type { IndexerMetrics } from '../../../src/telemetry/metrics.js';
import type { Logger } from 'pino';
import { RpcEndpointManager } from '../../../src/services/rpcEndpointManager.js';

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
    chains: [
      {
        chainId: 11155111,
        endpoints: [
          {
            id: 'primary',
            url: 'https://primary.rpc',
            priority: 0,
            enabled: true,
          },
          {
            id: 'fallback',
            url: 'https://fallback.rpc',
            priority: 1,
            enabled: true,
          },
        ],
      },
      {
        chainId: 10,
        endpoints: [
          {
            id: 'single',
            url: 'https://op.rpc',
            priority: 0,
            enabled: true,
            maxConsecutiveFailures: 2,
            cooldownMs: 45_000,
          },
        ],
      },
    ],
  },
  validation: {
    registry: [],
    environmentId: 'test',
  },
});

describe('RpcEndpointManager', () => {
  let config: AppConfig;
  let metrics: IndexerMetrics;
  let logger: Logger;
  let now: number;
  let manager: RpcEndpointManager;
  let rpcFailureIncMock: ReturnType<typeof vi.fn>;
  let rpcSwitchIncMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    config = createConfig();
    rpcFailureIncMock = vi.fn();
    rpcSwitchIncMock = vi.fn();
    metrics = {
      registry: {
        metrics: vi.fn(),
        resetMetrics: vi.fn(),
        setDefaultLabels: vi.fn(),
      },
      ingestionLagBlocks: { set: vi.fn() },
      ingestionBatchDuration: { observe: vi.fn() },
      ingestionBatchSize: { observe: vi.fn() },
      rpcFailureCounter: { inc: rpcFailureIncMock },
      rpcSwitchCounter: { inc: rpcSwitchIncMock },
    } as unknown as IndexerMetrics;
    logger = {
      child: vi.fn().mockReturnThis(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;
    now = Date.now();
    manager = new RpcEndpointManager({
      config,
      metrics,
      logger,
      clock: () => now,
    });
  });

  it('returns primary endpoint until failure threshold is exceeded', () => {
    const selection = manager.getActiveEndpoint(11155111);
    expect(selection?.endpointId).toBe('primary');
    expect(selection?.degraded).toBe(false);

    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });
    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });
    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });

    const switched = manager.getActiveEndpoint(11155111);
    expect(switched?.endpointId).toBe('fallback');
    expect(rpcSwitchIncMock).toHaveBeenCalledWith({
      chainId: '11155111',
      fromEndpointId: 'primary',
      toEndpointId: 'fallback',
    });
  });

  it('resets streak after success and returns to primary when cooldown expires', () => {
    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });
    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });
    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });

    let current = manager.getActiveEndpoint(11155111);
    expect(current?.endpointId).toBe('fallback');

    manager.recordSuccess({ chainId: 11155111, endpointId: 'fallback' });
    current = manager.getActiveEndpoint(11155111);
    expect(current?.endpointId).toBe('fallback');

    now += config.rpc.cooldownMs + 1;
    current = manager.getActiveEndpoint(11155111);
    expect(current?.endpointId).toBe('primary');
  });

  it('marks chain as degraded when no alternative endpoint is available', () => {
    manager.recordFailure({ chainId: 10, endpointId: 'single', reason: 'timeout' });
    manager.recordFailure({ chainId: 10, endpointId: 'single', reason: 'timeout' });

    const selection = manager.getActiveEndpoint(10);
    expect(selection?.endpointId).toBe('single');
    expect(selection?.degraded).toBe(true);
    expect(selection?.cooldownEndsAt).toBeGreaterThan(now);

    now += 45_000;
    const recovered = manager.getActiveEndpoint(10);
    expect(recovered?.degraded).toBe(false);
    expect(recovered?.endpointId).toBe('single');
  });

  it('increments rpc failure counter with reason labels', () => {
    manager.recordFailure({ chainId: 11155111, endpointId: 'primary', reason: 'timeout' });
    expect(rpcFailureIncMock).toHaveBeenCalledWith({
      chainId: '11155111',
      endpointId: 'primary',
      reason: 'timeout',
    });
  });
});
