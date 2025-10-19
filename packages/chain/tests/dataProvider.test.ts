import { describe, expect, it } from 'vitest';
import { createInMemoryContestDataProvider } from '../src/runtime/inMemoryContestDataProvider';
import { createContestIdentifier } from '../src/gateway/domainModels';
import type { ContestDefinition } from '../src/gateway/types';

const contest = createContestIdentifier({
  contestId: 'missing-contest',
  chainId: 1,
  addresses: { registrar: '0x0000000000000000000000000000000000000001' },
});

const definition: ContestDefinition = {
  contest,
  phase: 'registering',
  timeline: {},
  prizePool: {
    currentBalance: '0',
    accumulatedInflow: '0',
  },
  registrationCapacity: {
    registered: 0,
    maximum: 0,
    isFull: false,
  },
  qualificationVerdict: {
    result: 'pass',
  },
  derivedAt: {
    blockNumber: 0n,
    blockHash: '0x0',
    timestamp: '1970-01-01T00:00:00Z',
  },
  registration: {
    window: {
      opensAt: '1970-01-01T00:00:00Z',
      closesAt: '1970-01-02T00:00:00Z',
    },
    requirement: {
      tokenAddress: '0x0000000000000000000000000000000000000002',
      amount: '0',
      spender: '0x0000000000000000000000000000000000000002',
    },
    template: {
      call: {
        to: '0x0000000000000000000000000000000000000002',
        data: '0x',
      },
    },
  },
  participants: {},
};

describe('InMemoryContestDataProvider', () => {
  it('throws when contest missing', async () => {
    const provider = createInMemoryContestDataProvider([]);

    await expect(provider.loadContestDefinition(contest)).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    });
  });

  it('returns registered contest after manual registration', async () => {
    const provider = createInMemoryContestDataProvider([]) as unknown as {
      register: (definition: ContestDefinition) => void;
      loadContestDefinition: typeof provider.loadContestDefinition;
    };

    provider.register(definition);

    const loaded = await provider.loadContestDefinition(contest);
    expect(loaded.contest.contestId).toBe('missing-contest');
  });
});
