import {
  contests,
  contestOriginEnum,
  contestRelations,
  contestSnapshots,
  contestSnapshotRelations,
  contestStatusEnum,
  leaderboardRelations,
  leaderboardVersions,
  participants,
  participantRelations,
  rewardClaimRelations,
  rewardClaims
} from './contest-domain.js';
import {
  ingestionCursorRelations,
  ingestionCursors,
  ingestionEventRelations,
  ingestionEvents
} from './ingestion.js';
import {
  milestoneExecutionRecords,
  milestoneExecutionRelations,
  milestoneExecutionStatusEnum
} from './milestoneExecution.js';
import {
  reconciliationReportLedgers,
  reconciliationReportRelations,
  reconciliationReportStatusEnum
} from './reconciliationReport.js';
import {
  userIdentities,
  userIdentityRelations,
  userIdentityStatusEnum,
  walletBindingRelations,
  walletBindings,
  walletSourceEnum
} from './user-bindings.js';

export {
  contests,
  contestOriginEnum,
  contestRelations,
  contestSnapshots,
  contestSnapshotRelations,
  contestStatusEnum,
  leaderboardRelations,
  leaderboardVersions,
  participants,
  participantRelations,
  rewardClaimRelations,
  rewardClaims
} from './contest-domain.js';

export {
  ingestionCursorRelations,
  ingestionCursors,
  ingestionEventRelations,
  ingestionEvents
} from './ingestion.js';

export {
  milestoneExecutionRecords,
  milestoneExecutionRelations,
  milestoneExecutionStatusEnum
} from './milestoneExecution.js';

export {
  reconciliationReportLedgers,
  reconciliationReportRelations,
  reconciliationReportStatusEnum
} from './reconciliationReport.js';

export {
  userIdentities,
  userIdentityRelations,
  userIdentityStatusEnum,
  walletBindingRelations,
  walletBindings,
  walletSourceEnum
} from './user-bindings.js';

export type { Contest, ContestSnapshot, LeaderboardVersion, Participant, RewardClaim } from './contest-domain.js';
export type { NewContest, NewContestSnapshot, NewLeaderboardVersion, NewParticipant, NewRewardClaim } from './contest-domain.js';
export type { IngestionCursor, NewIngestionCursor, IngestionEvent, NewIngestionEvent } from './ingestion.js';
export type { MilestoneExecutionRecord, NewMilestoneExecutionRecord, MilestoneExecutionStatus } from './milestoneExecution.js';
export type { ReconciliationReportLedger, NewReconciliationReportLedger, ReconciliationReportStatus } from './reconciliationReport.js';
export type { UserIdentity, WalletBinding, NewUserIdentity, NewWalletBinding } from './user-bindings.js';

export const dbSchema = {
  userIdentities,
  walletBindings,
  contests,
  contestSnapshots,
  participants,
  leaderboardVersions,
  rewardClaims,
  ingestionCursors,
  ingestionEvents,
  milestoneExecutionRecords,
  reconciliationReportLedgers
};

export type DbSchema = typeof dbSchema;
