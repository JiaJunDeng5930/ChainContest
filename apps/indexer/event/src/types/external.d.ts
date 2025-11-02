declare module '@chaincontest/chain' {
  export type ContestEventType =
    | 'registration'
    | 'rebalance'
    | 'settlement'
    | 'reward'
    | 'redemption'
    | 'deployment';

  export interface EventCursor {
    blockNumber: bigint;
    logIndex: number;
  }

  export interface ContestContractAddresses {
    registrar: `0x${string}`;
    settlement?: `0x${string}`;
    rewards?: `0x${string}`;
    redemption?: `0x${string}`;
    treasury?: `0x${string}`;
    oracle?: `0x${string}`;
    policy?: `0x${string}`;
  }

  export interface ContestIdentifier {
    contestId: string;
    chainId: number;
    addresses: ContestContractAddresses;
  }

  export interface ContestEventEnvelope {
    type: ContestEventType;
    blockNumber: bigint;
    logIndex: number;
    txHash: `0x${string}`;
    cursor: EventCursor;
    payload: Record<string, unknown>;
    reorgFlag: boolean;
    derivedAt: {
      blockNumber: bigint;
      blockHash: `0x${string}`;
      timestamp?: string;
    };
  }

  export interface ContestEventBatch {
    events: ContestEventEnvelope[];
    nextCursor: EventCursor;
    latestBlock: {
      blockNumber: bigint;
      blockHash: `0x${string}`;
      timestamp?: string;
    };
  }

  export interface ContestDefinition {
    contest: ContestIdentifier;
    phase: string;
    timeline: Record<string, unknown>;
    prizePool: Record<string, unknown>;
    registrationCapacity: {
      registered: number;
      maximum: number;
      isFull: boolean;
    };
    registration: {
      window: { opensAt: string; closesAt: string };
      requirement: {
        tokenAddress: `0x${string}`;
        amount: string;
        spender: `0x${string}`;
        symbol?: string;
        decimals?: number;
        reason?: string;
      };
      approvals?: Array<Record<string, unknown>>;
      template: {
        call: {
          to: `0x${string}`;
          data: `0x${string}`;
        };
      };
    };
    qualificationVerdict: Record<string, unknown>;
    derivedAt: {
      blockNumber: bigint;
      blockHash: `0x${string}`;
      timestamp?: string;
    };
    participants: Record<string, unknown>;
    events?: { events: ContestEventEnvelope[] };
  }

  export interface ContestChainDataProvider {
    loadContestDefinition(
      contest: ContestIdentifier,
      options?: { readonly blockTag?: bigint | 'latest'; readonly rpcUrl?: string },
    ): Promise<ContestDefinition>;
  }

  export interface ContestChainError {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
    source?: string;
  }

  export interface RpcClientFactoryRequest {
    chainId: number;
    cacheKey?: string;
    rpcUrls?: readonly string[];
  }

  export type RpcClientFactory = ((request: RpcClientFactoryRequest) => unknown) & {
    clear?: (cacheKey?: string) => void;
  };

  export interface RpcClientFactoryOptions {
    chains: Record<number, unknown>;
    defaultRpcUrls?: Record<number, readonly string[]>;
  }

  export type SignerLocator = (request: {
    chainId: number;
    participant: `0x${string}`;
    contestId: string;
    cacheKey?: string;
  }) => Promise<unknown>;

  export const createContestChainGateway: (options: {
    validators: unknown;
    rpcClientFactory: RpcClientFactory;
    signerLocator: SignerLocator;
    dataProvider: ContestChainDataProvider;
    errorLogger?: (error: ContestChainError) => void;
  }) => ContestChainGateway;

  export const createContestChainError: (input: {
    code: string;
    message: string;
    retryable?: boolean;
    details?: unknown;
    source?: string;
  }) => ContestChainError;

  export const createGatewayValidationContext: (options: unknown) => unknown;

  export const createRpcClientFactory: (options: RpcClientFactoryOptions) => RpcClientFactory;

  export interface PullContestEventsInput {
    contest: ContestIdentifier;
    cursor?: EventCursor;
    fromBlock?: bigint;
    toBlock?: bigint;
    limit?: number;
    rpcUrl?: string;
  }

  export interface ContestChainGateway {
    describeContestLifecycle: (...args: unknown[]) => Promise<unknown>;
    planParticipantRegistration: (...args: unknown[]) => Promise<unknown>;
    planPortfolioRebalance: (...args: unknown[]) => Promise<unknown>;
    executeContestSettlement: (...args: unknown[]) => Promise<unknown>;
    executeRewardClaim: (...args: unknown[]) => Promise<unknown>;
    executePrincipalRedemption: (...args: unknown[]) => Promise<unknown>;
    pullContestEvents: (input: PullContestEventsInput) => Promise<ContestEventBatch>;
  }
}

declare module '@chaincontest/db' {
  export interface ReadIngestionStatusRequest {
    contestId?: string;
    chainId?: number;
    contractAddress?: string;
  }

  export interface ReadIngestionStatusResponse {
    status: 'tracked' | 'untracked';
    cursorHeight: string | null;
    cursorLogIndex: number | null;
    cursorHash: string | null;
    updatedAt: Date | null;
    contestId: string | null;
    chainId: number | null;
    contractAddress: string | null;
  }

  export interface IngestionWriteAction {
    action: 'record_event' | 'advance_cursor';
    payload: Record<string, unknown>;
    actorContext?: Record<string, unknown> | null;
  }

  export interface WriteIngestionEventResponse {
    status: 'applied' | 'noop';
    cursorHeight?: string;
    cursorLogIndex?: number;
    cursorHash?: string | null;
  }

  export interface WriteContestDomainRequest {
    action: string;
    payload: Record<string, unknown>;
    actorContext?: Record<string, unknown> | null;
  }

  export type WriteContestDomainResponse = Record<string, unknown>;

  export interface DbError extends Error {
    code?: string;
    detail?: Record<string, unknown>;
  }

  export interface DbInitOptions {
    databaseUrl: string;
    validators: {
      registry: unknown;
      overrides?: unknown;
      environmentId?: string;
    };
    pool?: unknown;
    logger?: boolean;
    metricsHook?: MetricsHook | null;
    errorLogger?: (error: DbError) => void;
  }

  export interface MetricsEvent {
    operation: string;
    durationMs: number;
    outcome: 'success' | 'error';
    errorCode?: string;
  }

  export type MetricsHook = (event: MetricsEvent) => void;

  export const init: (options: DbInitOptions) => Promise<void>;
  export const shutdown: () => Promise<void>;
  export const readIngestionStatus: (
    request: ReadIngestionStatusRequest,
  ) => Promise<ReadIngestionStatusResponse>;
  export const writeIngestionEvent: (
    action: IngestionWriteAction,
  ) => Promise<WriteIngestionEventResponse>;
  export const writeContestDomain: (
    request: WriteContestDomainRequest,
  ) => Promise<WriteContestDomainResponse>;

  export interface RecordContestDeploymentArtifactRequest {
    requestId: string;
    contestId: string | null;
    networkId: number;
    contestAddress: string | null;
    vaultFactoryAddress: string | null;
    registrarAddress: string | null;
    treasuryAddress: string | null;
    settlementAddress: string | null;
    rewardsAddress: string | null;
    transactionHash: string | null;
    confirmedAt: Date | null;
    metadata: Record<string, unknown>;
  }

  export interface RecordContestDeploymentArtifactResponse extends RecordContestDeploymentArtifactRequest {
    artifactId: string;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface UpdateContestCreationRequestStatusRequest {
    requestId: string;
    status: 'accepted' | 'deploying' | 'confirmed' | 'failed';
    transactionHash: string | null;
    confirmedAt: Date | null;
    failureReason: Record<string, unknown> | null;
  }

  export interface UpdateContestCreationRequestStatusResponse {
    request: Record<string, unknown>;
    artifact: Record<string, unknown> | null;
    status: 'accepted' | 'deploying' | 'confirmed' | 'failed';
  }

  export interface TrackedContestStream {
    contestId: string;
    chainId: number;
    contractAddress: string;
    registrarAddress: string;
    treasuryAddress?: string | null;
    settlementAddress?: string | null;
    rewardsAddress?: string | null;
    startBlock: bigint;
    metadata: Record<string, unknown>;
  }

  export interface ParticipantLookupResult {
    contestId: string;
    walletAddress: string;
    vaultReference: string | null;
  }

  export const recordContestDeploymentArtifact: (
    request: RecordContestDeploymentArtifactRequest,
  ) => Promise<RecordContestDeploymentArtifactResponse>;

  export const updateContestCreationRequestStatus: (
    request: UpdateContestCreationRequestStatusRequest,
  ) => Promise<UpdateContestCreationRequestStatusResponse>;

  export const listTrackedContests: () => Promise<TrackedContestStream[]>;

  export const findParticipantByVaultReference: (
    contestId: string,
    vaultReference: string,
  ) => Promise<ParticipantLookupResult | null>;
}

declare module '@chaincontest/shared-schemas' {
  export interface ValidationContextOptions {
    registry: unknown;
    environmentOverrides?: unknown;
    environmentId?: string;
  }
}
