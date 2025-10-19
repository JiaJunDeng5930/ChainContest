import { describe, expect, it } from 'vitest';
import {
  createContestChainGateway,
  type CreateContestChainGatewayOptions,
} from '../src/gateway/createContestChainGateway';
import { createContestIdentifier } from '../src/gateway/domainModels';
import type { ContestDefinition } from '../src/gateway/types';
import { createInMemoryContestDataProvider } from '../src/runtime/inMemoryContestDataProvider';
import type { RpcClientFactory, SignerLocator } from '../src/adapters/rpcClientFactory';
import type {
  GatewayValidationAdapter,
  ValidationContext,
  FrozenValidationResult,
} from '../src/policies/validationContext';

const stubValidationResult: FrozenValidationResult = Object.freeze({
  status: 'success',
  validatedTypes: Object.freeze([]),
  firstError: null,
  metrics: undefined,
});

const stubValidationAdapter: GatewayValidationAdapter = {
  context: {} as ValidationContext,
  validateRequest: () => stubValidationResult,
  validateType: () => stubValidationResult,
  assertValid: () => stubValidationResult,
  assertTypeValid: () => stubValidationResult,
};

const contest = createContestIdentifier({
  contestId: 'contest-events',
  chainId: 100,
  addresses: { registrar: '0x0000000000000000000000000000000000000eee' },
});

const eventA = {
  type: 'registration' as const,
  blockNumber: 10n,
  logIndex: 0,
  txHash: '0xa',
  cursor: { blockNumber: 10n, logIndex: 0 },
  payload: { participant: 'alice' },
  reorgFlag: false,
  derivedAt: {
    blockNumber: 10n,
    blockHash: '0xaa',
  },
};

const eventB = {
  type: 'rebalance' as const,
  blockNumber: 10n,
  logIndex: 1,
  txHash: '0xb',
  cursor: { blockNumber: 10n, logIndex: 1 },
  payload: { participant: 'bob' },
  reorgFlag: false,
  derivedAt: {
    blockNumber: 10n,
    blockHash: '0xbb',
  },
};

const eventC = {
  type: 'settlement' as const,
  blockNumber: 11n,
  logIndex: 0,
  txHash: '0xc',
  cursor: { blockNumber: 11n, logIndex: 0 },
  payload: { operator: 'op' },
  reorgFlag: false,
  derivedAt: {
    blockNumber: 11n,
    blockHash: '0xcc',
  },
};

const definition: ContestDefinition = {
  contest,
  phase: 'sealed',
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
    blockNumber: 12n,
    blockHash: '0xdd',
    timestamp: '2025-10-19T14:00:00Z',
  },
  registration: {
    window: {
      opensAt: '2025-10-18T00:00:00Z',
      closesAt: '2025-10-19T00:00:00Z',
    },
    requirement: {
      tokenAddress: '0x0000000000000000000000000000000000000fff',
      amount: '0',
      spender: '0x0000000000000000000000000000000000000fff',
    },
    template: {
      call: {
        to: '0x0000000000000000000000000000000000000fff',
        data: '0x',
      },
    },
  },
  participants: {},
  events: {
    events: [eventB, eventC, eventA],
  },
};

const createGateway = (definitions: ContestDefinition[]) => {
  const dataProvider = createInMemoryContestDataProvider(definitions);
  (dataProvider as { register?: (definition: ContestDefinition) => void }).register?.(
    definitions[0],
  );
  const rpcClientFactory = Object.assign(
    () => ({}) as ReturnType<RpcClientFactory>,
    { clear: () => undefined },
  ) as RpcClientFactory;
  const signerLocator: SignerLocator = async () =>
    ({} as Awaited<ReturnType<SignerLocator>>);

  const options: CreateContestChainGatewayOptions = {
    validators: stubValidationAdapter,
    rpcClientFactory,
    signerLocator,
    dataProvider,
  };

  return createContestChainGateway(options);
};

describe('pullContestEvents', () => {
  it('returns events sorted and next cursor at last event', async () => {
    const gateway = createGateway([definition]);

    const batch = await gateway.pullContestEvents({ contest });

    expect(batch.events).toHaveLength(3);
    expect(batch.events[0].logIndex).toBe(0);
    expect(batch.events[0].blockNumber).toBe(10n);
    expect(batch.nextCursor.blockNumber).toBe(11n);
  });

  it('respects cursor and limit options', async () => {
    const gateway = createGateway([definition]);

    const batch = await gateway.pullContestEvents({
      contest,
      cursor: { blockNumber: 10n, logIndex: 0 },
      limit: 1,
    });

    expect(batch.events).toHaveLength(1);
    expect(batch.events[0].txHash).toBe('0xb');
    expect(batch.nextCursor.logIndex).toBe(1);
  });

  it('returns fallback cursor when no events', async () => {
    const emptyDefinition: ContestDefinition = {
      ...definition,
      events: { events: [] },
    };
    const gateway = createGateway([emptyDefinition]);

    const batch = await gateway.pullContestEvents({
      contest: emptyDefinition.contest,
      cursor: { blockNumber: 5n, logIndex: 2 },
    });

    expect(batch.events).toHaveLength(0);
    expect(batch.nextCursor.blockNumber).toBe(5n);
  });
});
