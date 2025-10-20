import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedHttpError } from '@/lib/http/errors';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const CONTESTS_PATH = '/api/contests';

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

const sampleContest = {
  contestId: 'contest-1',
  chainId: 11155111,
  phase: 'registering',
  timeline: {
    registrationOpensAt: '2025-10-01T00:00:00.000Z',
    registrationClosesAt: '2025-10-10T00:00:00.000Z'
  },
  prizePool: {
    currentBalance: '1000000000000000000',
    accumulatedInflow: '5000000000000000000',
    valuationAnchor: {
      price: '1.0',
      currency: 'USD',
      observedAt: '2025-09-30T23:59:59.000Z'
    }
  },
  registrationCapacity: {
    registered: 42,
    maximum: 128,
    isFull: false
  },
  leaderboard: {
    version: '5',
    entries: [
      { rank: 1, walletAddress: '0x0000000000000000000000000000000000000001', score: '123.45' }
    ]
  },
  derivedAt: {
    blockNumber: 123456,
    blockHash: '0xabc',
    timestamp: '2025-09-30T23:59:59.000Z'
  }
};

describe('GET /api/contests', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns list of contests with filters', async () => {
    const listContests = vi.fn().mockResolvedValue({
      items: [sampleContest],
      nextCursor: 'cursor-2'
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/repository', () => ({
      listContests,
      getContest: vi.fn()
    }));

    const { GET } = await import('../../app/api/contests/route');

    const response = await GET(
      createRouteRequest(`${CONTESTS_PATH}?chainId=11155111&status=registering`, {
        method: 'GET'
      })
    );

    expect(listContests).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 11155111,
        status: 'registering'
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const payload = (await response.json()) as {
      items: typeof sampleContest[];
      nextCursor: string | null;
    };

    expect(payload).toStrictEqual({
      items: [
        {
          ...sampleContest,
          derivedAt: {
            blockNumber: Number(sampleContest.derivedAt.blockNumber),
            blockHash: '0xabc',
            timestamp: '2025-09-30T23:59:59.000Z'
          }
        }
      ],
      nextCursor: 'cursor-2'
    });
  });

  it('rejects invalid query parameters', async () => {
    const listContests = vi.fn();

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/repository', () => ({
      listContests,
      getContest: vi.fn()
    }));

    const { GET } = await import('../../app/api/contests/route');

    const response = await GET(
      createRouteRequest(`${CONTESTS_PATH}?chainId=abc`, {
        method: 'GET'
      })
    );

    expect(response.status).toBe(400);
    expect(listContests).not.toHaveBeenCalled();
  });

  it('returns 401 when session is missing', async () => {
    class SessionMissing extends Error {}

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockRejectedValue(new SessionMissing('missing')),
      SessionNotFoundError: SessionMissing
    }));

    vi.doMock('@/lib/contests/repository', () => ({
      listContests: vi.fn(),
      getContest: vi.fn()
    }));

    const { GET } = await import('../../app/api/contests/route');

    const response = await GET(
      createRouteRequest(CONTESTS_PATH, {
        method: 'GET'
      })
    );

    expect(response.status).toBe(401);
  });
});

describe('GET /api/contests/[contestId]', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns contest snapshot for given contestId', async () => {
    const getContest = vi.fn().mockResolvedValue(sampleContest);

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/repository', () => ({
      listContests: vi.fn(),
      getContest
    }));

    const { GET } = await import('../../app/api/contests/[contestId]/route');

    const response = await GET(
      createRouteRequest(`${CONTESTS_PATH}/${sampleContest.contestId}`, {
        method: 'GET'
      }),
      { params: { contestId: sampleContest.contestId } }
    );

    expect(getContest).toHaveBeenCalledWith(sampleContest.contestId);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as typeof sampleContest;
    expect(payload).toStrictEqual({
      ...sampleContest,
      derivedAt: {
        blockNumber: Number(sampleContest.derivedAt.blockNumber),
        blockHash: '0xabc',
        timestamp: '2025-09-30T23:59:59.000Z'
      }
    });
  });

  it('returns 404 when repository raises not-found error', async () => {
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    const { httpErrors } = await vi.importActual<typeof import('@/lib/http/errors')>('@/lib/http/errors');

    vi.doMock('@/lib/contests/repository', () => ({
      listContests: vi.fn(),
      getContest: vi.fn().mockRejectedValue(httpErrors.notFound('Contest not found'))
    }));

    const { GET } = await import('../../app/api/contests/[contestId]/route');

    const response = await GET(
      createRouteRequest(`${CONTESTS_PATH}/missing`, { method: 'GET' }),
      { params: { contestId: 'missing' } }
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as NormalizedHttpError['body'];
    expect(body.code).toBe('not_found');
  });

  it('returns 401 when session lookup fails', async () => {
    class SessionMissing extends Error {}

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockRejectedValue(new SessionMissing('missing')),
      SessionNotFoundError: SessionMissing
    }));

    vi.doMock('@/lib/contests/repository', () => ({
      listContests: vi.fn(),
      getContest: vi.fn()
    }));

    const { GET } = await import('../../app/api/contests/[contestId]/route');

    const response = await GET(
      createRouteRequest(`${CONTESTS_PATH}/contest-1`, { method: 'GET' }),
      { params: { contestId: 'contest-1' } }
    );

    expect(response.status).toBe(401);
  });
});
