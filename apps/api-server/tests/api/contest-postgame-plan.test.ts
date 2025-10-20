import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContestChainGateway,
  ContestDefinition,
  RedemptionResult,
  RewardClaimResult,
  SettlementResult
} from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const BASE_PATH = '/api/contests/contest-123';

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

const contestDefinition: ContestDefinition = {
  contest: {
    contestId: 'contest-123',
    chainId: 11155111,
    gatewayVersion: '1.0.0',
    addresses: {
      registrar: '0x0000000000000000000000000000000000000011',
      treasury: '0x0000000000000000000000000000000000000022'
    }
  },
  phase: 'registering',
  timeline: {
    registrationOpensAt: '2025-10-01T00:00:00.000Z',
    registrationClosesAt: '2025-10-10T00:00:00.000Z'
  },
  prizePool: {
    currentBalance: '1000000000000000000',
    accumulatedInflow: '5000000000000000000'
  },
  registrationCapacity: {
    registered: 10,
    maximum: 128,
    isFull: false
  },
  qualificationVerdict: {
    result: 'pass'
  },
  derivedAt: {
    blockNumber: 123456n,
    blockHash: '0xabcabc',
    timestamp: '2025-10-05T00:00:00.000Z'
  },
  registration: {
    window: {
      opensAt: '2025-10-01T00:00:00.000Z',
      closesAt: '2025-10-10T00:00:00.000Z'
    },
    requirement: {
      tokenAddress: '0x00000000000000000000000000000000000000aa',
      amount: '1000000000000000000',
      spender: '0x00000000000000000000000000000000000000bb'
    },
    template: {
      call: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef'
      }
    }
  },
  participants: {}
};

describe('POST /api/contests/[contestId]/settlement', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('返回 applied 结算计划', async () => {
    const settlementResult: SettlementResult = {
      status: 'applied',
      settlementCall: {
        to: '0x00000000000000000000000000000000000000ee',
        data: '0xfeed',
        value: 0n,
        gasLimit: 500000n
      },
      detail: {
        leaderboardVersion: '15',
        snapshotHash: '0x1234',
        operator: '0x0000000000000000000000000000000000000aaa'
      },
      frozenAt: {
        blockNumber: 444444n,
        blockHash: '0x4444',
        timestamp: '2025-10-05T03:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const executeContestSettlement = vi.fn().mockResolvedValue(settlementResult);
    const withContestGateway = vi.fn(async (
      _options,
      handler: (gateway: ContestChainGateway) => Promise<SettlementResult>
    ) => {
      const gateway = {
        executeContestSettlement
      } as unknown as ContestChainGateway;
      return handler(gateway);
    });

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition
    }));

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/settlement/route');

    const response = await POST(
      createRouteRequest(`${BASE_PATH}/settlement`, {
        method: 'POST',
        body: {
          caller: '0x0000000000000000000000000000000000000aaa',
          blockTag: 'latest'
        }
      })
    );

    expect(response.status).toBe(200);

    expect(buildContestDefinition).toHaveBeenCalledWith(
      {
        contestId: 'contest-123',
        blockTag: 'latest'
      },
      {
        session: {
          userId: 'user-1',
          walletAddress: '0xabc',
          addressChecksum: '0xABC',
          sessionToken: 'token-xyz'
        }
      }
    );

    expect(executeContestSettlement).toHaveBeenCalledWith({
      contest: contestDefinition.contest,
      caller: '0x0000000000000000000000000000000000000aaa',
      blockTag: 'latest'
    });

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'applied',
      settlementCall: {
        to: '0x00000000000000000000000000000000000000ee',
        data: '0xfeed',
        value: '0',
        gasLimit: '500000'
      },
      detail: {
        leaderboardVersion: '15',
        snapshotHash: '0x1234',
        operator: '0x0000000000000000000000000000000000000aaa'
      },
      frozenAt: {
        blockNumber: 444444,
        blockHash: '0x4444',
        timestamp: '2025-10-05T03:00:00.000Z'
      }
    });
  });
});

describe('POST /api/contests/[contestId]/reward-claim', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('返回 noop 奖励结果并包含原因', async () => {
    const rewardResult: RewardClaimResult = {
      status: 'noop',
      reason: {
        code: 'ALREADY_CLAIMED',
        message: 'Reward already claimed'
      },
      derivedAt: {
        blockNumber: 555555n,
        blockHash: '0x5555',
        timestamp: '2025-10-05T04:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const executeRewardClaim = vi.fn().mockResolvedValue(rewardResult);

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition
    }));

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn(async (
        _options,
        handler: (gateway: ContestChainGateway) => Promise<RewardClaimResult>
      ) => {
        const gateway = {
          executeRewardClaim
        } as unknown as ContestChainGateway;
        return handler(gateway);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/reward-claim/route');

    const response = await POST(
      createRouteRequest(`${BASE_PATH}/reward-claim`, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa'
        }
      })
    );

    expect(response.status).toBe(200);
    expect(executeRewardClaim).toHaveBeenCalledWith({
      contest: contestDefinition.contest,
      participant: '0x00000000000000000000000000000000000000aa'
    });

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'noop',
      reason: {
        code: 'ALREADY_CLAIMED',
        message: 'Reward already claimed'
      },
      derivedAt: {
        blockNumber: 555555,
        blockHash: '0x5555',
        timestamp: '2025-10-05T04:00:00.000Z'
      }
    });
  });
});

describe('POST /api/contests/[contestId]/principal-redemption', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('返回 blocked 赎回结果', async () => {
    const redemptionResult: RedemptionResult = {
      status: 'blocked',
      reason: {
        code: 'REDEMPTION_NOT_AVAILABLE',
        message: 'Contest not settled yet'
      },
      derivedAt: {
        blockNumber: 666666n,
        blockHash: '0x6666',
        timestamp: '2025-10-05T05:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const executePrincipalRedemption = vi.fn().mockResolvedValue(redemptionResult);

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition
    }));

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn(async (
        _options,
        handler: (gateway: ContestChainGateway) => Promise<RedemptionResult>
      ) => {
        const gateway = {
          executePrincipalRedemption
        } as unknown as ContestChainGateway;
        return handler(gateway);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/principal-redemption/route');

    const response = await POST(
      createRouteRequest(`${BASE_PATH}/principal-redemption`, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa',
          blockTag: 999999
        }
      })
    );

    expect(response.status).toBe(200);
    expect(executePrincipalRedemption).toHaveBeenCalledWith({
      contest: contestDefinition.contest,
      participant: '0x00000000000000000000000000000000000000aa',
      blockTag: 999999
    });

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'blocked',
      reason: {
        code: 'REDEMPTION_NOT_AVAILABLE',
        message: 'Contest not settled yet'
      },
      derivedAt: {
        blockNumber: 666666,
        blockHash: '0x6666',
        timestamp: '2025-10-05T05:00:00.000Z'
      }
    });
  });
});

