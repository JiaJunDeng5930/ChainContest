import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/contests/contest-xyz/price-source/update';

const sessionStub = {
  session: {
    user: {
      id: 'user-1',
      walletAddress: '0xabc',
      addressChecksum: '0xABC'
    },
    expires: new Date(Date.now() + 30 * 60_000).toISOString()
  },
  user: {
    id: 'user-1',
    walletAddress: '0xabc',
    addressChecksum: '0xABC'
  },
  sessionToken: 'token-xyz',
  needsRefresh: false
};

describe('POST /api/contests/[contestId]/price-source/update', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns transaction call when price source is configured', async () => {
    const buildContestDefinition = vi.fn().mockResolvedValue({
      contest: {
        contestId: 'contest-xyz',
        chainId: 31337,
        addresses: {
          registrar: '0x0000000000000000000000000000000000000011'
        }
      },
      rebalance: {
        priceSource: '0x00000000000000000000000000000000000000aa'
      }
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/price-source/update/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST'
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { transaction: { to: string; data: string; value: string } };
    expect(body.transaction.to).toBe('0x00000000000000000000000000000000000000aa');
    expect(body.transaction.data.startsWith('0x')).toBe(true);
    expect(body.transaction.value).toBe('0');
  });

  it('returns conflict when price source missing', async () => {
    const buildContestDefinition = vi.fn().mockResolvedValue({
      contest: {
        contestId: 'contest-xyz',
        chainId: 31337,
        addresses: {
          registrar: '0x0000000000000000000000000000000000000011'
        }
      },
      rebalance: undefined
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/price-source/update/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST'
      })
    );

    expect(response.status).toBe(409);
  });
});
