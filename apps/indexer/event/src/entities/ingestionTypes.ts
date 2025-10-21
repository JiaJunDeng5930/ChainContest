export type IngestionState = 'live' | 'replay' | 'paused';

export interface IngestionStream {
  contestId: string;
  chainId: number;
  contractAddress: string;
  currentCursorHeight: bigint;
  currentCursorHash: string | null;
  nextPollAt: Date;
  activeRpc: string;
  errorStreak: number;
  lagBlocks: number;
  state: IngestionState;
  metadata: Record<string, unknown>;
}

export interface IngestionStreamInput {
  contestId: string;
  chainId: number;
  contractAddress: string;
  currentCursorHeight?: bigint | number | string;
  currentCursorHash?: string | null;
  nextPollAt?: Date;
  activeRpc: string;
  errorStreak?: number;
  lagBlocks?: number;
  state?: IngestionState;
  metadata?: Record<string, unknown>;
}

export interface SerializableIngestionStream {
  contestId: string;
  chainId: number;
  contractAddress: string;
  currentCursorHeight: string;
  currentCursorHash: string | null;
  nextPollAt: string;
  activeRpc: string;
  errorStreak: number;
  lagBlocks: number;
  state: IngestionState;
  metadata: Record<string, unknown>;
}

export interface RpcEndpointState {
  id: string;
  url: string;
  priority: number;
  enabled: boolean;
  lastSuccessAt?: Date | null;
  failCount: number;
  cooldownUntil?: Date | null;
}

export interface RpcSwitchRecord {
  occurredAt: Date;
  fromEndpointId: string | null;
  toEndpointId: string;
  reason: string;
}

export interface ChainEndpointSet {
  chainId: number;
  endpoints: RpcEndpointState[];
  switchHistory: RpcSwitchRecord[];
}

export interface SerializableChainEndpointSet {
  chainId: number;
  endpoints: Array<
    Omit<RpcEndpointState, 'lastSuccessAt' | 'cooldownUntil'> & {
      lastSuccessAt?: string | null;
      cooldownUntil?: string | null;
    }
  >;
  switchHistory: Array<
    Omit<RpcSwitchRecord, 'occurredAt'> & {
      occurredAt: string;
    }
  >;
}

export const createIngestionStream = (input: IngestionStreamInput): IngestionStream => ({
  contestId: input.contestId,
  chainId: input.chainId,
  contractAddress: input.contractAddress.toLowerCase(),
  currentCursorHeight: normaliseBigInt(input.currentCursorHeight ?? 0n),
  currentCursorHash: input.currentCursorHash ?? null,
  nextPollAt: input.nextPollAt ?? new Date(),
  activeRpc: input.activeRpc,
  errorStreak: input.errorStreak ?? 0,
  lagBlocks: input.lagBlocks ?? 0,
  state: input.state ?? 'live',
  metadata: input.metadata ?? {},
});

export const serializeIngestionStream = (stream: IngestionStream): SerializableIngestionStream => ({
  contestId: stream.contestId,
  chainId: stream.chainId,
  contractAddress: stream.contractAddress,
  currentCursorHeight: stream.currentCursorHeight.toString(),
  currentCursorHash: stream.currentCursorHash,
  nextPollAt: stream.nextPollAt.toISOString(),
  activeRpc: stream.activeRpc,
  errorStreak: stream.errorStreak,
  lagBlocks: stream.lagBlocks,
  state: stream.state,
  metadata: stream.metadata,
});

export const deserializeIngestionStream = (input: SerializableIngestionStream): IngestionStream => ({
  contestId: input.contestId,
  chainId: input.chainId,
  contractAddress: input.contractAddress,
  currentCursorHeight: BigInt(input.currentCursorHeight),
  currentCursorHash: input.currentCursorHash,
  nextPollAt: new Date(input.nextPollAt),
  activeRpc: input.activeRpc,
  errorStreak: input.errorStreak,
  lagBlocks: input.lagBlocks,
  state: input.state,
  metadata: input.metadata,
});

export const serializeChainEndpointSet = (input: ChainEndpointSet): SerializableChainEndpointSet => ({
  chainId: input.chainId,
  endpoints: input.endpoints.map((endpoint) => ({
    id: endpoint.id,
    url: endpoint.url,
    priority: endpoint.priority,
    enabled: endpoint.enabled,
    failCount: endpoint.failCount,
    lastSuccessAt: endpoint.lastSuccessAt ? endpoint.lastSuccessAt.toISOString() : undefined,
    cooldownUntil: endpoint.cooldownUntil ? endpoint.cooldownUntil.toISOString() : undefined,
  })),
  switchHistory: input.switchHistory.map((entry) => ({
    occurredAt: entry.occurredAt.toISOString(),
    fromEndpointId: entry.fromEndpointId,
    toEndpointId: entry.toEndpointId,
    reason: entry.reason,
  })),
});

export const deserializeChainEndpointSet = (
  input: SerializableChainEndpointSet,
): ChainEndpointSet => ({
  chainId: input.chainId,
  endpoints: input.endpoints.map((endpoint) => ({
    id: endpoint.id,
    url: endpoint.url,
    priority: endpoint.priority,
    enabled: endpoint.enabled,
    failCount: endpoint.failCount,
    lastSuccessAt: endpoint.lastSuccessAt ? new Date(endpoint.lastSuccessAt) : undefined,
    cooldownUntil: endpoint.cooldownUntil ? new Date(endpoint.cooldownUntil) : undefined,
  })),
  switchHistory: input.switchHistory.map((entry) => ({
    occurredAt: new Date(entry.occurredAt),
    fromEndpointId: entry.fromEndpointId,
    toEndpointId: entry.toEndpointId,
    reason: entry.reason,
  })),
});

const normaliseBigInt = (value: bigint | number | string): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value);
};
