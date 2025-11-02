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

    const contestPayload = {
      contestId: '0xf4cd9d671530ab87c8ce033782ef664f0358769e1ecdbe720d447eab7c679182',
      vaultComponentId: '511ddf08-b37c-49e6-9d83-61924818ad09',
      priceSourceComponentId: 'b38808cb-5dd6-4825-aed8-72b0d1fb742c',
      vaultImplementation: '0xb7f8bc63bbcad18155201308c8f3540b07f84f5e',
      config: {
        entryAsset: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        entryAmount: '1000000000000000000',
        entryFee: '1000000000000000',
        priceSource: '0xa51c1fc2f0d1a1b8494ed1fe312d7c3a78ed91c0',
        swapPool: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        priceToleranceBps: 50,
        settlementWindow: 3600,
        maxParticipants: 100,
        topK: 10
      },
      timeline: {
        registeringEnds: '1762021680',
        liveEnds: '1762025280',
        claimEnds: '1762028880'
      },
      initialPrizeAmount: '0',
      payoutSchedule: [6000, 3000, 1000],
      metadata: { title: 'Velocity Cup' }
    } as const;

    const creationAggregate = {
      request: {
        requestId: 'req-1',
        userId: 'user-42',
        networkId: 10,
        payload: expect.any(Object),
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
        contestAddress: '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9',
        registrarAddress: '0x1111111111111111111111111111111111111111',
        treasuryAddress: '0x2222222222222222222222222222222222222222',
        settlementAddress: '0x3333333333333333333333333333333333333333',
        rewardsAddress: '0x4444444444444444444444444444444444444444',
        transactionHash: '0x1234',
        confirmedAt: new Date('2025-10-24T00:00:01.000Z'),
        metadata: {
          transactions: {
            contest: {
              blockHash: '0xblock1',
              blockNumber: '1',
              confirmedAt: '2025-10-24T00:00:00.000Z'
            },
            vaultFactory: {
              blockHash: '0xblock2',
              blockNumber: '2',
              confirmedAt: '2025-10-24T00:00:00.500Z'
            },
            initialize: {
              blockHash: '0xblock3',
              blockNumber: '3',
              confirmedAt: '2025-10-24T00:00:01.000Z'
            }
          },
          chainGatewayDefinition: {
            contest: {
              contestId: contestPayload.contestId,
              chainId: 10
            }
          }
        },
        createdAt: new Date('2025-10-24T00:00:00.000Z'),
        updatedAt: new Date('2025-10-24T00:00:00.000Z')
      }
    };

    const createContestCreationRequest = vi.fn().mockResolvedValue(creationAggregate);
    const recordContestDeploymentArtifact = vi
      .fn()
      .mockResolvedValueOnce(persistedAggregate.artifact)
      .mockResolvedValueOnce({ ...persistedAggregate.artifact, contestId: 'contest-db-id' });
    const updateContestCreationRequestStatus = vi.fn().mockResolvedValue(persistedAggregate);
    const writeContestDomain = vi.fn().mockResolvedValue({ status: 'applied', contestId: 'contest-db-id' });
    const getContestCreationRequest = vi.fn().mockResolvedValue({
      ...persistedAggregate,
      artifact: { ...persistedAggregate.artifact, contestId: 'contest-db-id' }
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession,
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('viem', () => ({
      createPublicClient: () => ({
        readContract: vi.fn().mockResolvedValueOnce('ETH').mockResolvedValueOnce(18),
        getTransactionReceipt: vi.fn().mockResolvedValue({
          blockHash: '0xblock3',
          blockNumber: 3n
        }),
        getBlock: vi.fn().mockResolvedValue({
          timestamp: BigInt(1730000000)
        })
      }),
      erc20Abi: [],
      http: () => ({})
    }));

    const logContestDeployment = vi.fn();

    vi.doMock('@/lib/observability/logger', () => ({
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      logContestDeployment
    }));

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        createContestCreationRequest,
        recordContestDeploymentArtifact,
        getContestCreationRequest,
        queryCreatorContests: vi.fn(),
        updateContestCreationRequestStatus,
        writeContestDomain,
        getOrganizerComponent: vi
          .fn()
          .mockImplementation(({ componentId }: { componentId: string }) => {
            if (componentId === contestPayload.vaultComponentId) {
              return {
                id: contestPayload.vaultComponentId,
                componentType: 'vault_implementation',
                owner: '0xabc',
                walletAddress: '0xabc',
                contractAddress: contestPayload.vaultImplementation,
                networkId: 10,
                status: 'confirmed',
                configHash: 'hash-vault'
              };
            }
            return {
              id: contestPayload.priceSourceComponentId,
              componentType: 'price_source',
              owner: '0xabc',
              walletAddress: '0xabc',
              contractAddress: contestPayload.config.priceSource,
              networkId: 10,
              status: 'confirmed',
              configHash: 'hash-oracle'
            };
          }),
        queryContests: vi.fn().mockResolvedValue({ items: [] })
      }
    }));

    const executeContestDeployment = vi.fn().mockResolvedValue({
      status: 'accepted',
      requestId: 'req-1',
      organizer: '0xabc',
      networkId: 10,
      artifact: {
        networkId: 10,
        contestAddress: '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9',
        registrarAddress: '0x1111111111111111111111111111111111111111',
        treasuryAddress: '0x2222222222222222222222222222222222222222',
        settlementAddress: '0x3333333333333333333333333333333333333333',
        rewardsAddress: '0x4444444444444444444444444444444444444444',
        transactionHash: '0x1234',
        confirmedAt: '2025-10-24T00:00:01.000Z',
        metadata: {
          transactions: {
            initialize: {
              blockHash: '0xblock3',
              blockNumber: '3',
              confirmedAt: '2025-10-24T00:00:01.000Z'
            }
          }
        }
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
          payload: contestPayload
        }
      })
    );

    const body = await response.json();
    expect(response.status).toBe(201);

    expect(body.status).toBe('accepted');
    expect(body.request.requestId).toBe('req-1');
    expect(body.artifact.contestAddress).toBe('0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9');
    expect(body.receipt.acceptedAt).toBe('2025-10-24T00:00:00.000Z');

    expect(createContestCreationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-42',
        networkId: 10,
        payload: expect.objectContaining({ contestId: contestPayload.contestId })
      })
    );
    expect(recordContestDeploymentArtifact).toHaveBeenCalledTimes(2);
    expect(updateContestCreationRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        status: 'accepted'
      })
    );
    expect(writeContestDomain).toHaveBeenCalledWith({
      action: 'track',
      payload: expect.objectContaining({
        chainId: 10,
        contractAddress: '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9',
        internalKey: contestPayload.contestId
      })
    });
  });
});
