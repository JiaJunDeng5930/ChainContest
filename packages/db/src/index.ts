import type { Pool } from 'pg';
import { and, eq } from 'drizzle-orm';
import type { DatabasePool, DatabasePoolOptions } from './adapters/connection.js';
import { createDatabasePool } from './adapters/connection.js';
import {
  DbValidationTypes,
  registerDbValidators,
  resetValidationContext,
  validateSingleInput,
  type ValidatorRegistrationOptions
} from './bootstrap/register-validators.js';
import { participants } from './schema/index.js';
import {
  registerMetricsHook,
  withMetrics,
  DbError,
  DbErrorCode,
  registerErrorLogger,
  ensureDbError,
  type MetricsHook,
  type ErrorLogger
} from './instrumentation/metrics.js';
import {
  lookupUserWalletRecords,
  type LookupUserWalletParams,
  type LookupUserWalletRecord,
  type WalletBindingSource
} from './repositories/userWalletLookup.js';
import {
  mutateUserWallet as mutateUserWalletRecords,
  ensureUserIdentity as ensureUserIdentityRecord,
  type MutateUserWalletParams,
  type MutateUserWalletResult,
  type WalletMutationActorContext,
  type WalletMutationAction,
  type EnsureUserIdentityParams,
  type EnsureUserIdentityResult
} from './repositories/userWalletMutations.js';
import {
  queryContests as queryContestRecords,
  queryUserContests as queryUserContestRecords,
  type ContestAggregate,
  type ContestRecord,
  type ContestIncludes,
  type ContestQueryParams,
  type ContestQueryResult,
  type CreatorSummaryRecord,
  type LeaderboardRecord,
  type PaginationOptions,
  type ParticipantRecord,
  type RewardClaimRecord,
  type UserContestQueryParams,
  type UserContestQueryResult,
  queryCreatorContests as queryCreatorContestRecords,
  type CreatorContestQueryParams,
  type CreatorContestRecord as RepoCreatorContestRecord,
  type QueryCreatorContestsResponse as RepoQueryCreatorContestsResponse
} from './repositories/contestQueries.js';
import {
  readIngestionStatus as readIngestionCursor,
  writeContestDomain as executeContestDomainWrite,
  writeIngestionEvent as executeIngestionEvent,
  type ContestDomainWriteParams,
  type ContestDomainWriteResult,
  type CursorState,
  type IngestionWriteAction,
  type IngestionWriteResult,
  type ReadIngestionStatusParams
} from './repositories/contestDomainWrites.js';
import {
  findMilestoneExecutionByEvent as findMilestoneExecutionByEventRecord,
  findMilestoneExecutionByIdempotencyKey as findMilestoneExecutionByIdempotencyKeyRecord,
  transitionMilestoneExecutionStatus as transitionMilestoneExecutionStatusRecord,
  upsertMilestoneExecutionRecord as upsertMilestoneExecutionRecordTx,
  type MilestoneExecutionLookupParams,
  type MilestoneExecutionStatusTransitionParams,
  type MilestoneExecutionUpsertParams
} from './repositories/milestoneExecutionRepository.js';
import {
  findReconciliationReportByReportId as findReconciliationReportByReportIdRecord,
  transitionReconciliationReportStatus as transitionReconciliationReportStatusRecord,
  upsertReconciliationReportRecord as upsertReconciliationReportRecordTx,
  type ReconciliationReportStatusTransitionParams,
  type ReconciliationReportUpsertParams
} from './repositories/reconciliationReportRepository.js';
import {
  registerOrganizerComponentRecord,
  listOrganizerComponentsRecords,
  getOrganizerComponentRecord,
  type RegisterOrganizerComponentParams,
  type RegisterOrganizerComponentResult,
  type ListOrganizerComponentsParams,
  type OrganizerRegistryRecord,
  type OrganizerComponentStatus,
  type OrganizerComponentType,
  type GetOrganizerComponentParams
} from './repositories/organizerRegistry.js';
import {
  createContestCreationRequestRecord,
  getContestCreationRequestRecord,
  listContestCreationRequestsRecords,
  updateContestCreationRequestStatusRecord,
  type CreateContestCreationRequestParams,
  type ListContestCreationRequestsParams,
  type ListContestCreationRequestsResponse as RepoListContestCreationRequestsResponse,
  type ContestCreationRequestAggregate,
  type UpdateContestCreationRequestStatusParams
} from './repositories/contestCreationRequests.js';
import {
  recordContestDeploymentArtifactRecord,
  normalizeDeploymentArtifact,
  type RecordContestDeploymentArtifactParams
} from './repositories/contestDeploymentArtifacts.js';
import {
  listContestStreams as listContestStreamsRecord,
  type ContestStreamRecord
} from './repositories/contestStreams.js';
import type { MilestoneExecutionRecord, MilestoneExecutionStatus } from './schema/milestoneExecution.js';
import type { ReconciliationReportLedger, ReconciliationReportStatus } from './schema/reconciliationReport.js';
import { dbSchema, type DbSchema } from './schema/index.js';

let pool: DatabasePool<DbSchema> | null = null;

export interface DbInitOptions {
  databaseUrl: string;
  pool?: DatabasePoolOptions['pool'];
  logger?: boolean;
  validators: ValidatorRegistrationOptions;
  metricsHook?: MetricsHook | null;
  errorLogger?: ErrorLogger | null;
}

export interface LookupUserWalletRequest extends LookupUserWalletParams {}

export interface LookupUserWalletMetadata {
  identityId: string;
  walletId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface LookupUserWalletBinding {
  userId: string;
  userStatus: string;
  walletAddress: string;
  walletAddressChecksum: string;
  source: WalletBindingSource;
  boundAt: Date;
  metadata: LookupUserWalletMetadata;
}

export interface LookupUserWalletResponse {
  bindings: LookupUserWalletBinding[];
}

export interface MutateUserWalletRequest extends MutateUserWalletParams {}

export interface MutateUserWalletResponse extends MutateUserWalletResult {}

export interface OrganizerComponentRecord {
  id: string;
  userId: string;
  walletAddress: string | null;
  networkId: number;
  componentType: OrganizerComponentType;
  contractAddress: string;
  config: Record<string, unknown>;
  configHash: string;
  status: OrganizerComponentStatus;
  transactionHash: string | null;
  failureReason: Record<string, unknown> | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterOrganizerComponentRequest extends RegisterOrganizerComponentParams {}

export interface RegisterOrganizerComponentResponse {
  component: OrganizerComponentRecord;
  created: boolean;
}

export interface ListOrganizerComponentsRequest extends ListOrganizerComponentsParams {}

export interface ListOrganizerComponentsResponse {
  items: OrganizerComponentRecord[];
  nextCursor: string | null;
}

export interface GetOrganizerComponentRequest extends GetOrganizerComponentParams {}

export type GetOrganizerComponentResponse = OrganizerComponentRecord | null;

export interface ContestDeploymentArtifactRecord {
  artifactId: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface TrackedContestStream {
  contestId: string;
  chainId: number;
  contractAddress: string;
  registrarAddress: string;
  treasuryAddress: string | null;
  settlementAddress: string | null;
  rewardsAddress: string | null;
  startBlock: bigint;
  metadata: Record<string, unknown>;
}

export interface ParticipantLookupResult {
  contestId: string;
  walletAddress: string;
  vaultReference: string | null;
}

export interface ContestCreationRequestSummary {
  requestId: string;
  userId: string;
  networkId: number;
  payload: Record<string, unknown>;
  vaultComponentId: string | null;
  priceSourceComponentId: string | null;
  status: 'accepted' | 'deploying' | 'confirmed' | 'failed';
  failureReason: Record<string, unknown> | null;
  transactionHash: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContestCreationRequestRecord {
  request: ContestCreationRequestSummary;
  artifact: ContestDeploymentArtifactRecord | null;
  status: 'accepted' | 'deploying' | 'confirmed' | 'failed';
}

export interface CreateContestCreationRequestRequest extends CreateContestCreationRequestParams {}

export type CreateContestCreationRequestResponse = ContestCreationRequestRecord;

export type GetContestCreationRequestResponse = ContestCreationRequestRecord | null;

export interface ListContestCreationRequestsRequest extends ListContestCreationRequestsParams {}

export interface ListContestCreationRequestsResponse {
  items: ContestCreationRequestRecord[];
  nextCursor: string | null;
}

export interface UpdateContestCreationRequestStatusRequest extends UpdateContestCreationRequestStatusParams {}

export type UpdateContestCreationRequestStatusResponse = ContestCreationRequestRecord;

export interface RecordContestDeploymentArtifactRequest extends RecordContestDeploymentArtifactParams {}

export type RecordContestDeploymentArtifactResponse = ContestDeploymentArtifactRecord;

export interface QueryCreatorContestsRequest extends CreatorContestQueryParams {}

export interface CreatorContestRecord extends ContestCreationRequestRecord {
  contest: ContestRecord | null;
}

export interface QueryCreatorContestsResponse {
  items: CreatorContestRecord[];
  nextCursor: string | null;
}

export interface QueryContestsRequest extends ContestQueryParams {}

export interface QueryContestsResponse extends ContestQueryResult {}

export interface QueryUserContestsRequest extends UserContestQueryParams {}

export interface QueryUserContestsResponse extends UserContestQueryResult {}

export interface WriteContestDomainRequest extends ContestDomainWriteParams {}

export interface WriteContestDomainResponse extends ContestDomainWriteResult {}

export interface ReadIngestionStatusRequest extends ReadIngestionStatusParams {}

export interface ReadIngestionStatusResponse extends CursorState {}

export interface WriteIngestionEventResponse extends IngestionWriteResult {}

export interface UpsertMilestoneExecutionRequest extends MilestoneExecutionUpsertParams {}

export interface MilestoneExecutionStatusTransitionRequest extends MilestoneExecutionStatusTransitionParams {}

export interface MilestoneExecutionLookupRequest extends MilestoneExecutionLookupParams {}

export interface UpsertReconciliationReportRequest extends ReconciliationReportUpsertParams {}

export interface ReconciliationReportStatusTransitionRequest
  extends ReconciliationReportStatusTransitionParams {}

export type {
  ContestAggregate,
  ContestRecord,
  ContestIncludes,
  PaginationOptions,
  ParticipantRecord,
  RewardClaimRecord,
  LeaderboardRecord,
  CreatorSummaryRecord,
  IngestionWriteAction,
  ErrorLogger,
  MilestoneExecutionRecord,
  MilestoneExecutionStatus,
  ReconciliationReportLedger,
  ReconciliationReportStatus
};

export const init = async (options: DbInitOptions): Promise<void> => {
  if (pool) {
    throw new Error('packages/db has already been initialised');
  }

  try {
    registerDbValidators(options.validators);
    pool = createDatabasePool({
      connectionString: options.databaseUrl,
      pool: options.pool,
      logger: options.logger ?? false,
      schema: dbSchema
    });

    registerMetricsHook(options.metricsHook ?? null);
    registerErrorLogger(options.errorLogger ?? null);
  } catch (error) {
    pool = null;
    resetValidationContext();
    throw error;
  }
};

export const lookupUserWallet = async (
  request: LookupUserWalletRequest
): Promise<LookupUserWalletResponse> => {
  const database = ensurePool();

  validateSingleInput(DbValidationTypes.userWalletLookup, request);

  const operation = async (): Promise<LookupUserWalletResponse> => {
    try {
      const records = await lookupUserWalletRecords(database.db, request);
      return {
        bindings: records.map(mapLookupRecord)
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('at least one identifier')) {
        throw new DbError(DbErrorCode.INPUT_INVALID, error.message, { cause: error });
      }
      throw error;
    }
  };

  return withMetrics('lookupUserWallet', operation);
};

export const mutateUserWallet = async (
  request: MutateUserWalletRequest
): Promise<MutateUserWalletResponse> => {
  const database = ensurePool();

  validateSingleInput(DbValidationTypes.userWalletMutation, request);

  const operation = async (): Promise<MutateUserWalletResponse> => {
    return database.withTransaction((tx) => mutateUserWalletRecords(tx, request));
  };

  return withMetrics('mutateUserWallet', operation);
};

export const ensureUserIdentity = async (
  request: EnsureUserIdentityParams
): Promise<EnsureUserIdentityResult> => {
  const database = ensurePool();

  const operation = (): Promise<EnsureUserIdentityResult> =>
    database.withTransaction((tx) => ensureUserIdentityRecord(tx, request));

  return withMetrics('ensureUserIdentity', operation);
};

export const queryContests = async (
  request: QueryContestsRequest
): Promise<QueryContestsResponse> => {
  const database = ensurePool();

  try {
    validateSingleInput(DbValidationTypes.contestQuery, request);
  } catch (error) {
    const classified = ensureDbError(error);
    const issues = (() => {
      const context = classified.detail?.context;
      if (!context || typeof context !== 'object') {
        return [] as Array<{ message?: string }>;
      }
      const detail = (context as { detail?: unknown }).detail;
      if (!detail || typeof detail !== 'object') {
        return [] as Array<{ message?: string }>;
      }
      const rawIssues = (detail as { issues?: unknown }).issues;
      return Array.isArray(rawIssues) ? (rawIssues as Array<{ message?: string }>) : [];
    })();
    const hasUnsupportedChainIssue = issues.some(
      (issue) =>
        typeof issue.message === 'string' && issue.message.toLowerCase().includes('unsupported chain')
    );

    if (
      classified.code === DbErrorCode.INPUT_INVALID
      && (classified.detail?.reason === 'unsupported_chain' || hasUnsupportedChainIssue)
    ) {
      throw new DbError(DbErrorCode.RESOURCE_UNSUPPORTED, classified.message, {
        detail: classified.detail,
        cause: classified
      });
    }

    throw error;
  }
  ensureLeaderboardIncludeIsValid(request.includes);

  const operation = (): Promise<QueryContestsResponse> => queryContestRecords(database.db, request);

  return withMetrics('queryContests', operation);
};

export const queryUserContests = async (
  request: QueryUserContestsRequest
): Promise<QueryUserContestsResponse> => {
  const database = ensurePool();

  validateSingleInput(DbValidationTypes.userContestQuery, request);

  const operation = (): Promise<QueryUserContestsResponse> => queryUserContestRecords(database.db, request);

  return withMetrics('queryUserContests', operation);
};

export const queryCreatorContests = async (
  request: QueryCreatorContestsRequest
): Promise<QueryCreatorContestsResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<QueryCreatorContestsResponse> => {
    const result: RepoQueryCreatorContestsResponse = await queryCreatorContestRecords(
      database.db,
      request
    );

    return {
      items: result.items.map(mapCreatorContestRecord),
      nextCursor: result.nextCursor
    };
  };

  return withMetrics('queryCreatorContests', operation);
};

export const writeContestDomain = async (
  request: WriteContestDomainRequest
): Promise<WriteContestDomainResponse> => {
  const database = ensurePool();

  validateSingleInput(DbValidationTypes.contestDomainWrite, request);

  const operation = (): Promise<WriteContestDomainResponse> =>
    database.withTransaction((tx) => executeContestDomainWrite(tx, request));

  return withMetrics('writeContestDomain', operation);
};

export const readIngestionStatus = async (
  request: ReadIngestionStatusRequest
): Promise<ReadIngestionStatusResponse> => {
  const database = ensurePool();

  validateSingleInput(DbValidationTypes.ingestionStatus, request);

  const operation = (): Promise<ReadIngestionStatusResponse> => readIngestionCursor(database.db, request);

  return withMetrics('readIngestionStatus', operation);
};

export const writeIngestionEvent = async (
  request: IngestionWriteAction
): Promise<WriteIngestionEventResponse> => {
  const database = ensurePool();

  validateSingleInput(DbValidationTypes.ingestionEvent, request);

  const operation = (): Promise<WriteIngestionEventResponse> =>
    database.withTransaction((tx) => executeIngestionEvent(tx, request));

  return withMetrics('writeIngestionEvent', operation);
};

export const upsertMilestoneExecution = async (
  request: UpsertMilestoneExecutionRequest
): Promise<MilestoneExecutionRecord> => {
  const database = ensurePool();

  const operation = (): Promise<MilestoneExecutionRecord> =>
    database.withTransaction((tx) => upsertMilestoneExecutionRecordTx(tx, request));

  return withMetrics('milestoneExecution.upsert', operation);
};

export const updateMilestoneExecutionStatus = async (
  request: MilestoneExecutionStatusTransitionRequest
): Promise<MilestoneExecutionRecord> => {
  const database = ensurePool();

  const operation = (): Promise<MilestoneExecutionRecord> =>
    database.withTransaction((tx) => transitionMilestoneExecutionStatusRecord(tx, request));

  return withMetrics('milestoneExecution.transition', operation);
};

export const getMilestoneExecutionByIdempotencyKey = async (
  idempotencyKey: string
): Promise<MilestoneExecutionRecord | null> => {
  const database = ensurePool();
  return findMilestoneExecutionByIdempotencyKeyRecord(database.db, idempotencyKey);
};

export const getMilestoneExecutionByEvent = async (
  request: MilestoneExecutionLookupRequest
): Promise<MilestoneExecutionRecord | null> => {
  const database = ensurePool();
  return findMilestoneExecutionByEventRecord(database.db, request);
};

export const upsertReconciliationReport = async (
  request: UpsertReconciliationReportRequest
): Promise<ReconciliationReportLedger> => {
  const database = ensurePool();

  const operation = (): Promise<ReconciliationReportLedger> =>
    database.withTransaction((tx) => upsertReconciliationReportRecordTx(tx, request));

  return withMetrics('reconciliationReport.upsert', operation);
};

export const updateReconciliationReportStatus = async (
  request: ReconciliationReportStatusTransitionRequest
): Promise<ReconciliationReportLedger> => {
  const database = ensurePool();

  const operation = (): Promise<ReconciliationReportLedger> =>
    database.withTransaction((tx) => transitionReconciliationReportStatusRecord(tx, request));

  return withMetrics('reconciliationReport.transition', operation);
};

export const registerOrganizerComponent = async (
  request: RegisterOrganizerComponentRequest
): Promise<RegisterOrganizerComponentResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<RegisterOrganizerComponentResponse> => {
    const result: RegisterOrganizerComponentResult = await registerOrganizerComponentRecord(
      database.db,
      request
    );

    return {
      component: mapOrganizerComponentRecord(result.component),
      created: result.created
    };
  };

  return withMetrics('organizer.registerComponent', operation);
};

export const listOrganizerComponents = async (
  request: ListOrganizerComponentsRequest
): Promise<ListOrganizerComponentsResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<ListOrganizerComponentsResponse> => {
    const { items, nextCursor } = await listOrganizerComponentsRecords(database.db, request);
    return {
      items: items.map(mapOrganizerComponentRecord),
      nextCursor
    };
  };

  return withMetrics('organizer.listComponents', operation);
};

export const getOrganizerComponent = async (
  request: GetOrganizerComponentRequest
): Promise<GetOrganizerComponentResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<GetOrganizerComponentResponse> => {
    const record = await getOrganizerComponentRecord(database.db, request);
    return record ? mapOrganizerComponentRecord(record) : null;
  };

  return withMetrics('organizer.getComponent', operation);
};

export const createContestCreationRequest = async (
  request: CreateContestCreationRequestRequest
): Promise<CreateContestCreationRequestResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<CreateContestCreationRequestResponse> => {
    const aggregate = await createContestCreationRequestRecord(database.db, request);
    return mapContestCreationAggregate(aggregate);
  };

  return withMetrics('contestCreation.create', operation);
};

export const updateContestCreationRequestStatus = async (
  request: UpdateContestCreationRequestStatusRequest
): Promise<UpdateContestCreationRequestStatusResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<UpdateContestCreationRequestStatusResponse> => {
    const aggregate = await updateContestCreationRequestStatusRecord(database.db, request);
    return mapContestCreationAggregate(aggregate);
  };

  return withMetrics('contestCreation.updateStatus', operation);
};

export const getContestCreationRequest = async (
  requestId: string
): Promise<GetContestCreationRequestResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<GetContestCreationRequestResponse> => {
    const aggregate = await getContestCreationRequestRecord(database.db, requestId);
    return aggregate ? mapContestCreationAggregate(aggregate) : null;
  };

  return withMetrics('contestCreation.get', operation);
};

export const listContestCreationRequests = async (
  request: ListContestCreationRequestsRequest
): Promise<ListContestCreationRequestsResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<ListContestCreationRequestsResponse> => {
    const result: RepoListContestCreationRequestsResponse = await listContestCreationRequestsRecords(
      database.db,
      request
    );

    return {
      items: result.items.map(mapContestCreationAggregate),
      nextCursor: result.nextCursor
    };
  };

  return withMetrics('contestCreation.list', operation);
};

export const recordContestDeploymentArtifact = async (
  request: RecordContestDeploymentArtifactRequest
): Promise<RecordContestDeploymentArtifactResponse> => {
  const database = ensurePool();

  const operation = async (): Promise<RecordContestDeploymentArtifactResponse> => {
    const artifact = await recordContestDeploymentArtifactRecord(database.db, request);
    return mapContestDeploymentArtifactRecord(normalizeDeploymentArtifact(artifact))!;
  };

  return withMetrics('contestCreation.recordArtifact', operation);
};

export const listTrackedContests = async (): Promise<TrackedContestStream[]> => {
  const database = ensurePool();

  const operation = async (): Promise<TrackedContestStream[]> => {
    const records = await listContestStreamsRecord(database.db);
    return records
      .map(mapContestStreamRecord)
      .filter((stream): stream is TrackedContestStream => stream !== null);
  };

  return withMetrics('contestStreams.listTracked', operation);
};

export const findParticipantByVaultReference = async (
  contestId: string,
  vaultReference: string
): Promise<ParticipantLookupResult | null> => {
  const database = ensurePool();

  const operation = async (): Promise<ParticipantLookupResult | null> => {
    const rows = await database.db
      .select({
        contestId: participants.contestId,
        walletAddress: participants.walletAddress,
        vaultReference: participants.vaultReference
      })
      .from(participants)
      .where(
        and(
          eq(participants.contestId, contestId),
          eq(participants.vaultReference, vaultReference)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0]!;
    return {
      contestId: row.contestId,
      walletAddress: row.walletAddress,
      vaultReference: row.vaultReference
    };
  };

  return withMetrics('participants.lookupByVault', operation);
};

export const getReconciliationReportByReportId = async (
  reportId: string
): Promise<ReconciliationReportLedger | null> => {
  const database = ensurePool();
  return findReconciliationReportByReportIdRecord(database.db, reportId);
};

export const shutdown = async (): Promise<void> => {
  if (!pool) {
    return;
  }

  await pool.close();
  pool = null;
  resetValidationContext();
  registerMetricsHook(null);
  registerErrorLogger(null);
};

export const isInitialised = (): boolean => pool !== null;

export const getConnectionPool = (): Pool => ensurePool().pool;

export const db = {
  init,
  lookupUserWallet,
  mutateUserWallet,
  queryContests,
  queryUserContests,
  queryCreatorContests,
  writeContestDomain,
  readIngestionStatus,
  writeIngestionEvent,
  upsertMilestoneExecution,
  updateMilestoneExecutionStatus,
  getMilestoneExecutionByIdempotencyKey,
  getMilestoneExecutionByEvent,
  upsertReconciliationReport,
  registerOrganizerComponent,
  listOrganizerComponents,
  getOrganizerComponent,
  createContestCreationRequest,
  getContestCreationRequest,
  listContestCreationRequests,
  updateContestCreationRequestStatus,
  recordContestDeploymentArtifact,
  listTrackedContests,
  findParticipantByVaultReference,
  updateReconciliationReportStatus,
  getReconciliationReportByReportId,
  shutdown,
  isInitialised
};

export type {
  WalletMutationActorContext,
  WalletMutationAction,
  EnsureUserIdentityParams,
  EnsureUserIdentityResult
};

const ensurePool = (): DatabasePool<DbSchema> => {
  if (!pool) {
    throw new DbError(DbErrorCode.INTERNAL_ERROR, 'packages/db has not been initialised');
  }

  return pool;
};

const ensureLeaderboardIncludeIsValid = (includes: ContestIncludes | undefined): void => {
  if (!includes?.leaderboard) {
    return;
  }

  if (includes.leaderboard.mode === 'version' && includes.leaderboard.version === undefined) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Leaderboard include requires a version number', {
      detail: {
        reason: 'leaderboard_version_missing'
      }
    });
  }
};

const mapLookupRecord = (record: LookupUserWalletRecord): LookupUserWalletBinding => ({
  userId: record.externalId,
  userStatus: record.identityStatus,
  walletAddress: record.walletAddress,
  walletAddressChecksum: record.walletAddressChecksum,
  source: record.source,
  boundAt: record.boundAt,
  metadata: {
    identityId: record.identityId,
    walletId: record.walletId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy ?? null,
    updatedBy: record.updatedBy ?? null
  }
});

const mapOrganizerComponentRecord = (
  record: OrganizerRegistryRecord
): OrganizerComponentRecord => ({
  id: record.id,
  userId: record.userId,
  walletAddress: record.walletAddress ?? null,
  networkId: record.networkId,
  componentType: record.componentType as OrganizerComponentType,
  contractAddress: record.contractAddress.toLowerCase(),
  config: (record.config ?? {}) as Record<string, unknown>,
  configHash: record.configHash,
  status: record.status as OrganizerComponentStatus,
  transactionHash: record.transactionHash ?? null,
  failureReason: (record.failureReason ?? null) as Record<string, unknown> | null,
  confirmedAt: record.confirmedAt ?? null,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

const mapContestDeploymentArtifactRecord = (
  artifact: ContestCreationRequestAggregate['artifact']
): ContestDeploymentArtifactRecord | null => {
  if (!artifact) {
    return null;
  }

  return {
    artifactId: artifact.id,
    requestId: artifact.requestId,
    contestId: artifact.contestId ?? null,
    networkId: artifact.networkId,
    contestAddress: artifact.contestAddress ?? null,
    vaultFactoryAddress: artifact.vaultFactoryAddress ?? null,
    registrarAddress: artifact.registrarAddress ?? null,
    treasuryAddress: artifact.treasuryAddress ?? null,
    settlementAddress: artifact.settlementAddress ?? null,
    rewardsAddress: artifact.rewardsAddress ?? null,
    transactionHash: artifact.transactionHash ?? null,
    confirmedAt: artifact.confirmedAt ?? null,
    metadata: (artifact.metadata ?? {}) as Record<string, unknown>,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt
  };
};

const mapContestCreationAggregate = (
  aggregate: ContestCreationRequestAggregate
): ContestCreationRequestRecord => ({
  request: {
    requestId: aggregate.request.id,
    userId: aggregate.request.userId,
    networkId: aggregate.request.networkId,
    payload: (aggregate.request.payload ?? {}) as Record<string, unknown>,
    vaultComponentId: aggregate.request.vaultComponentId ?? null,
    priceSourceComponentId: aggregate.request.priceSourceComponentId ?? null,
    status: aggregate.status,
    failureReason: (aggregate.request.failureReason ?? null) as Record<string, unknown> | null,
    transactionHash: aggregate.request.transactionHash ?? null,
    confirmedAt: aggregate.request.confirmedAt,
    createdAt: aggregate.request.createdAt,
    updatedAt: aggregate.request.updatedAt
  },
  artifact: mapContestDeploymentArtifactRecord(aggregate.artifact),
  status: aggregate.status
});

const mapCreatorContestRecord = (
  aggregate: RepoCreatorContestRecord
): CreatorContestRecord => ({
  ...mapContestCreationAggregate(aggregate),
  contest: aggregate.contest ? mapContestRecord(aggregate.contest) : null
});

const mapContestRecord = (record: ContestRecord): ContestRecord => ({
  contestId: record.contestId,
  chainId: record.chainId,
  contractAddress: record.contractAddress.toLowerCase(),
  internalKey: record.internalKey,
  status: record.status,
  timeWindowStart: record.timeWindowStart,
  timeWindowEnd: record.timeWindowEnd,
  originTag: record.originTag,
  sealedAt: record.sealedAt,
  metadata: record.metadata ?? {},
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

const mapContestStreamRecord = (record: ContestStreamRecord): TrackedContestStream | null => {
  const metadata = record.metadata ?? {};
  const gateway = ensureRecord(metadata.chainGatewayDefinition);
  const contest = ensureRecord(gateway.contest);
  const addresses = ensureRecord(contest.addresses ?? gateway.addresses);

  const registrar =
    selectAddress(addresses.registrar)
    ?? selectAddress(record.contractAddress);

  if (!registrar) {
    return null;
  }

  const treasury = selectAddress(addresses.treasury);
  const settlement = selectAddress(addresses.settlement);
  const rewards = selectAddress(addresses.rewards);

  const derived = ensureRecord(gateway.derivedAt ?? metadata.derivedAt);
  const startBlock = parseBlockNumber(derived.blockNumber) ?? 0n;

  return {
    contestId: record.contestId,
    chainId: record.chainId,
    contractAddress: registrar,
    registrarAddress: registrar,
    treasuryAddress: treasury,
    settlementAddress: settlement,
    rewardsAddress: rewards,
    startBlock,
    metadata
  };
};

const ensureRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const selectAddress = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const candidate = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(candidate)) {
    return null;
  }

  return candidate.toLowerCase();
};

const parseBlockNumber = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized >= 0 ? BigInt(normalized) : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.trim();
    try {
      const parsed = normalized.startsWith('0x') ? BigInt(normalized) : BigInt(normalized);
      return parsed >= 0n ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
};
