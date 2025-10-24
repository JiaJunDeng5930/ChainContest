import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContestDefinition, RegistrationExecutionResult } from '@chaincontest/chain';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest } from '../utils/request';

const ROUTE_PATH = '/api/contests/contest-123/execute/register';

const contestDefinition: ContestDefinition = {
  contest: {
    contestId: 'contest-123',
    chainId: 11155111,
    gatewayVersion: '1.0.0',
    addresses: {
      registrar: '0x0000000000000000000000000000000000000011'
    }
  },
  phase: 'registering',
  timeline: {},
  prizePool: {
    currentBalance: '0',
    accumulatedInflow: '0'
  },
  registrationCapacity: {
    registered: 0,
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
      amount: '1',
      spender: '0x00000000000000000000000000000000000000bb'
    },
    template: {
      call: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef',
        value: 0n,
        gasLimit: 21000n
      }
    }
  },
  participants: {}
};

describe('POST /api/contests/[contestId]/execute/register', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
  });

  it('returns execution result from chain gateway', async () => {
    const sessionStub = {
      session: {},
      user: {
        id: 'user-1',
        walletAddress: '0xabc',
        addressChecksum: '0xABC'
      },
      sessionToken: 'token-xyz',
      needsRefresh: false
    };

    const executionResult: RegistrationExecutionResult = {
      status: 'executed',
      transaction: {
        to: '0x00000000000000000000000000000000000000cc',
        data: '0xdeadbeef',
        value: 0n,
        gasLimit: 21000n
      },
      requiredApprovals: [],
      derivedAt: {
        blockNumber: 123456n,
        blockHash: '0xabcabc',
        timestamp: '2025-10-05T00:00:00.000Z'
      }
    };

    vi.doMock('@/lib/auth/session', () => ({
      requireSession: vi.fn().mockResolvedValue(sessionStub),
      SessionNotFoundError: class extends Error {}
    }));

    vi.doMock('@/lib/contests/definitionBuilder', () => ({
      buildContestDefinition: vi.fn().mockResolvedValue(contestDefinition)
    }));

    vi.doMock('@/lib/chain/gateway', () => ({
      withContestGateway: vi.fn(async (_options, handler) => {
        const gateway = {
          executeParticipantRegistration: vi.fn().mockResolvedValue(executionResult)
        };
        return handler(gateway as never);
      })
    }));

    const { POST } = await import('../../app/api/contests/[contestId]/execute/register/route');

    const response = await POST(
      createRouteRequest(ROUTE_PATH, {
        method: 'POST',
        body: {
          participant: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('executed');
    expect(body.transaction.to).toBe('0x00000000000000000000000000000000000000cc');
    expect(body.derivedAt.blockNumber).toBe(123456);
  });
});
