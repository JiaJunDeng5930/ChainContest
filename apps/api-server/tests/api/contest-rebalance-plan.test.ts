import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContestChainGateway,
  ContestDefinition,
  RebalancePlan
} from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/contests/contest-123/rebalance-plan';

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

describe('POST /api/contests/[contestId]/rebalance-plan', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('返回 ready 计划并映射策略检查', async () => {
    const readyPlan: RebalancePlan = {
      status: 'ready',
      policyChecks: [
        {
          rule: 'cooldown',
          status: 'pass',
          message: 'Cooldown satisfied'
        }
      ],
      transaction: {
        to: '0x00000000000000000000000000000000000000dd',
        data: '0xbeef',
        value: 0n,
        gasLimit: 250000n,
        route: {
          steps: ['wrap-eth', 'swap'],
          minimumOutput: '1000',
          maximumSlippageBps: 50
        }
      },
      rollbackAdvice: 'If execution fails, contact support',
      derivedAt: {
        blockNumber: 222222n,
        blockHash: '0x2222',
        timestamp: '2025-10-05T01:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const planPortfolioRebalance = vi.fn().mockResolvedValue(readyPlan);
    const withContestGateway = vi.fn(async (
      _options,
      handler: (gateway: ContestChainGateway) => Promise<RebalancePlan>
    ) => {
      const gateway = {
        planPortfolioRebalance
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

    const { POST } = await import('../../app/api/contests/[contestId]/rebalance-plan/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa',
          intent: {
            sellAsset: '0x00000000000000000000000000000000000000aa',
            buyAsset: '0x00000000000000000000000000000000000000bb',
            amount: '1000'
          },
          blockTag: 12345678
        }
      })
    );

    expect(response.status).toBe(200);

    expect(buildContestDefinition).toHaveBeenCalledWith(
      {
        contestId: 'contest-123',
        participant: '0x00000000000000000000000000000000000000aa',
        blockTag: 12345678
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

    expect(planPortfolioRebalance).toHaveBeenCalledWith({
      contest: contestDefinition.contest,
      participant: '0x00000000000000000000000000000000000000aa',
      intent: {
        sellAsset: '0x00000000000000000000000000000000000000aa',
        buyAsset: '0x00000000000000000000000000000000000000bb',
        amount: '1000'
      },
      blockTag: 12345678
    });

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'ready',
      checks: [
        {
          rule: 'cooldown',
          passed: true,
          message: 'Cooldown satisfied'
        }
      ],
      transaction: {
        to: '0x00000000000000000000000000000000000000dd',
        data: '0xbeef',
        value: '0',
        gasLimit: '250000',
        route: {
          steps: ['wrap-eth', 'swap'],
          minimumOutput: '1000',
          maximumSlippageBps: 50
        }
      },
      rollbackAdvice: 'If execution fails, contact support',
      derivedAt: {
        blockNumber: 222222,
        blockHash: '0x2222',
        timestamp: '2025-10-05T01:00:00.000Z'
      }
    });
  });

  it('返回 blocked 计划并给出额度超限原因', async () => {
    const blockedPlan: RebalancePlan = {
      status: 'blocked',
      policyChecks: [
        {
          rule: 'max-trade-limit',
          status: 'fail',
          message: 'Trade amount exceeds quota'
        }
      ],
      rejectionReason: {
        code: 'LIMIT_EXCEEDED',
        message: 'Maximum trade amount exceeded'
      },
      derivedAt: {
        blockNumber: 333333n,
        blockHash: '0x3333',
        timestamp: '2025-10-05T02:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const planPortfolioRebalance = vi.fn().mockResolvedValue(blockedPlan);

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
        handler: (gateway: ContestChainGateway) => Promise<RebalancePlan>
      ) => {
        const gateway = {
          planPortfolioRebalance
        } as unknown as ContestChainGateway;
        return handler(gateway);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/rebalance-plan/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa',
          intent: {
            sellAsset: '0x00000000000000000000000000000000000000aa',
            buyAsset: '0x00000000000000000000000000000000000000bb',
            amount: '999999999999'
          }
        }
      })
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'blocked',
      checks: [
        {
          rule: 'max-trade-limit',
          passed: false,
          message: 'Trade amount exceeds quota'
        }
      ],
      rejectionReason: {
        code: 'LIMIT_EXCEEDED',
        message: 'Maximum trade amount exceeded'
      },
      derivedAt: {
        blockNumber: 333333,
        blockHash: '0x3333',
        timestamp: '2025-10-05T02:00:00.000Z'
      }
    });
  });

  it('校验请求体并在缺失 intent 时返回 400', async () => {
    const buildContestDefinition = vi.fn();

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition
    }));

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn()
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/rebalance-plan/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa'
        }
      })
    );

    expect(response.status).toBe(400);
    expect(buildContestDefinition).not.toHaveBeenCalled();
  });
});

