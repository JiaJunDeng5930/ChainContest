import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContestDefinition, RewardClaimResult, RedemptionResult } from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const contestDefinition: ContestDefinition = {
  contest: {
    contestId: 'contest-789',
    chainId: 11155111,
    gatewayVersion: '1.0.0',
    addresses: {
      registrar: '0x0000000000000000000000000000000000000011'
    }
  },
  phase: 'sealed',
  timeline: {},
  prizePool: {
    currentBalance: '0',
    accumulatedInflow: '0'
  },
  registrationCapacity: {
    registered: 0,
    maximum: 0,
    isFull: false
  },
  qualificationVerdict: {
    result: 'pass'
  },
  derivedAt: {
    blockNumber: 456n,
    blockHash: '0xfeedfeed',
    timestamp: '2025-10-05T12:00:00.000Z'
  },
  registration: {
    window: {
      opensAt: '2025-10-01T00:00:00.000Z',
      closesAt: '2025-10-10T00:00:00.000Z'
    },
    requirement: {
      tokenAddress: '0x00000000000000000000000000000000000000aa',
      amount: '1',
      spender: '0x00000000000000000000000000000000000000bb'
    },
    template: {
      call: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef',
        value: 0n
      }
    }
  },
  participants: {}
};

describe('POST /api/contests/[contestId]/execute/reward-claim', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('responds with reward claim result', async () => {
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue({
        session: {},
        user: { id: 'user-1', walletAddress: '0xabc', addressChecksum: '0xABC' },
        sessionToken: 'token',
        needsRefresh: false
      }),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition: vi.fn().mockResolvedValue(contestDefinition)
    }));

    const rewardResult: RewardClaimResult = {
      status: 'applied',
      payout: {
        amount: '100',
        currency: 'TOKEN',
        destination: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      },
      claimCall: {
        to: '0x00000000000000000000000000000000000000dd',
        data: '0xbeef',
        value: 0n
      },
      derivedAt: {
        blockNumber: 456n,
        blockHash: '0xfeedfeed',
        timestamp: '2025-10-05T12:00:00.000Z'
      }
    };

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn(async (_options, handler) => {
        const gateway = {
          executeRewardClaim: vi.fn().mockResolvedValue(rewardResult)
        };
        return handler(gateway as never);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/execute/reward-claim/route');

    const response = await POST(
      createRouteRequest('/api/contests/contest-789/execute/reward-claim', {
        method: 'POST',
        body: {
          participant: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('applied');
    expect(body.payout.amount).toBe('100');
  });
});

describe('POST /api/contests/[contestId]/execute/principal-redemption', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('responds with redemption result', async () => {
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue({
        session: {},
        user: { id: 'user-1', walletAddress: '0xabc', addressChecksum: '0xABC' },
        sessionToken: 'token',
        needsRefresh: false
      }),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition: vi.fn().mockResolvedValue(contestDefinition)
    }));

    const redemptionResult: RedemptionResult = {
      status: 'applied',
      payout: {
        amount: '50',
        currency: 'TOKEN',
        destination: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      derivedAt: {
        blockNumber: 456n,
        blockHash: '0xfeedfeed',
        timestamp: '2025-10-05T12:00:00.000Z'
      }
    };

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn(async (_options, handler) => {
        const gateway = {
          executePrincipalRedemption: vi.fn().mockResolvedValue(redemptionResult)
        };
        return handler(gateway as never);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/execute/principal-redemption/route');

    const response = await POST(
      createRouteRequest('/api/contests/contest-789/execute/principal-redemption', {
        method: 'POST',
        body: {
          participant: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('applied');
    expect(body.payout.amount).toBe('50');
  });
});
