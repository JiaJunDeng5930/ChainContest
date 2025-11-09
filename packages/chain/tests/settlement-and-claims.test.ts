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

const operator = '0x0000000000000000000000000000000000000500';
const winner = '0x0000000000000000000000000000000000000600';
const winnerClaimed = '0x0000000000000000000000000000000000000601';
const winnerBlocked = '0x0000000000000000000000000000000000000602';
const redeemer = '0x0000000000000000000000000000000000000700';
const redeemerCompleted = '0x0000000000000000000000000000000000000701';
const redeemerBlocked = '0x0000000000000000000000000000000000000702';

const baseContestDefinition: ContestDefinition = {
  contest: createContestIdentifier({
    contestId: 'contest-settlement',
    chainId: 10,
    addresses: { registrar: operator },
  }),
  phase: 'sealed',
  timeline: {
    settlementAvailableAt: '2025-10-19T12:00:00Z',
  },
  prizePool: {
    currentBalance: '50000000000000000000',
    accumulatedInflow: '80000000000000000000',
  },
  registrationCapacity: {
    registered: 50,
    maximum: 50,
    isFull: true,
  },
  qualificationVerdict: {
    result: 'pass',
  },
  derivedAt: {
    blockNumber: 9000n,
    blockHash: '0xbead',
    timestamp: '2025-10-19T13:00:00Z',
  },
  registration: {
    window: {
      opensAt: '2025-10-01T00:00:00Z',
      closesAt: '2025-10-07T00:00:00Z',
    },
    requirement: {
      tokenAddress: operator,
      amount: '0',
      spender: operator,
    },
    template: {
      call: {
        to: operator,
        data: '0x',
      },
    },
  },
  settlement: {
    ready: true,
    executed: false,
    settlementCall: {
      to: operator,
      data: '0x01',
      gasLimit: 400000n,
    },
    rejectionReason: {
      code: 'RULE_VIOLATION',
      message: 'Settlement prerequisites unmet',
    },
    frozenAt: {
      blockNumber: 8999n,
      blockHash: '0xbeac',
    },
    leaderboardVersion: 'v2',
    snapshotHash: '0xabc',
    operator,
    detail: { note: 'checkpoint' },
  },
  rewards: {
    [winner.toLowerCase()]: {
      status: 'eligible',
      payout: {
        amount: '1000000000000000000',
        currency: 'ETH',
        destination: winner,
      },
      claimCall: {
        to: operator,
        data: '0x02',
      },
      derivedAt: {
        blockNumber: 9001n,
        blockHash: '0xbeaf',
      },
    },
    [winnerClaimed.toLowerCase()]: {
      status: 'claimed',
      payout: {
        amount: '500000000000000000',
        currency: 'ETH',
        destination: winnerClaimed,
      },
      claimCall: {
        to: operator,
        data: '0x03',
      },
      derivedAt: {
        blockNumber: 9001n,
        blockHash: '0xbeaf',
      },
    },
    [winnerBlocked.toLowerCase()]: {
      status: 'blocked',
      derivedAt: {
        blockNumber: 9001n,
        blockHash: '0xbeaf',
      },
    },
  },
  redemption: {
    [redeemer.toLowerCase()]: {
      status: 'eligible',
      payout: {
        amount: '2000000000000000000',
        currency: 'ETH',
        destination: redeemer,
      },
      redemptionCall: {
        to: operator,
        data: '0x04',
      },
      derivedAt: {
        blockNumber: 9002n,
        blockHash: '0xbebe',
      },
    },
    [redeemerCompleted.toLowerCase()]: {
      status: 'redeemed',
      payout: {
        amount: '1500000000000000000',
        currency: 'ETH',
        destination: redeemerCompleted,
      },
      redemptionCall: {
        to: operator,
        data: '0x05',
      },
      derivedAt: {
        blockNumber: 9002n,
        blockHash: '0xbebe',
      },
    },
    [redeemerBlocked.toLowerCase()]: {
      status: 'blocked',
      derivedAt: {
        blockNumber: 9002n,
        blockHash: '0xbebe',
      },
    },
  },
  participants: {
    [winner.toLowerCase()]: {
      address: winner,
      balances: {},
      allowances: {},
      registered: true,
    },
    [winnerClaimed.toLowerCase()]: {
      address: winnerClaimed,
      balances: {},
      allowances: {},
      registered: true,
    },
    [winnerBlocked.toLowerCase()]: {
      address: winnerBlocked,
      balances: {},
      allowances: {},
      registered: true,
    },
    [redeemer.toLowerCase()]: {
      address: redeemer,
      balances: {},
      allowances: {},
      registered: true,
    },
    [redeemerCompleted.toLowerCase()]: {
      address: redeemerCompleted,
      balances: {},
      allowances: {},
      registered: true,
    },
    [redeemerBlocked.toLowerCase()]: {
      address: redeemerBlocked,
      balances: {},
      allowances: {},
      registered: true,
    },
  },
};

const buildDefinition = (
  overrides?: Partial<ContestDefinition>,
): ContestDefinition => {
  const clone = structuredClone(baseContestDefinition);
  if (!overrides) {
    return clone;
  }

  return {
    ...clone,
    ...overrides,
    settlement: overrides.settlement
      ? { ...clone.settlement!, ...overrides.settlement }
      : clone.settlement,
    rewards: overrides.rewards
      ? { ...clone.rewards, ...overrides.rewards }
      : clone.rewards,
    redemption: overrides.redemption
      ? { ...clone.redemption, ...overrides.redemption }
      : clone.redemption,
    participants: overrides.participants
      ? { ...clone.participants, ...overrides.participants }
      : clone.participants,
  } as ContestDefinition;
};

const createGateway = (definition: ContestDefinition) => {
  const dataProvider = createInMemoryContestDataProvider([definition]);
  (dataProvider as { register?: (definition: ContestDefinition) => void }).register?.(
    definition,
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

describe('executeContestSettlement', () => {
  it('returns applied result when settlement ready', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executeContestSettlement({
      contest: definition.contest,
      caller: operator,
    });

    expect(result.status).toBe('applied');
    expect(result.settlementCall?.to).toBe(operator);
    expect(result.detail?.leaderboardVersion).toBe('v2');
  });

  it('returns noop result when already executed', async () => {
    const definition = buildDefinition({
      settlement: {
        ...buildDefinition().settlement!,
        executed: true,
      },
    });
    const gateway = createGateway(definition);

    const result = await gateway.executeContestSettlement({
      contest: definition.contest,
      caller: operator,
    });

    expect(result.status).toBe('noop');
    expect(result.rejectionReason?.code).toBe('STATE_CONFLICT');
  });

  it('returns blocked result when not ready', async () => {
    const definition = buildDefinition({
      settlement: {
        ...buildDefinition().settlement!,
        ready: false,
      },
    });
    const gateway = createGateway(definition);

    const result = await gateway.executeContestSettlement({
      contest: definition.contest,
      caller: operator,
    });

    expect(result.status).toBe('blocked');
    expect(result.rejectionReason?.code).toBe('RULE_VIOLATION');
  });

  it('builds settlement call when configuration omits call definition', async () => {
    const definition = buildDefinition({
      settlement: {
        ...buildDefinition().settlement!,
        settlementCall: undefined,
      },
    });
    const gateway = createGateway(definition);

    const result = await gateway.executeContestSettlement({
      contest: definition.contest,
      caller: winner,
    });

    expect(result.status).toBe('applied');
    expect(result.settlementCall?.to).toBe(
      definition.contest.addresses?.settlement ?? definition.contest.addresses?.registrar,
    );
    expect(result.settlementCall?.data).toMatch(/^0x[0-9a-f]+$/i);
  });
});

describe('executeRewardClaim', () => {
  it('returns applied result for eligible winner', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executeRewardClaim({
      contest: definition.contest,
      participant: winner,
    });

    expect(result.status).toBe('applied');
    expect(result.payout?.destination).toBe(winner);
  });

  it('returns noop when reward already claimed', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executeRewardClaim({
      contest: definition.contest,
      participant: winnerClaimed,
    });

    expect(result.status).toBe('noop');
    expect(result.reason?.code).toBe('STATE_CONFLICT');
  });

  it('returns blocked when reward unavailable', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executeRewardClaim({
      contest: definition.contest,
      participant: winnerBlocked,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason?.code).toBe('RULE_VIOLATION');
  });
});

describe('executePrincipalRedemption', () => {
  it('returns applied result when eligible', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executePrincipalRedemption({
      contest: definition.contest,
      participant: redeemer,
    });

    expect(result.status).toBe('applied');
    expect(result.payout?.destination).toBe(redeemer);
  });

  it('returns noop when already redeemed', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executePrincipalRedemption({
      contest: definition.contest,
      participant: redeemerCompleted,
    });

    expect(result.status).toBe('noop');
    expect(result.reason?.code).toBe('STATE_CONFLICT');
  });

  it('returns blocked when participant missing', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executePrincipalRedemption({
      contest: definition.contest,
      participant: '0x0000000000000000000000000000000000000999',
    });

    expect(result.status).toBe('blocked');
    expect(result.reason?.code).toBe('QUALIFICATION_FAILED');
  });

  it('returns blocked when redemption entry forbids payout', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.executePrincipalRedemption({
      contest: definition.contest,
      participant: redeemerBlocked,
    });

    expect(result.status).toBe('blocked');
    expect(result.reason?.code).toBe('RULE_VIOLATION');
  });
});
