import { encodeFunctionData } from 'viem';
import type { Address, Hex } from 'viem';
import type {
  ExecutionCallShape,
  RouteDescriptorShape,
} from '../gateway/domainModels.js';
import type {
  ContestDefinition,
  ContestRebalanceConfig,
  ContestParticipantProfile,
} from '../gateway/types.js';
import type { RebalanceIntent } from '../gateway/contracts.js';
import { vaultArtifact } from '../gateway/artifacts.js';

export interface TradeRoutePlan {
  readonly route: RouteDescriptorShape;
  readonly transaction: ExecutionCallShape & { readonly route: RouteDescriptorShape };
}

const computeExpiry = (timestampIso: string, seconds: number): string => {
  const base = new Date(timestampIso);
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + seconds * 1000).toISOString();
  }
  return new Date(base.getTime() + seconds * 1000).toISOString();
};

export interface TradeRoutePlannerInput {
  readonly contest: ContestDefinition;
  readonly config: ContestRebalanceConfig;
  readonly intent: RebalanceIntent;
  readonly blockTimestamp: string;
  readonly participant: ContestParticipantProfile;
}

const buildRoute = (
  config: ContestRebalanceConfig,
  intent: RebalanceIntent,
  blockTimestamp: string,
): RouteDescriptorShape => {
  const defaultRoute = config.defaultRoute;
  const steps =
    defaultRoute?.steps ?? [
      `${intent.sellAsset.toLowerCase()}->${intent.buyAsset.toLowerCase()}`,
    ];
  const minimumOutput =
    intent.minimumReceived ?? defaultRoute?.minimumOutput ?? '0';
  const maximumSlippageBps = defaultRoute?.maximumSlippageBps ?? config.slippageBps;
  const expiresAt =
    defaultRoute?.expiresAt ??
    computeExpiry(blockTimestamp, config.deadlineSeconds);

  const metadata = {
    ...(defaultRoute?.metadata ?? {}),
    ...(intent.quoteId ? { quoteId: intent.quoteId } : {}),
  } as Record<string, unknown>;

  return {
    steps,
    minimumOutput,
    maximumSlippageBps,
    expiresAt,
    metadata,
  };
};

const normaliseAddress = (value: string): string => value.toLowerCase();

const resolveVaultAddress = (participant: ContestParticipantProfile): Address => {
  if (participant.vaultReference) {
    return participant.vaultReference;
  }
  throw new Error('Participant vault reference unavailable for rebalance planning');
};

const resolveSwapDirection = (
  baseAsset: string,
  quoteAsset: string,
  sellAsset: string,
): boolean => {
  const normalisedBase = normaliseAddress(baseAsset);
  const normalisedQuote = normaliseAddress(quoteAsset);
  const normalisedSell = normaliseAddress(sellAsset);

  if (normalisedSell === normalisedBase) {
    return true;
  }
  if (normalisedSell === normalisedQuote) {
    return false;
  }

  throw new Error(`Requested sell asset ${sellAsset} not allowed by rebalance policy`);
};

export const planTradeRoute = (
  input: TradeRoutePlannerInput,
): TradeRoutePlan => {
  const route = buildRoute(input.config, input.intent, input.blockTimestamp);

  const vaultAddress = resolveVaultAddress(input.participant);
  const swapBaseForQuote = resolveSwapDirection(
    input.config.baseAsset,
    input.config.quoteAsset,
    input.intent.sellAsset,
  );

  const amountIn = BigInt(input.intent.amount);
  const minimumOut = input.intent.minimumReceived ? BigInt(input.intent.minimumReceived) : 0n;

  const deadlineIso =
    route.expiresAt ?? computeExpiry(input.blockTimestamp, input.config.deadlineSeconds);
  const deadlineSeconds = Math.floor(new Date(deadlineIso).getTime() / 1000);

  const encodedCall = encodeFunctionData({
    abi: vaultArtifact.abi,
    functionName: 'swapExact',
    args: [amountIn, minimumOut, swapBaseForQuote, BigInt(deadlineSeconds)],
  });

  const transaction: ExecutionCallShape & { readonly route: RouteDescriptorShape } = {
    to: vaultAddress,
    data: encodedCall,
    value: 0n,
    gasLimit: 320000n,
    deadline: deadlineIso,
    route,
  };

  return Object.freeze({ route, transaction });
};
