import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData } from 'viem';
import { contestArtifact } from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const FREEZE_ROUTE = '/api/contests/contest-123/freeze-plan';
const SEAL_ROUTE = '/api/contests/contest-123/seal-plan';
const FREEZE_CONFIRM_ROUTE = '/api/contests/contest-123/freeze-plan/confirm';
const SEAL_CONFIRM_ROUTE = '/api/contests/contest-123/seal-plan/confirm';

const ORGANIZER = '0x0000000000000000000000000000000000000abc';
const CONTEST_ADDRESS = '0x0000000000000000000000000000000000000def';

const sessionStub = {
  session: {
    user: {
      id: 'user-1',
      walletAddress: ORGANIZER,
      addressChecksum: ORGANIZER
    },
    expires: new Date(Date.now() + 30 * 60_000).toISOString()
  },
  user: {
    id: 'user-1',
    walletAddress: ORGANIZER,
    addressChecksum: ORGANIZER
  },
  sessionToken: 'token-xyz',
  needsRefresh: false
};

type ContestSnapshot = import('@/lib/contests/repository').ContestSnapshot;

const baseContest: ContestSnapshot = {
  contestId: 'contest-123',
  chainId: 31337,
  phase: 'active',
  timeline: {
    registrationOpensAt: '2025-01-01T00:00:00.000Z',
    registrationClosesAt: '2025-01-02T00:00:00.000Z'
  },
  prizePool: {
    currentBalance: '0'
  },
  registrationCapacity: {
    registered: 0,
    maximum: 100,
    isFull: false
  },
  derivedAt: {
    blockNumber: 0,
    blockHash: '0x0',
    timestamp: '2025-01-01T00:00:00.000Z'
  },
  metadata: {
    organizerWallet: ORGANIZER,
    chainGatewayDefinition: {
      contest: {
        addresses: {
          registrar: CONTEST_ADDRESS
        }
      },
      timeline: {}
    }
  },
  contractAddress: CONTEST_ADDRESS,
  status: 'active',
  originTag: 'factory'
};

describe('contest admin plan routes', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns ready freeze plan when live window has elapsed', async () => {
    const snapshot = {
      ...baseContest,
      metadata: {
        ...baseContest.metadata,
        chainGatewayDefinition: {
          ...baseContest.metadata?.chainGatewayDefinition,
          timeline: {
            tradingClosesAt: '2020-01-01T00:00:00.000Z'
          }
        }
      }
    };

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub)
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/freeze-plan/route');

    const response = await POST(
      createRouteRequest(FREEZE_ROUTE, { method: 'POST' }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; transaction: { to: string; data: string } };
    expect(body.status).toBe('ready');
    expect(body.transaction.to).toBe(CONTEST_ADDRESS);
    expect(body.transaction.data).toBe(
      encodeFunctionData({ abi: contestArtifact.abi, functionName: 'freeze' })
    );
  });

  it('blocks freeze plan when contest is still live', async () => {
    const snapshot = {
      ...baseContest,
      metadata: {
        ...baseContest.metadata,
        chainGatewayDefinition: {
          ...baseContest.metadata?.chainGatewayDefinition,
          timeline: {
            tradingClosesAt: '2999-01-01T00:00:00.000Z'
          }
        }
      }
    };

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub)
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/freeze-plan/route');

    const response = await POST(
      createRouteRequest(FREEZE_ROUTE, { method: 'POST' }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; reason: { code: string } };
    expect(body.status).toBe('blocked');
    expect(body.reason.code).toBe('contest_live');
  });

  it('rejects seal plan when caller is not organizer', async () => {
    const snapshot = { ...baseContest };

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue({
        ...sessionStub,
        user: { ...sessionStub.user, walletAddress: '0x0000000000000000000000000000000000000fff' }
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/seal-plan/route');

    const response = await POST(
      createRouteRequest(SEAL_ROUTE, { method: 'POST' }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(403);
  });

  it('returns ready seal plan for organizer', async () => {
    const snapshot = { ...baseContest };

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub)
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/seal-plan/route');

    const response = await POST(
      createRouteRequest(SEAL_ROUTE, { method: 'POST' }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; transaction: { to: string; data: string } };
    expect(body.status).toBe('ready');
    expect(body.transaction.to).toBe(CONTEST_ADDRESS);
    expect(body.transaction.data).toBe(
      encodeFunctionData({ abi: contestArtifact.abi, functionName: 'seal' })
    );
  });

  it('confirms freeze transaction and updates phase', async () => {
    const snapshot = { ...baseContest };
    const writeContestDomain = vi.fn().mockResolvedValue({ status: 'applied' });

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub)
    }));
    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn().mockResolvedValue(undefined),
      database: {
        writeContestDomain
      }
    }));
    vi.doMock('@/lib/contests/adminPlanUtils', async () => {
      const actual = await vi.importActual<typeof import('@/lib/contests/adminPlanUtils')>(
        '@/lib/contests/adminPlanUtils'
      );
      return {
        ...actual,
        waitForTransactionConfirmation: vi.fn().mockResolvedValue(undefined),
        readContestChainState: vi.fn().mockResolvedValue({ state: 3, frozenAt: 123, sealedAt: 0 })
      };
    });

    const { POST } = await import('../../app/api/contests/[contestId]/freeze-plan/confirm/route');

    const response = await POST(
      createRouteRequest(FREEZE_CONFIRM_ROUTE, {
        method: 'POST',
        body: { transactionHash: `0x${'1'.repeat(64)}` }
      }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(200);
    expect(writeContestDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_phase',
        payload: expect.objectContaining({
          phase: 'frozen',
          settlement: expect.objectContaining({
            ready: true,
            executed: false
          })
        })
      })
    );
  });

  it('rejects seal confirmation when chain state is not sealed', async () => {
    const snapshot = { ...baseContest };

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub)
    }));
    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn().mockResolvedValue(undefined),
      database: {
        writeContestDomain: vi.fn()
      }
    }));
    vi.doMock('@/lib/contests/adminPlanUtils', async () => {
      const actual = await vi.importActual<typeof import('@/lib/contests/adminPlanUtils')>(
        '@/lib/contests/adminPlanUtils'
      );
      return {
        ...actual,
        waitForTransactionConfirmation: vi.fn().mockResolvedValue(undefined),
        readContestChainState: vi.fn().mockResolvedValue({ state: 3, frozenAt: 0, sealedAt: 0 })
      };
    });

    const { POST } = await import('../../app/api/contests/[contestId]/seal-plan/confirm/route');

    const response = await POST(
      createRouteRequest(SEAL_CONFIRM_ROUTE, {
        method: 'POST',
        body: { transactionHash: `0x${'2'.repeat(64)}` }
      }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(409);
  });

  it('confirms seal transaction and updates settlement metadata', async () => {
    const snapshot = { ...baseContest };
    const writeContestDomain = vi.fn().mockResolvedValue({ status: 'applied' });

    vi.doMock('@/lib/contests/repository', () => ({
      getContest: vi.fn().mockResolvedValue(snapshot)
    }));
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub)
    }));
    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn().mockResolvedValue(undefined),
      database: {
        writeContestDomain
      }
    }));
    vi.doMock('@/lib/contests/adminPlanUtils', async () => {
      const actual = await vi.importActual<typeof import('@/lib/contests/adminPlanUtils')>(
        '@/lib/contests/adminPlanUtils'
      );
      return {
        ...actual,
        waitForTransactionConfirmation: vi.fn().mockResolvedValue(undefined),
        readContestChainState: vi.fn().mockResolvedValue({ state: 4, frozenAt: 123, sealedAt: 456 })
      };
    });

    const { POST } = await import('../../app/api/contests/[contestId]/seal-plan/confirm/route');

    const response = await POST(
      createRouteRequest(SEAL_CONFIRM_ROUTE, {
        method: 'POST',
        body: { transactionHash: `0x${'3'.repeat(64)}` }
      }),
      { params: { contestId: snapshot.contestId } }
    );

    expect(response.status).toBe(200);
    expect(writeContestDomain).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_phase',
        payload: expect.objectContaining({
          phase: 'sealed',
          settlement: expect.objectContaining({
            executed: true
          })
        })
      })
    );
  });
});
