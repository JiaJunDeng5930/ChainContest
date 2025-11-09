import { createPublicClient, defineChain, http } from 'viem';
import { contestArtifact } from '@chaincontest/chain';
import type { BlockAnchorShape } from '@chaincontest/chain';
import type { ContestSnapshot } from '@/lib/contests/repository';
import { getEnv } from '@/lib/config/env';
import { httpErrors } from '@/lib/http/errors';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

type MetadataRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is MetadataRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readMetadataPath = (metadata: MetadataRecord | null | undefined, path: readonly string[]): unknown => {
  if (!metadata) {
    return undefined;
  }
  let current: unknown = metadata;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

const normalizeAddress = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
};

export const extractOrganizerWallet = (metadata: MetadataRecord | null | undefined): string | null => {
  const candidates: readonly string[][] = [
    ['organizerWallet'],
    ['creatorWallet'],
    ['runtimeConfig', 'defaultAccount'],
    ['chainGatewayDefinition', 'organizer'],
    ['chainGatewayDefinition', 'owner']
  ];

  for (const path of candidates) {
    const value = readMetadataPath(metadata, path);
    const normalized = normalizeAddress(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const resolveContestAddress = (contest: ContestSnapshot): string | null => {
  const direct = normalizeAddress(contest.contractAddress);
  if (direct) {
    return direct;
  }

  const metadata = contest.metadata ?? undefined;
  const candidates: readonly string[][] = [
    ['chainGatewayDefinition', 'contest', 'addresses', 'registrar'],
    ['chainGatewayDefinition', 'contest', 'addresses', 'contest'],
    ['chainGatewayDefinition', 'contest', 'addresses', 'treasury']
  ];

  for (const path of candidates) {
    const value = readMetadataPath(metadata, path);
    const normalized = normalizeAddress(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const toBigInt = (value: number | string | bigint | undefined): bigint => {
  if (value === undefined) {
    return 0n;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
};

export const buildDerivedAnchor = (contest: ContestSnapshot): BlockAnchorShape => {
  return {
    blockNumber: toBigInt(contest.derivedAt.blockNumber),
    blockHash: (contest.derivedAt.blockHash ?? '0x0') as `0x${string}`,
    timestamp: contest.derivedAt.timestamp ?? new Date().toISOString()
  };
};

export const readTimelineTimestamp = (
  metadata: MetadataRecord | null | undefined,
  paths: readonly (readonly string[])[]
): number | null => {
  for (const path of paths) {
    const value = readMetadataPath(metadata, path);
    if (typeof value === 'string' && value.length > 0) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
};

const chainClientCache = new Map<number, ReturnType<typeof createPublicClient>>();

const createChainClient = (chainId: number) => {
  const cached = chainClientCache.get(chainId);
  if (cached) {
    return cached;
  }

  const env = getEnv();
  const rpcUrl =
    env.chain.publicRpc ?? env.chain.primaryRpc ?? env.chain.fallbackRpc ?? env.chain.hardhatRpc;

  if (!rpcUrl) {
    throw httpErrors.serviceUnavailable('RPC endpoint is not configured', {
      detail: { chainId }
    });
  }

  const chain = defineChain({
    id: chainId,
    name: `contest-chain-${chainId}`,
    network: `contest-chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] }
    }
  });

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  chainClientCache.set(chainId, client);
  return client;
};

export const waitForTransactionConfirmation = async (
  chainId: number,
  transactionHash: `0x${string}`
): Promise<void> => {
  const client = createChainClient(chainId);
  const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') {
    throw httpErrors.dependencyFailure('Transaction did not succeed on chain', {
      detail: { chainId, transactionHash, status: receipt.status }
    });
  }
};

export interface ContestChainState {
  state: number;
  frozenAt: number;
  sealedAt: number;
}

export const readContestChainState = async (
  chainId: number,
  contestAddress: `0x${string}`
): Promise<ContestChainState> => {
  const client = createChainClient(chainId);
  const [state, frozenAt, sealedAt] = await Promise.all([
    client.readContract({
      address: contestAddress,
      abi: contestArtifact.abi,
      functionName: 'state'
    }) as Promise<bigint>,
    client.readContract({
      address: contestAddress,
      abi: contestArtifact.abi,
      functionName: 'frozenAt'
    }) as Promise<bigint>,
    client.readContract({
      address: contestAddress,
      abi: contestArtifact.abi,
      functionName: 'sealedAt'
    }) as Promise<bigint>
  ]);

  return {
    state: Number(state),
    frozenAt: Number(frozenAt),
    sealedAt: Number(sealedAt)
  };
};
