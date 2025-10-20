import {
  createContestChainGateway,
  createContestChainError,
  createInMemoryContestDataProvider,
  isContestChainError,
  type ContestChainGateway,
  type ContestDefinition,
  type ContestChainError
} from '@chaincontest/chain';
import type { GatewayValidationAdapter } from '@chaincontest/chain/policies/validationContext';
import type { RpcClientFactory, SignerLocator } from '@chaincontest/chain/adapters/rpcClientFactory';
import { httpErrors } from '@/lib/http/errors';
import { getLogger } from '@/lib/observability/logger';

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

const cacheKeyFor = (definition: ContestDefinition): string =>
  `${definition.contest.contestId}:${definition.contest.chainId}`;

const noopValidationAdapter: GatewayValidationAdapter = {
  context: {
    registry: [],
    activatedAt: undefined,
    plan: {
      orderedTypes: [],
      entryByType: {}
    }
  } as unknown,
  validateRequest: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined }),
  validateType: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined }),
  assertValid: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined }),
  assertTypeValid: () => Object.freeze({ status: 'success', validatedTypes: Object.freeze([]), firstError: null, metrics: undefined })
};

const stubRpcClientFactory: RpcClientFactory = Object.assign(
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

const stubSignerLocator: SignerLocator = async () => {
  throw createContestChainError({
    code: 'AUTHORIZATION_REQUIRED',
    message: 'Signer locator is not configured for contest gateway'
  });
};

const createGateway = (definition: ContestDefinition): GatewayCacheEntry => {
  const provider = createInMemoryContestDataProvider([definition]) as unknown as {
    register: (payload: ContestDefinition) => void;
  };

  const logger = getLogger();

  const gateway = createContestChainGateway({
    validators: noopValidationAdapter,
    rpcClientFactory: stubRpcClientFactory,
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

