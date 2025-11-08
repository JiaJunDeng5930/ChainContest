import {
  createContestChainGateway,
  createContestChainError,
  createInMemoryContestDataProvider,
  createRpcClientFactory,
  isContestChainError,
  type ContestChainGateway,
  type ContestDefinition,
  type ContestChainError,
  type ContestChainDataProvider,
  type GatewayValidationAdapter,
  type RpcClientFactory,
  type SignerLocator
} from '@chaincontest/chain';
import { defineChain } from 'viem';
import type { ValidationContext } from '@chaincontest/shared-schemas';
import { httpErrors } from '@/lib/http/errors';
import { getLogger } from '@/lib/observability/logger';
import { getEnv } from '@/lib/config/env';

interface GatewayCacheEntry {
  gateway: ContestChainGateway;
  register: (definition: ContestDefinition) => void;
}

interface WithContestGatewayOptions {
  definition: ContestDefinition;
  contestId: string;
  blockTag?: bigint | number | 'latest';
  resource?: string;
}

const gatewayCache = new Map<string, GatewayCacheEntry>();

const parseChainId = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
};

const normalizeRuntimeRpcUrls = (): string[] => {
  const env = getEnv();
  const candidates = [
    env.chain.primaryRpc,
    env.chain.publicRpc,
    env.chain.fallbackRpc,
    env.chain.hardhatRpc,
    process.env.CHAIN_RPC_PRIMARY,
    process.env.CHAIN_RPC_PUBLIC_URL,
    process.env.CHAIN_RPC_FALLBACK,
    process.env.HARDHAT_RPC_URL
  ];

  return candidates.filter((value, index, array) => {
    if (!value) {
      return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return array.findIndex((candidate) => candidate === value) === index;
  });
};

const cacheKeyFor = (definition: ContestDefinition): string =>
  `${definition.contest.contestId}:${definition.contest.chainId}`;

const noopValidationAdapter: GatewayValidationAdapter = {
  context: Object.freeze({}) as ValidationContext,
  validateRequest: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined }),
  validateType: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined }),
  assertValid: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined }),
  assertTypeValid: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined })
};

const runtimeRpcUrls = normalizeRuntimeRpcUrls();

if (!runtimeRpcUrls.length) {
  getLogger().warn(
    { event: 'contestGateway.rpcConfig', runtimeRpcUrls },
    'Contest gateway RPC URLs missing',
  );
} else {
  getLogger().info(
    { event: 'contestGateway.rpcConfig', runtimeRpcUrls },
    'Contest gateway RPC URLs resolved',
  );
}

const stubbedRpcClientFactory: RpcClientFactory = Object.assign(
  () => {
    throw createContestChainError({
      code: 'CHAIN_UNAVAILABLE',
      message: 'RPC client factory is not configured for contest gateway'
    });
  },
  {
    clear: () => undefined
  }
);

const chainRegistry: Record<number, ReturnType<typeof defineChain>> = {};
const rpcRegistry: Record<number, readonly string[]> = {};

const registerRuntimeChain = (chainId: number): void => {
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return;
  }
  if (chainRegistry[chainId]) {
    return;
  }
  if (!runtimeRpcUrls.length) {
    return;
  }

  chainRegistry[chainId] = defineChain({
    id: chainId,
    name: `runtime-chain-${chainId}`,
    network: `runtime-chain-${chainId}`,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: { http: runtimeRpcUrls },
      public: { http: runtimeRpcUrls }
    }
  });

  rpcRegistry[chainId] = runtimeRpcUrls;
};

const runtimeRpcClientFactory: RpcClientFactory =
  runtimeRpcUrls.length === 0
    ? stubbedRpcClientFactory
    : createRpcClientFactory({
        chains: chainRegistry,
        defaultRpcUrls: rpcRegistry
      });

const stubSignerLocator: SignerLocator = async () => {
  throw createContestChainError({
    code: 'AUTHORIZATION_REQUIRED',
    message: 'Signer locator is not configured for contest gateway'
  });
};

const createGateway = (definition: ContestDefinition): GatewayCacheEntry => {
  registerRuntimeChain(definition.contest.chainId);

  const provider = createInMemoryContestDataProvider([definition]) as ContestChainDataProvider & {
    register: (payload: ContestDefinition) => void;
  };

  const logger = getLogger();

  const gateway = createContestChainGateway({
    validators: noopValidationAdapter,
    rpcClientFactory: runtimeRpcClientFactory,
    signerLocator: stubSignerLocator,
    errorLogger: (error: ContestChainError) => {
      logger.warn({
        code: error.code,
        retryable: error.retryable,
        detail: error.details,
        source: error.source
      }, error.message);
    },
    dataProvider: provider
  });

  return {
    gateway,
    register: (payload: ContestDefinition) => provider.register(payload)
  };
};

const normalizeBlockTag = (value: WithContestGatewayOptions['blockTag']): bigint | 'latest' | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'latest') {
    return 'latest';
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  throw httpErrors.badRequest('blockTag must be a positive integer or "latest"', {
    detail: { blockTag: value }
  });
};

const mapContestChainError = (error: ContestChainError, resource?: string): never => {
  const detail = {
    source: error.source ?? resource,
    retryable: error.retryable,
    detail: error.details
  };

  switch (error.code) {
    case 'VALIDATION_FAILED':
      throw httpErrors.badRequest(error.message, { detail });
    case 'QUALIFICATION_FAILED':
    case 'RULE_VIOLATION':
    case 'STATE_CONFLICT':
      throw httpErrors.conflict(error.message, { detail });
    case 'AUTHORIZATION_REQUIRED':
      throw httpErrors.forbidden(error.message, { detail });
    case 'CHAIN_UNAVAILABLE':
    case 'PRICING_STALE':
      throw httpErrors.serviceUnavailable(error.message, { detail, expose: false });
    case 'NOT_IMPLEMENTED':
      throw httpErrors.serviceUnavailable(error.message, { detail, expose: true });
    default:
      throw httpErrors.internal('Contest gateway execution failed', {
        detail: { ...detail, code: error.code },
        cause: error
      });
  }
};

export const withContestGateway = async <T>(
  options: WithContestGatewayOptions,
  handler: (gateway: ContestChainGateway, blockTag?: bigint | 'latest') => Promise<T>
): Promise<T> => {
  const { definition, resource } = options;
  registerRuntimeChain(definition.contest.chainId);
  const key = cacheKeyFor(definition);

  let entry = gatewayCache.get(key);
  if (!entry) {
    entry = createGateway(definition);
    gatewayCache.set(key, entry);
  } else {
    entry.register(definition);
  }

  try {
    const blockTag = normalizeBlockTag(options.blockTag);
    return await handler(entry.gateway, blockTag);
  } catch (error) {
    if (isContestChainError(error)) {
      mapContestChainError(error, resource);
    }
    throw error;
  }
};
