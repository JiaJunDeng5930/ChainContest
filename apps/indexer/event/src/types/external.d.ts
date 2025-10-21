declare module '@chaincontest/chain' {
  export type ContestEventType =
    | 'registration'
    | 'rebalance'
    | 'settlement'
    | 'reward'
    | 'redemption';

  export interface EventCursor {
    blockNumber: bigint;
    logIndex: number;
  }

  export interface ContestContractAddresses {
    registrar: string;
    settlement?: string;
    rewards?: string;
    redemption?: string;
    treasury?: string;
    oracle?: string;
    policy?: string;
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

  export interface PullContestEventsInput {
    contest: ContestIdentifier;
    cursor?: EventCursor;
    fromBlock?: bigint;
    toBlock?: bigint;
    limit?: number;
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
}

declare module '@chaincontest/shared-schemas' {
  export interface ValidationContextOptions {
    registry: unknown;
    environmentOverrides?: unknown;
    environmentId?: string;
  }
}
