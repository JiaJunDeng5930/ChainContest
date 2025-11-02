import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedHttpError } from '@/lib/http/errors';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const RUNTIME_PATH = '/api/runtime/config';

const buildSessionStub = () => ({
  session: {
    user: {
      id: 'user-1',
      walletAddress: '0xabc',
      addressChecksum: '0xABC'
    },
    expires: new Date(Date.now() + 60_000).toISOString()
  },
  user: {
    id: 'user-1',
    walletAddress: '0xabc',
    addressChecksum: '0xABC'
  },
  sessionToken: 'token-123',
  needsRefresh: false
});

describe('GET /api/runtime/config', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns runtime configuration payload when available', async () => {
    const loadRuntimeConfig = vi.fn().mockResolvedValue({
      rpcUrl: 'https://rpc.chaincontest.test',
      chainId: 11155111,
      devPort: 4100,
      defaultAccount: '0x0000000000000000000000000000000000000001',
      contracts: [
        {
          id: 'contest',
          name: 'Contest',
          address: '0x0000000000000000000000000000000000000002',
          abiPath: '/abi/Contest.json',
          tags: ['core']
        }
      ]
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(buildSessionStub()),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/runtime/runtimeConfig', () => ({
      loadRuntimeConfig
    }));

    const { GET } = await import('../../app/api/runtime/config/route');

    const response = await GET(
      createRouteRequest(RUNTIME_PATH, {
        method: 'GET'
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const payload = (await response.json()) as {
      rpcUrl: string;
      chainId: number;
      devPort: number;
      defaultAccount: string;
      contracts: Array<Record<string, unknown>>;
    };

    expect(payload).toStrictEqual({
      rpcUrl: 'https://rpc.chaincontest.test',
      chainId: 11155111,
      devPort: 4100,
      defaultAccount: '0x0000000000000000000000000000000000000001',
      contracts: [
        {
          id: 'contest',
          name: 'Contest',
          address: '0x0000000000000000000000000000000000000002',
          abiPath: '/abi/Contest.json',
          tags: ['core']
        }
      ]
    });

    expect(loadRuntimeConfig).toHaveBeenCalledTimes(1);
  });

  it('returns 204 when runtime configuration is empty', async () => {
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(buildSessionStub()),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/runtime/runtimeConfig', () => ({
      loadRuntimeConfig: vi.fn().mockResolvedValue(null)
    }));

    const { GET } = await import('../../app/api/runtime/config/route');

    const response = await GET(
      createRouteRequest(RUNTIME_PATH, {
        method: 'GET'
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('maps service unavailable errors to 503 responses', async () => {
    class SessionMissingError extends Error {}

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(buildSessionStub()),
      SessionNotFoundError: SessionMissingError
    }));

    const { httpErrors } = await vi.importActual<typeof import('@/lib/http/errors')>('@/lib/http/errors');

    vi.doMock('@/lib/runtime/runtimeConfig', () => ({
      loadRuntimeConfig: vi.fn().mockRejectedValue(httpErrors.serviceUnavailable('Config backend offline'))
    }));

    const { GET } = await import('../../app/api/runtime/config/route');

    const response = await GET(
      createRouteRequest(RUNTIME_PATH, {
        method: 'GET'
      })
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as NormalizedHttpError['body'];
    expect(body.code).toBe('service_unavailable');
    expect(body.message).toBe('Config backend offline');
  });

  it('returns 204 when no active session is found', async () => {
    class SessionMissingError extends Error {}

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockRejectedValue(new SessionMissingError('missing session')),
      SessionNotFoundError: SessionMissingError
    }));

    vi.doMock('@/lib/runtime/runtimeConfig', () => ({
      loadRuntimeConfig: vi.fn()
    }));

    const { GET } = await import('../../app/api/runtime/config/route');

    const response = await GET(
      createRouteRequest(RUNTIME_PATH, {
        method: 'GET'
      })
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});
