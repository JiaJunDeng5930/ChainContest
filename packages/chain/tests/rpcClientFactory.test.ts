import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chain, WalletClient } from 'viem';

const createPublicClientMock = vi.fn();
const httpMock = vi.fn();
const fallbackMock = vi.fn();

declare module 'viem' {
  interface PublicClient {
    readonly cacheKey?: string;
  }
}

vi.mock('viem', () => ({
  createPublicClient: (...args: unknown[]) => createPublicClientMock(...args),
  http: (...args: unknown[]) => httpMock(...args),
  fallback: (...args: unknown[]) => fallbackMock(...args),
}));

import {
  createCachingSignerLocator,
  createRpcClientFactory,
  createStaticSignerLocator,
} from '../src/adapters/rpcClientFactory';

type PublicClient = ReturnType<typeof createPublicClientMock>;

const chain: Chain = {
  id: 1,
  name: 'Local',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://localhost:8545'] },
  },
};

beforeEach(() => {
  createPublicClientMock.mockReset();
  httpMock.mockReset();
  fallbackMock.mockReset();
  createPublicClientMock.mockImplementation((config: unknown) => ({ config }));
  httpMock.mockImplementation((url: string) => ({ url }));
  fallbackMock.mockImplementation((transports: unknown[]) => ({ transports }));
});

describe('createRpcClientFactory', () => {
  it('caches clients per chain and reuses transports', () => {
    const factory = createRpcClientFactory({ chains: { 1: chain } });

    const first = factory({ chainId: 1 });
    const second = factory({ chainId: 1 });

    expect(first).toBe(second);
    expect(createPublicClientMock).toHaveBeenCalledTimes(1);
  });

  it('clears cache entries', () => {
    const factory = createRpcClientFactory({ chains: { 1: chain } });
    factory({ chainId: 1 });
    factory.clear();
    factory({ chainId: 1 });
    expect(createPublicClientMock).toHaveBeenCalledTimes(2);
  });

  it('throws when chain is unsupported', () => {
    const factory = createRpcClientFactory({ chains: { 1: chain } });
    expect(() => factory({ chainId: 999 })).toThrow();
  });

  it('falls back across multiple rpc urls', () => {
    const factory = createRpcClientFactory({ chains: { 1: chain } });

    factory({ chainId: 1, rpcUrls: ['http://a', 'http://b'] });

    expect(fallbackMock).toHaveBeenCalled();
  });
});

describe('signer locators', () => {
  it('returns memoized wallet client', async () => {
    const wallet = { name: 'wallet' } as WalletClient;
    const locator = createCachingSignerLocator(async () => wallet);

    const first = await locator({
      chainId: 1,
      participant: '0x0000000000000000000000000000000000000001',
      contestId: 'contest-1',
    });
    const second = await locator({
      chainId: 1,
      participant: '0x0000000000000000000000000000000000000001',
      contestId: 'contest-1',
    });

    expect(first).toBe(second);
  });

  it('throws when resolver returns no wallet', async () => {
    const locator = createCachingSignerLocator(async () => undefined as unknown as WalletClient);
    await expect(
      locator({
        chainId: 1,
        participant: '0x0000000000000000000000000000000000000001',
        contestId: 'contest-1',
      }),
    ).rejects.toThrow();
  });
  it('returns static wallet client', async () => {
    const wallet = { id: 'wallet' } as WalletClient;
    const locator = createStaticSignerLocator(wallet);
    const result = await locator({
      chainId: 1,
      participant: '0x0000000000000000000000000000000000000001',
      contestId: 'contest-1',
    });

    expect(result).toBe(wallet);
  });
});
