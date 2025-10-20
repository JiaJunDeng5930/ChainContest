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

const participantA = '0x00000000000000000000000000000000000000a0';
const participantB = '0x00000000000000000000000000000000000000b0';
const participantRegistered = '0x00000000000000000000000000000000000000c0';
const entryToken = '0x0000000000000000000000000000000000000100';
const registrar = '0x00000000000000000000000000000000000000f1';
const spender = registrar;

const baseDefinition: ContestDefinition = {
  contest: createContestIdentifier({
    contestId: 'contest-009',
    chainId: 31337,
    gatewayVersion: 'test',
    addresses: { registrar },
  }),
  phase: 'registering',
  timeline: {
    registrationOpensAt: '2025-10-18T00:00:00Z',
    registrationClosesAt: '2025-10-20T00:00:00Z',
  },
  prizePool: {
    currentBalance: '100000000000000000000',
    accumulatedInflow: '200000000000000000000',
    valuationAnchor: {
      price: '1',
      currency: 'ETH',
      observedAt: '2025-10-18T00:00:00Z',
    },
  },
  registrationCapacity: {
    registered: 10,
    maximum: 100,
    isFull: false,
  },
  qualificationVerdict: {
    result: 'pass',
  },
  derivedAt: {
    blockNumber: 12n,
    blockHash: '0x1234',
    timestamp: '2025-10-19T00:00:00Z',
  },
  registration: {
    window: {
      opensAt: '2025-10-18T00:00:00Z',
      closesAt: '2025-10-20T00:00:00Z',
    },
    requirement: {
      tokenAddress: entryToken,
      amount: '1000000000000000000',
      spender,
      symbol: 'ETH',
      decimals: 18,
      reason: 'registration-entry',
    },
    template: {
      call: {
        to: registrar,
        data: '0xdeadbeef',
        value: 0n,
        gasLimit: 210000n,
      },
      estimatedFees: {
        currency: 'ETH',
        estimatedCost: '1000000000000000',
      },
    },
  },
  participants: {
    [participantA.toLowerCase()]: {
      address: participantA,
      balances: {
        [entryToken.toLowerCase()]: '5000000000000000000',
      },
      allowances: {
        [entryToken.toLowerCase()]: {
          [spender.toLowerCase()]: '1000000000000000000',
        },
      },
      registered: false,
    },
    [participantB.toLowerCase()]: {
      address: participantB,
      balances: {
        [entryToken.toLowerCase()]: '5000000000000000000',
      },
      allowances: {
        [entryToken.toLowerCase()]: {
          [spender.toLowerCase()]: '0',
        },
      },
      registered: false,
    },
    [participantRegistered.toLowerCase()]: {
      address: participantRegistered,
      balances: {
        [entryToken.toLowerCase()]: '5000000000000000000',
      },
      allowances: {
        [entryToken.toLowerCase()]: {
          [spender.toLowerCase()]: '1000000000000000000',
        },
      },
      registered: true,
    },
  },
};

const buildDefinition = (
  mutator?: (definition: ContestDefinition) => void,
): ContestDefinition => {
  const clone = structuredClone(baseDefinition);
  mutator?.(clone);
  return clone;
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

describe('planParticipantRegistration', () => {
  it('produces a ready plan when qualifications pass', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.planParticipantRegistration({
      contest: definition.contest,
      participant: participantA,
    });

    expect(result.status).toBe('ready');
    expect(result.requiredApprovals).toHaveLength(0);
    expect(result.registrationCall?.to).toBe(registrar);
    expect(result.qualifications.every((check) => check.passed)).toBe(true);
  });

  it('returns missing approvals when allowance insufficient', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.planParticipantRegistration({
      contest: definition.contest,
      participant: participantB,
    });

    expect(result.status).toBe('blocked');
    expect(result.requiredApprovals).toHaveLength(1);
    expect(result.rejectionReason?.code).toBe('INSUFFICIENT_ALLOWANCE');
    expect(result.requiredApprovals[0].spender).toBe(spender);
  });

  it('blocks participant already registered', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const result = await gateway.planParticipantRegistration({
      contest: definition.contest,
      participant: participantRegistered,
    });

    expect(result.status).toBe('blocked');
    expect(result.rejectionReason?.code).toBe('REGISTRATION_ALREADY_COMPLETED');
  });

  it('blocks when contest phase does not allow registration', async () => {
    const definition = buildDefinition((next) => {
      next.phase = 'frozen';
    });
    const gateway = createGateway(definition);

    const result = await gateway.planParticipantRegistration({
      contest: definition.contest,
      participant: participantA,
    });

    expect(result.status).toBe('blocked');
    expect(result.rejectionReason?.code).toBe('REGISTRATION_PHASE_INVALID');
  });

  it('blocks when capacity is full', async () => {
    const definition = buildDefinition((next) => {
      next.registrationCapacity = {
        registered: 100,
        maximum: 100,
        isFull: true,
      };
    });
    const gateway = createGateway(definition);

    const result = await gateway.planParticipantRegistration({
      contest: definition.contest,
      participant: participantA,
    });

    expect(result.status).toBe('blocked');
    expect(result.rejectionReason?.code).toBe('REGISTRATION_CAPACITY_FULL');
  });

  it('accepts unix second timestamps for registration window evaluation', async () => {
    const baseInstantSeconds = Math.floor(Date.UTC(2025, 9, 19, 12, 0, 0) / 1000);
    const definition = buildDefinition((next) => {
      next.derivedAt.timestamp = String(baseInstantSeconds);
      next.registration.window = {
        opensAt: String(baseInstantSeconds - 3600),
        closesAt: String(baseInstantSeconds + 3600),
      };
    });
    const gateway = createGateway(definition);

    const result = await gateway.planParticipantRegistration({
      contest: definition.contest,
      participant: participantA,
    });

    expect(result.status).toBe('ready');
    const windowCheck = result.qualifications.find(
      (check) => check.rule === 'registration.window',
    );
    expect(windowCheck?.passed).toBe(true);
  });
});

describe('describeContestLifecycle', () => {
  it('returns qualification verdict when requested', async () => {
    const definition = buildDefinition();
    const gateway = createGateway(definition);

    const snapshot = await gateway.describeContestLifecycle({
      contest: definition.contest,
      participant: participantB,
      includeQualification: true,
    });

    expect(snapshot.phase).toBe('registering');
    expect(snapshot.qualificationVerdict.result).toBe('blocked');
    expect(snapshot.qualificationVerdict.ruleIds).toContain(
      'registration.allowance',
    );
  });
});
