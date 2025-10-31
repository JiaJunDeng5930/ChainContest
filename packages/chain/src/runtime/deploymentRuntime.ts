import { fallback, http, createWalletClient, type Chain, type Transport, type WalletClient } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

export interface DeploymentRuntimeOptions {
  readonly privateKey?: string;
  readonly rpcOverrides?: Readonly<Record<number, readonly string[]>>;
  readonly retryCount?: number;
  readonly timeoutMs?: number;
}

export interface DeploymentRuntime {
  readonly account: PrivateKeyAccount;
  readonly resolveRpcUrls: (chainId: number) => readonly string[];
  readonly createTransport: (chainId: number) => Transport;
  readonly createWalletClient: (chain: Chain) => WalletClient;
}

const HARDHAT_DEFAULT_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const normalizePrivateKey = (raw?: string): string => {
  const key = raw ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (key && key.trim().length > 0) {
    return key.startsWith('0x') ? key : `0x${key}`;
  }

  if (process.env.NODE_ENV !== 'production') {
    return HARDHAT_DEFAULT_PRIVATE_KEY;
  }

  throw new Error('Missing DEPLOYER_PRIVATE_KEY for deployment runtime.');
};

const defaultRpcMap = (): Record<number, readonly string[]> => {
  const map: Record<number, readonly string[]> = {};

  const local = process.env.HARDHAT_RPC_URL ?? process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';
  map[31337] = [local];

  const sepoliaUrls = [process.env.SEPOLIA_RPC_PRIMARY, process.env.SEPOLIA_RPC_FALLBACK].filter(
    (value): value is string => Boolean(value && value.trim())
  );
  if (sepoliaUrls.length > 0) {
    map[11155111] = sepoliaUrls;
  }

  if (process.env.FORK_RPC_URL) {
    map[1] = [process.env.FORK_RPC_URL];
  }

  return map;
};

const mergeRpcOverrides = (
  base: Readonly<Record<number, readonly string[]>>,
  overrides?: Readonly<Record<number, readonly string[]>>
): Record<number, readonly string[]> => {
  if (!overrides) {
    return { ...base };
  }

  const merged: Record<number, readonly string[]> = { ...base };
  for (const [key, urls] of Object.entries(overrides)) {
    const chainId = Number(key);
    if (!Number.isFinite(chainId)) {
      continue;
    }
    merged[chainId] = urls;
  }
  return merged;
};

const createTransport = (
  urls: readonly string[],
  retryCount: number,
  timeoutMs: number
): Transport => {
  const transports = urls.map((url) =>
    http(url, {
      retryCount,
      timeout: timeoutMs
    })
  );

  if (transports.length === 0) {
    throw new Error('No RPC endpoints configured for deployment runtime.');
  }

  return transports.length === 1 ? transports[0]! : fallback(transports);
};

export const createDeploymentRuntime = (
  options: DeploymentRuntimeOptions = {}
): DeploymentRuntime => {
  const privateKey = normalizePrivateKey(options.privateKey);
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const rpcMap = mergeRpcOverrides(defaultRpcMap(), options.rpcOverrides);
  const retryCount = options.retryCount ?? 2;
  const timeoutMs = options.timeoutMs ?? 20_000;

  const resolveRpcUrls = (chainId: number): readonly string[] => {
    const urls = rpcMap[chainId];
    if (!urls || urls.length === 0) {
      throw new Error(`No RPC endpoints configured for chain ${chainId}`);
    }
    return urls;
  };

  const createChainTransport = (chainId: number): Transport =>
    createTransport(resolveRpcUrls(chainId), retryCount, timeoutMs);

  const createChainWalletClient = (chain: Chain): WalletClient => {
    const transport = createChainTransport(chain.id);
    return createWalletClient({
      chain,
      account,
      transport
    });
  };

  return {
    account,
    resolveRpcUrls,
    createTransport: createChainTransport,
    createWalletClient: createChainWalletClient
  };
};

export const defaultDeploymentRuntime = createDeploymentRuntime();
