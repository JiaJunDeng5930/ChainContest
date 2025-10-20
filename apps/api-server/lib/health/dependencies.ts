import { performance } from 'node:perf_hooks';
import { getEnv } from '@/lib/config/env';
import { getAuthAdapter } from '@/lib/auth/config';
import { getPool } from '@/lib/db/pool';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export type DependencyState = 'ok' | 'degraded' | 'down';

export interface DependencyStatus {
  status: DependencyState;
  description: string;
  latencyMs?: number;
  detail?: unknown;
}

export interface HealthReport {
  status: DependencyState;
  dependencies: Record<string, DependencyStatus>;
}

const degrade = (dependencies: DependencyStatus[]): DependencyState => {
  if (dependencies.some((entry) => entry.status === 'down')) {
    return 'down';
  }
  if (dependencies.some((entry) => entry.status === 'degraded')) {
    return 'degraded';
  }
  return 'ok';
};

const checkDatabase = async (): Promise<DependencyStatus> => {
  const startedAt = performance.now();
  try {
    const pool = getPool();
    await pool.query<{ ok: number }>('select 1 as ok');
    return {
      status: 'ok',
      description: 'Database connection established',
      latencyMs: performance.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'down',
      description: 'Database unavailable',
      latencyMs: performance.now() - startedAt,
      detail: error instanceof Error ? error.message : error
    };
  }
};

const checkAuthAdapter = async (): Promise<DependencyStatus> => {
  const startedAt = performance.now();
  try {
    const adapter = getAuthAdapter();
    await Promise.resolve();
    const hasSessionOps = typeof adapter.updateSession === 'function' && typeof adapter.deleteSession === 'function';

    return {
      status: hasSessionOps ? 'ok' : 'degraded',
      description: hasSessionOps ? 'Auth adapter reachable' : 'Auth adapter missing session operations',
      latencyMs: performance.now() - startedAt,
      detail: {
        updateSession: typeof adapter.updateSession,
        deleteSession: typeof adapter.deleteSession
      }
    };
  } catch (error) {
    return {
      status: 'degraded',
      description: 'Auth adapter check failed',
      latencyMs: performance.now() - startedAt,
      detail: error instanceof Error ? error.message : error
    };
  }
};

const checkChainRpc = async (): Promise<DependencyStatus> => {
  const env = getEnv();
  const startedAt = performance.now();
  const rpcUrl = env.chain.primaryRpc;

  if (!rpcUrl) {
    return {
      status: 'degraded',
      description: 'Chain RPC endpoint not configured'
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        status: 'degraded',
        description: 'Chain RPC responded with non-OK status',
        latencyMs: performance.now() - startedAt,
        detail: { status: response.status }
      };
    }

    const payload: { result?: unknown } = await response.json();
    return {
      status: 'ok',
      description: 'Chain RPC reachable',
      latencyMs: performance.now() - startedAt,
      detail: { chainId: payload?.result }
    };
  } catch (error) {
    return {
      status: 'degraded',
      description: 'Chain RPC request failed',
      latencyMs: performance.now() - startedAt,
      detail: error instanceof Error ? error.message : error
    };
  }
};

export const evaluateDependencies = async (): Promise<HealthReport> => {
  const [db, auth, chain] = await Promise.all([checkDatabase(), checkAuthAdapter(), checkChainRpc()]);
  const dependencies: Record<string, DependencyStatus> = {
    database: db,
    auth: auth,
    chainRpc: chain
  };

  return {
    status: degrade(Object.values(dependencies)),
    dependencies
  };
};
