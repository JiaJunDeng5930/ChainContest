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

const participantReady = '0x0000000000000000000000000000000000000101';
const participantCooldown = '0x0000000000000000000000000000000000000102';
const router = '0x0000000000000000000000000000000000000200';
const sellAsset = '0x0000000000000000000000000000000000000300';
const buyAsset = '0x0000000000000000000000000000000000000400';

const baseDefinition: ContestDefinition = {
  contest: createContestIdentifier({
    contestId: 'contest-rebalance',
    chainId: 31337,
    addresses: { registrar: router },
  }),
  phase: 'live',
  timeline: {
    tradingOpensAt: '2025-10-18T00:00:00Z',
    tradingClosesAt: '2025-10-21T00:00:00Z',
  },
  prizePool: {
    currentBalance: '100000000000000000000',
    accumulatedInflow: '150000000000000000000',
  },
  registrationCapacity: {
    registered: 80,
    maximum: 100,
    isFull: false,
  },
  qualificationVerdict: {
    result: 'pass',
  },
  derivedAt: {
    blockNumber: 1234n,
    blockHash: '0xfeed',
    timestamp: '2025-10-19T12:00:00Z',
  },
  registration: {
    window: {
      opensAt: '2025-10-18T00:00:00Z',
      closesAt: '2025-10-20T00:00:00Z',
    },
    requirement: {
      tokenAddress: sellAsset,
      amount: '0',
      spender: router,
    },
    template: {
      call: {
        to: router,
        data: '0x',
      },
    },
  },
  rebalance: {
    whitelist: [sellAsset, buyAsset],
    maxTradeAmount: '1000000000000000000',
    cooldownSeconds: 3600,
    priceFreshnessSeconds: 600,
    lastPriceUpdatedAt: '2025-10-19T11:55:00Z',
    spender: router,
    router,
    slippageBps: 50,
    deadlineSeconds: 300,
    rollbackAdvice: 'Retry after refreshing price data',
  },
  participants: {
    [participantReady.toLowerCase()]: {
      address: participantReady,
      balances: {
        [sellAsset.toLowerCase()]: '2000000000000000000',
      },
      allowances: {
        [sellAsset.toLowerCase()]: {
          [router.toLowerCase()]: '2000000000000000000',
        },
      },
      registered: true,
      lastRebalanceAt: '2025-10-19T10:00:00Z',
    },
    [participantCooldown.toLowerCase()]: {
      address: participantCooldown,
      balances: {
        [sellAsset.toLowerCase()]: '2000000000000000000',
      },
      allowances: {
        [sellAsset.toLowerCase()]: {
          [router.toLowerCase()]: '2000000000000000000',
        },
      },
      registered: true,
      lastRebalanceAt: '2025-10-19T11:40:00Z',
    },
  },
};

const createGatewayForDefinition = (definition: ContestDefinition) => {
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

describe('planPortfolioRebalance', () => {
  it('returns ready plan when rules pass', async () => {
    const gateway = createGatewayForDefinition(baseDefinition);

    const plan = await gateway.planPortfolioRebalance({
      contest: baseDefinition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '500000000000000000',
        minimumReceived: '400000000000000000',
        quoteId: 'quote-123',
      },
    });

    expect(plan.status).toBe('ready');
    expect(plan.transaction?.route?.steps[0]).toContain(
      sellAsset.toLowerCase(),
    );
    expect(plan.policyChecks.every((check) => check.status === 'pass')).toBe(
      true,
    );
  });

  it('blocks when trade amount exceeds limit', async () => {
    const gateway = createGatewayForDefinition(baseDefinition);

    const plan = await gateway.planPortfolioRebalance({
      contest: baseDefinition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '10000000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    expect(plan.rejectionReason?.code).toBe('RULE_VIOLATION');
    const amountCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.amount-limit',
    );
    expect(amountCheck?.status).toBe('fail');
  });

  it('blocks when cooldown not satisfied', async () => {
    const gateway = createGatewayForDefinition(baseDefinition);

    const plan = await gateway.planPortfolioRebalance({
      contest: baseDefinition.contest,
      participant: participantCooldown,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    const cooldownCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.cooldown',
    );
    expect(cooldownCheck?.status).toBe('fail');
  });

  it('blocks when price data is stale', async () => {
    const staleDefinition: ContestDefinition = {
      ...baseDefinition,
      rebalance: {
        ...baseDefinition.rebalance!,
        lastPriceUpdatedAt: '2025-10-19T10:00:00Z',
        priceFreshnessSeconds: 100,
      },
    };

    const gateway = createGatewayForDefinition(staleDefinition);

    const plan = await gateway.planPortfolioRebalance({
      contest: staleDefinition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '500000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    expect(plan.rejectionReason?.code).toBe('PRICING_STALE');
  });
 
  it('blocks when assets are not whitelisted', async () => {
    const definition: ContestDefinition = {
      ...baseDefinition,
      rebalance: {
        ...baseDefinition.rebalance!,
        whitelist: [sellAsset],
      },
    };

    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    const whitelistCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.asset-whitelist',
    );
    expect(whitelistCheck?.status).toBe('fail');
  });

  it('blocks when allowance missing for router', async () => {
    const definition: ContestDefinition = {
      ...baseDefinition,
      participants: {
        ...baseDefinition.participants,
        [participantReady.toLowerCase()]: {
          ...baseDefinition.participants[participantReady.toLowerCase()],
          allowances: {
            [sellAsset.toLowerCase()]: {
              [router.toLowerCase()]: '0',
            },
          },
        },
      },
    };

    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    const allowanceCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.allowance',
    );
    expect(allowanceCheck?.status).toBe('fail');
  });

  it('blocks when phase is not live', async () => {
    const definition: ContestDefinition = {
      ...baseDefinition,
      phase: 'frozen',
    };

    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    const phaseCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.phase',
    );
    expect(phaseCheck?.status).toBe('fail');
  });

  it('uses provided default route metadata', async () => {
    const definition: ContestDefinition = {
      ...baseDefinition,
      rebalance: {
        ...baseDefinition.rebalance!,
        defaultRoute: {
          steps: ['custom-route'],
          minimumOutput: '0',
          maximumSlippageBps: 10,
          expiresAt: '2025-10-19T12:05:00Z',
          metadata: { source: 'precomputed' },
        },
      },
    };

    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(plan.status).toBe('ready');
    expect(plan.transaction?.route?.metadata?.source).toBe('precomputed');
  });
});
