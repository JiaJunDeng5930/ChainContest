import type { DatabasePool, DatabasePoolOptions } from './adapters/connection.js';
import { createDatabasePool } from './adapters/connection.js';
import {
  DbValidationTypes,
  registerDbValidators,
  resetValidationContext,
  validateSingleInput,
  type ValidatorRegistrationOptions
} from './bootstrap/register-validators.js';
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
  type MutateUserWalletParams,
  type MutateUserWalletResult,
  type WalletMutationActorContext,
  type WalletMutationAction
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
  type UserContestQueryResult
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
import type { MilestoneExecutionRecord, MilestoneExecutionStatus } from './schema/milestoneExecution.js';
import type { ReconciliationReportLedger, ReconciliationReportStatus } from './schema/reconciliationReport.js';
import { dbSchema } from './schema/index.js';

let pool: DatabasePool | null = null;

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

export const queryContests = async (
  request: QueryContestsRequest
): Promise<QueryContestsResponse> => {
  const database = ensurePool();

  try {
    validateSingleInput(DbValidationTypes.contestQuery, request);
  } catch (error) {
    const classified = ensureDbError(error);
    const issues = classified.detail?.context?.detail?.issues;
    const hasUnsupportedChainIssue = Array.isArray(issues)
      && issues.some((issue: { message?: string }) => issue?.message?.toLowerCase().includes('unsupported chain'));

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

export const db = {
  init,
  lookupUserWallet,
  mutateUserWallet,
  queryContests,
  queryUserContests,
  writeContestDomain,
  readIngestionStatus,
  writeIngestionEvent,
  upsertMilestoneExecution,
  updateMilestoneExecutionStatus,
  getMilestoneExecutionByIdempotencyKey,
  getMilestoneExecutionByEvent,
  upsertReconciliationReport,
  updateReconciliationReportStatus,
  getReconciliationReportByReportId,
  shutdown,
  isInitialised
};

export type { WalletMutationActorContext, WalletMutationAction };

const ensurePool = (): DatabasePool => {
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
