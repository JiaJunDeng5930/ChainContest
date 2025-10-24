import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContestDefinition, RebalanceExecutionResult } from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/contests/contest-123/execute/rebalance';

const contestDefinition: ContestDefinition = {
  contest: {
    contestId: 'contest-123',
    chainId: 11155111,
    gatewayVersion: '1.0.0',
    addresses: {
      registrar: '0x0000000000000000000000000000000000000011'
    }
  },
  phase: 'live',
  timeline: {},
  prizePool: {
    currentBalance: '0',
    accumulatedInflow: '0'
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
    blockNumber: 999n,
    blockHash: '0xbeefbeef',
    timestamp: '2025-10-05T10:00:00.000Z'
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
  rebalance: {
    whitelist: [],
    maxTradeAmount: '1000',
    cooldownSeconds: 10,
    priceFreshnessSeconds: 60,
    lastPriceUpdatedAt: '2025-10-05T09:59:00.000Z',
    spender: '0x00000000000000000000000000000000000000dd',
    router: '0x00000000000000000000000000000000000000ee',
    slippageBps: 30,
    deadlineSeconds: 300
  },
  participants: {}
};

describe('POST /api/contests/[contestId]/execute/rebalance', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns rebalance execution payload', async () => {
    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue({
        session: {},
        user: {
          id: 'user-1',
          walletAddress: '0xabc',
          addressChecksum: '0xABC'
        },
        sessionToken: 'token-xyz',
        needsRefresh: false
      }),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition: vi.fn().mockResolvedValue(contestDefinition)
    }));

    const executionResult: RebalanceExecutionResult = {
      status: 'executed',
      transaction: {
        to: '0x00000000000000000000000000000000000000ee',
        data: '0xfeedface',
        value: 0n,
        route: { steps: ['swap'] }
      },
      rollbackAdvice: 'watch slippage',
      derivedAt: {
        blockNumber: 999n,
        blockHash: '0xbeefbeef',
        timestamp: '2025-10-05T10:00:00.000Z'
      }
    };

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn(async (_options, handler) => {
        const gateway = {
          executePortfolioRebalance: vi.fn().mockResolvedValue(executionResult)
        };
        return handler(gateway as never);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/execute/rebalance/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          intent: {
            sellAsset: '0x00000000000000000000000000000000000000aa',
            buyAsset: '0x00000000000000000000000000000000000000bb',
            amount: '1000'
          }
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('executed');
    expect(body.transaction.route.steps).toEqual(['swap']);
  });
});
