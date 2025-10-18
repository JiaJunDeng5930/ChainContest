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
  type MetricsHook
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
import { dbSchema } from './schema/index.js';

let pool: DatabasePool | null = null;

export interface DbInitOptions {
  databaseUrl: string;
  pool?: DatabasePoolOptions['pool'];
  logger?: boolean;
  validators: ValidatorRegistrationOptions;
  metricsHook?: MetricsHook | null;
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

export type {
  ContestAggregate,
  ContestRecord,
  ContestIncludes,
  PaginationOptions,
  ParticipantRecord,
  RewardClaimRecord,
  LeaderboardRecord,
  CreatorSummaryRecord
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

  validateSingleInput(DbValidationTypes.contestQuery, request);
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

export const shutdown = async (): Promise<void> => {
  if (!pool) {
    return;
  }

  await pool.close();
  pool = null;
  resetValidationContext();
  registerMetricsHook(null);
};

export const isInitialised = (): boolean => pool !== null;

export const db = {
  init,
  lookupUserWallet,
  mutateUserWallet,
  queryContests,
  queryUserContests,
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
