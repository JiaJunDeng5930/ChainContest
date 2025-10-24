import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/contests/create';

describe('POST /api/contests/create', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns 401 when session missing', async () => {
    vi.doMock('@/lib/auth/session', () => {
      class MockSessionNotFoundError extends Error {}
      return {
        requireSession: vi.fn().mockRejectedValue(new MockSessionNotFoundError()),
        SessionNotFoundError: MockSessionNotFoundError
      };
    });

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        createContestCreationRequest: vi.fn(),
        recordContestDeploymentArtifact: vi.fn(),
        getContestCreationRequest: vi.fn()
      }
    }));

    vi.doMock('@/lib/chain/creationGateway', () => ({
      getCreationGateway: vi.fn().mockReturnValue({
        executeContestDeployment: vi.fn(),
        registerOrganizerContract: vi.fn()
      })
    }));

    const { POST } = await import('../../app/api/contests/create/route');
    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: { networkId: 10, payload: {} }
      })
    );

    expect(response.status).toBe(401);
  });

  it('validates request body', async () => {
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
        createContestCreationRequest: vi.fn(),
        recordContestDeploymentArtifact: vi.fn(),
        getContestCreationRequest: vi.fn()
      }
    }));

    vi.doMock('@/lib/chain/creationGateway', () => ({
      getCreationGateway: vi.fn().mockReturnValue({
        executeContestDeployment: vi.fn(),
        registerOrganizerContract: vi.fn()
      })
    }));

    const { POST } = await import('../../app/api/contests/create/route');
    const invalidRequest = createRouteRequest(ROUTE_PATH, {
      method: 'POST',
      body: { networkId: 'not-a-number', payload: {} }
    });

    const response = await POST(invalidRequest);
    expect(response.status).toBe(400);
  });

  it('creates a contest request and returns receipt summary', async () => {
    const requireSession = vi.fn().mockResolvedValue({
      session: {},
      user: { id: 'user-42', walletAddress: '0xabc', addressChecksum: '0xABC' },
      sessionToken: 'token',
      needsRefresh: false
    });

    const creationAggregate = {
      request: {
        requestId: 'req-1',
        userId: 'user-42',
        networkId: 10,
        payload: { name: 'Velocity Cup' },
        createdAt: new Date('2025-10-24T00:00:00.000Z'),
        updatedAt: new Date('2025-10-24T00:00:00.000Z')
      },
      artifact: null,
      status: 'accepted'
    };

    const persistedAggregate = {
      ...creationAggregate,
      artifact: {
        artifactId: 'artifact-1',
        requestId: 'req-1',
        contestId: null,
        networkId: 10,
        registrarAddress: '0x1111111111111111111111111111111111111111',
        treasuryAddress: '0x2222222222222222222222222222222222222222',
        settlementAddress: '0x3333333333333333333333333333333333333333',
        rewardsAddress: '0x4444444444444444444444444444444444444444',
        metadata: { seedDigest: 'abc' },
        createdAt: new Date('2025-10-24T00:00:00.000Z'),
        updatedAt: new Date('2025-10-24T00:00:00.000Z')
      }
    };

    const createContestCreationRequest = vi.fn().mockResolvedValue(creationAggregate);
    const recordContestDeploymentArtifact = vi.fn().mockResolvedValue(persistedAggregate.artifact);
    const getContestCreationRequest = vi.fn().mockResolvedValue(persistedAggregate);

    vi.doMock('@/lib/auth/session', () => ({
      requireSession,
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        createContestCreationRequest,
        recordContestDeploymentArtifact,
        getContestCreationRequest,
        queryCreatorContests: vi.fn()
      }
    }));

    const executeContestDeployment = vi.fn().mockResolvedValue({
      status: 'accepted',
      requestId: 'req-1',
      organizer: '0xabc',
      networkId: 10,
      artifact: {
        networkId: 10,
        registrarAddress: '0x1111111111111111111111111111111111111111',
        treasuryAddress: '0x2222222222222222222222222222222222222222',
        settlementAddress: '0x3333333333333333333333333333333333333333',
        rewardsAddress: '0x4444444444444444444444444444444444444444',
        metadata: { seedDigest: 'abc' }
      },
      acceptedAt: '2025-10-24T00:00:00.000Z',
      metadata: { payloadSummary: 1 }
    });

    vi.doMock('@/lib/chain/creationGateway', () => ({
      getCreationGateway: vi.fn().mockReturnValue({
        executeContestDeployment,
        registerOrganizerContract: vi.fn()
      })
    }));

    const { POST } = await import('../../app/api/contests/create/route');
    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          networkId: 10,
          payload: { name: 'Velocity Cup' }
        }
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();

    expect(body.status).toBe('accepted');
    expect(body.request.requestId).toBe('req-1');
    expect(body.artifact.registrarAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(body.receipt.acceptedAt).toBe('2025-10-24T00:00:00.000Z');

    expect(createContestCreationRequest).toHaveBeenCalledWith({
      userId: 'user-42',
      networkId: 10,
      payload: { name: 'Velocity Cup' }
    });
    expect(recordContestDeploymentArtifact).toHaveBeenCalledWith({
      requestId: 'req-1',
      networkId: 10,
      contestId: null,
      registrarAddress: '0x1111111111111111111111111111111111111111',
      treasuryAddress: '0x2222222222222222222222222222222222222222',
      settlementAddress: '0x3333333333333333333333333333333333333333',
      rewardsAddress: '0x4444444444444444444444444444444444444444',
      metadata: { seedDigest: 'abc' }
    });
    expect(getContestCreationRequest).toHaveBeenCalledWith('req-1');
  });
});
