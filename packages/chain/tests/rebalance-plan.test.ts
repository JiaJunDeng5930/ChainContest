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
const readyVault = '0x0000000000000000000000000000000000000500';
const cooldownVault = '0x0000000000000000000000000000000000000501';
const poolAddress = '0x0000000000000000000000000000000000000600';
const priceSourceAddress = '0x0000000000000000000000000000000000000700';
const priceSourceErrorAddress = '0x0000000000000000000000000000000000000701';

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
    baseAsset: sellAsset,
    quoteAsset: buyAsset,
    poolAddress,
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
      vaultReference: readyVault,
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
      vaultReference: cooldownVault,
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

interface GatewayOptions {
  priceSourceReadError?: boolean;
  contestPriceSource?: string;
  snapshotAsObject?: boolean;
}

const createGatewayForDefinition = (
  definition: ContestDefinition,
  gatewayOptions: GatewayOptions = {},
) => {
  const dataProvider = createInMemoryContestDataProvider([definition]);
  (dataProvider as { register?: (definition: ContestDefinition) => void }).register?.(
    definition,
  );
  const deriveBlockSeconds = (): bigint => {
    const iso = definition.derivedAt.timestamp;
    if (iso) {
      const trimmed = iso.trim();
      if (/^\d+$/.test(trimmed)) {
        return BigInt(trimmed);
      }
      const millis = Date.parse(trimmed);
      if (Number.isFinite(millis)) {
        return BigInt(Math.floor(millis / 1000));
      }
    }
    return BigInt(Math.floor(Date.now() / 1000));
  };
  const rpcClientFactory = Object.assign(
    () =>
      ({
        getBlock: async () => ({ timestamp: deriveBlockSeconds() }),
        readContract: async (parameters?: { functionName?: string }) => {
          if (parameters?.functionName === 'getConfig') {
            if (!gatewayOptions.contestPriceSource) {
              return {};
            }
            return { priceSource: gatewayOptions.contestPriceSource };
          }
          if (gatewayOptions.priceSourceReadError) {
            throw new Error('price source unreachable');
          }
          if (gatewayOptions.snapshotAsObject) {
            return {
              meanTick: 0n,
              sqrtPriceX96: 0n,
              priceE18: 0n,
              updatedAt: deriveBlockSeconds(),
            };
          }
          return [0n, 0n, 0n, deriveBlockSeconds()];
        },
      }) as ReturnType<RpcClientFactory>,
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
    expect(plan.transaction?.to).toBe(readyVault.toLowerCase());
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

  it('refreshes price timestamp from on-chain snapshot when available', async () => {
    const definition = buildDefinition((next) => {
      next.rebalance!.priceSource = priceSourceAddress;
      next.rebalance!.lastPriceUpdatedAt = '2025-10-01T00:00:00Z';
      next.rebalance!.priceFreshnessSeconds = 900;
    });

    const gateway = createGatewayForDefinition(definition, {
      snapshotAsObject: true,
    });

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '500000000000000000',
      },
    });

    expect(plan.status).toBe('ready');
    const priceCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.price-freshness',
    );
    expect(priceCheck?.status).toBe('pass');
  });

  it('derives price source from contest config when metadata omits it', async () => {
    const definition = buildDefinition((next) => {
      delete (next.rebalance as Record<string, unknown>).priceSource;
      next.rebalance!.lastPriceUpdatedAt = '2025-10-01T00:00:00Z';
      next.rebalance!.priceFreshnessSeconds = 900;
    });

    const gateway = createGatewayForDefinition(definition, {
      contestPriceSource: priceSourceAddress,
    });

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '500000000000000000',
      },
    });

    expect(plan.status).toBe('ready');
    const priceCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.price-freshness',
    );
    expect(priceCheck?.status).toBe('pass');
  });

  it('falls back to cached price timestamp when snapshot retrieval fails', async () => {
    const definition = buildDefinition((next) => {
      next.rebalance!.priceSource = priceSourceErrorAddress;
      next.rebalance!.lastPriceUpdatedAt = '2025-10-01T00:00:00Z';
      next.rebalance!.priceFreshnessSeconds = 900;
    });

    const gateway = createGatewayForDefinition(definition, {
      priceSourceReadError: true,
    });

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '500000000000000000',
      },
    });

    expect(plan.status).toBe('blocked');
    const priceCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.price-freshness',
    );
    expect(priceCheck?.status).toBe('fail');
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

  it('executes rebalance when plan is ready', async () => {
    const gateway = createGatewayForDefinition(baseDefinition);

    const result = await gateway.executePortfolioRebalance({
      contest: baseDefinition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(result.status).toBe('executed');
    expect(result.transaction?.to).toBe(readyVault.toLowerCase());
  });

  it('returns noop execution when plan is blocked', async () => {
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

    const result = await gateway.executePortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '100000000000000000',
      },
    });

    expect(result.status).toBe('noop');
    expect(result.reason?.code).toBe('AUTHORIZATION_REQUIRED');
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

  it('defaults minimum output to zero when unset', async () => {
    const definition = buildDefinition((next) => {
      delete next.rebalance!.defaultRoute;
    });
    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '1000000000000000000',
        quoteId: 'no-minimum-provided',
      },
    });

    expect(plan.transaction?.route?.minimumOutput).toBe('0');
    expect(plan.status).toBe('ready');
  });

  it('prefers intent minimum received when default route present', async () => {
    const definition = buildDefinition();
    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '900000000000000000',
        minimumReceived: '850000000',
        quoteId: 'intent-minimum-overrides-default',
      },
    });

    expect(plan.transaction?.route?.minimumOutput).toBe('850000000');
  });

  it('interprets unix second timestamps during rule evaluation', async () => {
    const baseInstantSeconds = Math.floor(Date.UTC(2025, 9, 19, 12, 0, 0) / 1000);
    const definition = buildDefinition((next) => {
      next.derivedAt.timestamp = String(baseInstantSeconds);
      next.rebalance!.lastPriceUpdatedAt = String((baseInstantSeconds - 120) * 1000);
      const readyParticipantProfile =
        next.participants[participantReady.toLowerCase()];
      readyParticipantProfile.cooldownEndsAt = String(baseInstantSeconds - 60);
    });

    const gateway = createGatewayForDefinition(definition);

    const plan = await gateway.planPortfolioRebalance({
      contest: definition.contest,
      participant: participantReady,
      intent: {
        sellAsset,
        buyAsset,
        amount: '500000000000000000',
        minimumReceived: '400000000000000000',
        quoteId: 'quote-using-seconds',
      },
    });

    expect(plan.status).toBe('ready');
    const cooldownCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.cooldown',
    );
    expect(cooldownCheck?.status).toBe('pass');
    const priceCheck = plan.policyChecks.find(
      (check) => check.rule === 'rebalance.price-freshness',
    );
    expect(priceCheck?.status).toBe('pass');
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
