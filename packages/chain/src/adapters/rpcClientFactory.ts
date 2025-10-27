import { createPublicClient, fallback, http } from 'viem';
import type { Chain, PublicClient, Transport, WalletClient } from 'viem';
import type { Address } from 'viem';
import { createContestChainError } from '../errors/contestChainError.js';

export interface RpcClientFactoryRequest {
  readonly chainId: number;
  readonly contestId?: string;
  readonly chain?: Chain;
  readonly transport?: Transport;
  readonly rpcUrls?: readonly string[];
  readonly cacheKey?: string;
  readonly pollingIntervalMs?: number;
  readonly batchMulticall?: boolean;
  readonly retryCount?: number;
  readonly timeoutMs?: number;
}

export interface RpcClientFactoryOptions {
  readonly chains: Readonly<Record<number, Chain>>;
  readonly cache?: Map<string, PublicClient>;
  readonly defaultRpcUrls?: Readonly<Record<number, readonly string[]>>;
  readonly batchMulticall?: boolean;
  readonly retryCount?: number;
  readonly timeoutMs?: number;
  readonly onCreate?: (
    client: PublicClient,
    context: RpcClientFactoryRequest & { readonly chain: Chain },
  ) => void;
}

export type RpcClientFactory = ((
  request: RpcClientFactoryRequest,
) => PublicClient) & { clear(cacheKey?: string): void };

const resolveChain = (
  options: RpcClientFactoryOptions,
  request: RpcClientFactoryRequest,
): Chain => {
  if (request.chain) {
    return request.chain;
  }

  const chain = options.chains[request.chainId];
  if (!chain) {
    throw createContestChainError({
      code: 'CHAIN_UNAVAILABLE',
      message: `Unsupported chain id "${request.chainId}"`,
      details: { request },
      retryable: false,
    });
  }

  return chain;
};

const resolveRpcUrls = (
  chain: Chain,
  request: RpcClientFactoryRequest,
  options: RpcClientFactoryOptions,
): readonly string[] => {
  if (request.rpcUrls && request.rpcUrls.length > 0) {
    return request.rpcUrls;
  }

  const override = options.defaultRpcUrls?.[chain.id];
  if (override && override.length > 0) {
    return override;
  }

  const defaults = chain.rpcUrls?.default?.http;
  if (defaults && defaults.length > 0) {
    return defaults;
  }

  throw createContestChainError({
    code: 'CHAIN_UNAVAILABLE',
    message: `No RPC endpoint configured for chain "${chain.id}"`,
    details: { chain },
    retryable: true,
  });
};

const createTransport = (
  chain: Chain,
  request: RpcClientFactoryRequest,
  options: RpcClientFactoryOptions,
): Transport => {
  if (request.transport) {
    return request.transport;
  }

  const retryCount = request.retryCount ?? options.retryCount ?? 2;
  const timeout = request.timeoutMs ?? options.timeoutMs ?? 20_000;
  const batchMulticall = request.batchMulticall ?? options.batchMulticall ?? true;
  const urls = resolveRpcUrls(chain, request, options);
  const transports = urls.map((url) =>
    http(url, {
      retryCount,
      timeout,
      batch: batchMulticall,
    }),
  );

  if (transports.length === 1) {
    return transports[0]!;
  }

  if (transports.length === 0) {
    throw createContestChainError({
      code: 'CHAIN_UNAVAILABLE',
      message: `No transports could be created for chain "${chain.id}"`,
      details: { chain, urls },
      retryable: true,
    });
  }

  return fallback(transports);
};

const computeCacheKey = (
  chain: Chain,
  request: RpcClientFactoryRequest,
): string | null => {
  if (request.cacheKey) {
    return request.cacheKey;
  }

  if (request.transport) {
    return null;
  }

  const urlKey = request.rpcUrls?.join(',') ?? 'default';
  return `${chain.id}:${urlKey}`;
};

export const createRpcClientFactory = (
  options: RpcClientFactoryOptions,
): RpcClientFactory => {
  const cache = options.cache ?? new Map<string, PublicClient>();

  const factory = ((request: RpcClientFactoryRequest): PublicClient => {
    const chain = resolveChain(options, request);
    const cacheKey = computeCacheKey(chain, request);
    if (cacheKey && cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    const transport = createTransport(chain, request, options);
    const client = createPublicClient({
      chain,
      transport,
      batch: {
        multicall: request.batchMulticall ?? options.batchMulticall ?? true,
      },
      pollingInterval: request.pollingIntervalMs,
    });

    if (cacheKey) {
      cache.set(cacheKey, client);
    }

    options.onCreate?.(client, { ...request, chain });

    return client;
  }) as RpcClientFactory;

  factory.clear = (cacheKey?: string) => {
    if (cacheKey) {
      cache.delete(cacheKey);
      return;
    }

    cache.clear();
  };

  return factory;
};

export interface SignerLocatorRequest {
  readonly chainId: number;
  readonly participant: Address;
  readonly contestId: string;
  readonly cacheKey?: string;
}

export type SignerLocator = (
  request: SignerLocatorRequest,
) => Promise<WalletClient>;

export interface SignerLocatorOptions {
  readonly cache?: Map<string, WalletClient>;
}

const computeSignerCacheKey = (
  request: SignerLocatorRequest,
): string =>
  request.cacheKey ?? `${request.chainId}:${request.participant.toLowerCase()}`;

export const createCachingSignerLocator = (
  resolver: SignerLocator,
  options: SignerLocatorOptions = {},
): SignerLocator => {
  const cache = options.cache ?? new Map<string, WalletClient>();

  return async (request) => {
    const key = computeSignerCacheKey(request);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const client = await resolver(request);
    if (!client) {
      throw createContestChainError({
        code: 'CHAIN_UNAVAILABLE',
        message: `Signer unavailable for participant ${request.participant}`,
        details: { request },
        retryable: false,
      });
    }

    cache.set(key, client);
    return client;
  };
};

export const createStaticSignerLocator = (
  walletClient: WalletClient,
): SignerLocator => () => Promise.resolve(walletClient);
