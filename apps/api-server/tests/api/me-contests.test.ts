import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/me/contests';

describe('GET /api/me/contests', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns created contests using creator query', async () => {
    const queryCreatorContests = vi.fn().mockResolvedValue({
      items: [
        {
          status: 'accepted',
          request: {
            requestId: 'req-1',
            userId: 'user-1',
            networkId: 10,
            payload: { name: 'Velocity Cup' },
            createdAt: new Date('2025-10-24T00:00:00.000Z'),
            updatedAt: new Date('2025-10-24T00:00:00.000Z')
          },
          artifact: null,
          contest: null
        }
      ],
      nextCursor: null
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue({
        session: {},
        user: { id: 'user-1', walletAddress: '0xabc', addressChecksum: '0xABC' },
        sessionToken: 'token',
        needsRefresh: false
      }),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        queryCreatorContests,
        queryUserContests: vi.fn()
      }
    }));

    const { GET } = await import('../../app/api/me/contests/route');

    const response = await GET(
      createRouteRequest(`${ROUTE_PATH}?kind=created`, { method: 'GET' })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.kind).toBe('created');
    expect(body.items[0].request.requestId).toBe('req-1');
  });

  it('returns participated contests summary', async () => {
    const queryUserContests = vi.fn().mockResolvedValue({
      items: [
        {
          contest: {
            contestId: 'contest-1',
            chainId: 10,
            contractAddress: '0x1111111111111111111111111111111111111111',
            internalKey: null,
            status: 'active',
            timeWindowStart: new Date('2025-10-01T00:00:00.000Z'),
            timeWindowEnd: new Date('2025-10-10T00:00:00.000Z'),
            originTag: 'factory',
            sealedAt: null,
            metadata: {},
            createdAt: new Date('2025-10-01T00:00:00.000Z'),
            updatedAt: new Date('2025-10-02T00:00:00.000Z')
          },
          participations: [],
          rewardClaims: [],
          lastActivity: new Date('2025-10-03T00:00:00.000Z')
        }
      ],
      nextCursor: null
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue({
        session: {},
        user: { id: 'user-1', walletAddress: '0xabc', addressChecksum: '0xABC' },
        sessionToken: 'token',
        needsRefresh: false
      }),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        queryCreatorContests: vi.fn(),
        queryUserContests
      }
    }));

    const { GET } = await import('../../app/api/me/contests/route');

    const response = await GET(
      createRouteRequest(`${ROUTE_PATH}?kind=participated`, { method: 'GET' })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.kind).toBe('participated');
    expect(body.items[0].contest.contestId).toBe('contest-1');
  });
});
