import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContestChainGateway,
  ContestDefinition,
  RegistrationPlan
} from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/contests/contest-123/registration-plan';

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
      spender: '0x00000000000000000000000000000000000000bb',
      symbol: 'CC',
      decimals: 18
    },
    template: {
      call: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef',
        value: 0n,
        gasLimit: 21000n
      },
      estimatedFees: {
        currency: 'ETH',
        estimatedCost: '0.01'
      }
    },
    approvals: [
      {
        tokenAddress: '0x00000000000000000000000000000000000000aa',
        spender: '0x00000000000000000000000000000000000000bb',
        amount: '1000000000000000000',
        symbol: 'CC',
        decimals: 18
      }
    ]
  },
  participants: {}
};

describe('POST /api/contests/[contestId]/registration-plan', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('返回 ready 计划并透传链上字段', async () => {
    const readyPlan: RegistrationPlan = {
      status: 'ready',
      qualifications: [
        {
          rule: 'eligibility-check',
          passed: true,
          severity: 'info',
          message: 'Participant eligible'
        }
      ],
      requiredApprovals: contestDefinition.registration.approvals ?? [],
      registrationCall: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef',
        value: 0n,
        gasLimit: 21000n
      },
      estimatedFees: {
        currency: 'ETH',
        estimatedCost: '0.01'
      },
      derivedAt: {
        blockNumber: 123456n,
        blockHash: '0xabcabc',
        timestamp: '2025-10-05T00:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const planParticipantRegistration = vi.fn().mockResolvedValue(readyPlan);
    const withContestGateway = vi.fn(async (
      _options,
      handler: (gateway: ContestChainGateway) => Promise<RegistrationPlan>
    ) => {
      const gateway = {
        planParticipantRegistration
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

    const { POST } = await import('../../app/api/contests/[contestId]/registration-plan/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa',
          referrer: '0x00000000000000000000000000000000000000ff',
          blockTag: 'latest'
        }
      })
    );

    expect(response.status).toBe(200);

    expect(buildContestDefinition).toHaveBeenCalledWith(
      {
        contestId: 'contest-123',
        participant: '0x00000000000000000000000000000000000000aa',
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

    expect(withContestGateway).toHaveBeenCalledTimes(1);
    expect(withContestGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: contestDefinition,
        contestId: 'contest-123',
        blockTag: 'latest'
      }),
      expect.any(Function)
    );

    expect(planParticipantRegistration).toHaveBeenCalledWith({
      contest: contestDefinition.contest,
      participant: '0x00000000000000000000000000000000000000aa',
      referrer: '0x00000000000000000000000000000000000000ff',
      blockTag: 'latest'
    });

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'ready',
      checks: [
        {
          rule: 'eligibility-check',
          passed: true,
          severity: 'info',
          message: 'Participant eligible'
        }
      ],
      requiredApprovals: [
        {
          tokenAddress: '0x00000000000000000000000000000000000000aa',
          spender: '0x00000000000000000000000000000000000000bb',
          amount: '1000000000000000000',
          symbol: 'CC',
          decimals: 18
        }
      ],
      transaction: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef',
        value: '0',
        gasLimit: '21000'
      },
      estimatedFees: {
        currency: 'ETH',
        estimatedCost: '0.01'
      },
      derivedAt: {
        blockNumber: 123456,
        blockHash: '0xabcabc',
        timestamp: '2025-10-05T00:00:00.000Z'
      }
    });
  });

  it('返回 blocked 计划并暴露阻断原因', async () => {
    const blockedPlan: RegistrationPlan = {
      status: 'blocked',
      qualifications: [
        {
          rule: 'balance-check',
          passed: false,
          severity: 'error',
          message: 'Insufficient balance'
        }
      ],
      requiredApprovals: [],
      rejectionReason: {
        code: 'INSUFFICIENT_BALANCE',
        message: '需要至少 1 ETH'
      },
      derivedAt: {
        blockNumber: 987654n,
        blockHash: '0xfeedface',
        timestamp: '2025-10-06T00:00:00.000Z'
      }
    };

    const buildContestDefinition = vi.fn().mockResolvedValue(contestDefinition);
    const planParticipantRegistration = vi.fn().mockResolvedValue(blockedPlan);

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
        handler: (gateway: ContestChainGateway) => Promise<RegistrationPlan>
      ) => {
        const gateway = {
          planParticipantRegistration
        } as unknown as ContestChainGateway;
        return handler(gateway);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/registration-plan/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0x00000000000000000000000000000000000000aa'
        }
      })
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toStrictEqual({
      status: 'blocked',
      checks: [
        {
          rule: 'balance-check',
          passed: false,
          severity: 'error',
          message: 'Insufficient balance'
        }
      ],
      requiredApprovals: [],
      rejectionReason: {
        code: 'INSUFFICIENT_BALANCE',
        message: '需要至少 1 ETH'
      },
      derivedAt: {
        blockNumber: 987654,
        blockHash: '0xfeedface',
        timestamp: '2025-10-06T00:00:00.000Z'
      }
    });
  });

  it('校验请求体并在缺失 participant 时返回 400', async () => {
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

    const { POST } = await import('../../app/api/contests/[contestId]/registration-plan/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {}
      })
    );

    expect(response.status).toBe(400);
    expect(buildContestDefinition).not.toHaveBeenCalled();
  });
});
