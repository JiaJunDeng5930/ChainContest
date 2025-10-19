import type { Hex } from 'viem';
import type {
  ExecutionCallShape,
  RouteDescriptorShape,
} from '@chain/gateway/domainModels';
import type {
  ContestDefinition,
  ContestRebalanceConfig,
} from '@chain/gateway/types';
import type { RebalanceIntent } from '@chain/gateway/contracts';

export interface TradeRoutePlan {
  readonly route: RouteDescriptorShape;
  readonly transaction: ExecutionCallShape & { readonly route: RouteDescriptorShape };
}

const toHex = (value: string): Hex =>
  (value.startsWith('0x') ? value : (`0x${value}` as Hex)) as Hex;

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
    defaultRoute?.minimumOutput ?? intent.minimumReceived ?? intent.amount;
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

export const planTradeRoute = (
  input: TradeRoutePlannerInput,
): TradeRoutePlan => {
  const route = buildRoute(input.config, input.intent, input.blockTimestamp);

  const transaction: ExecutionCallShape & { readonly route: RouteDescriptorShape } = {
    to: input.config.router,
    data: toHex(''),
    value: 0n,
    gasLimit: 320000n,
    deadline: route.expiresAt,
    route,
  };

  return Object.freeze({ route, transaction });
};
