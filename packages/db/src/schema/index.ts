import {
  contests,
  contestSnapshots,
  leaderboardVersions,
  participants,
  rewardClaims
} from './contest-domain.js';
import { ingestionCursors, ingestionEvents } from './ingestion.js';
import { organizerComponents } from './organizer.js';
import { contestCreationRequests, contestDeploymentArtifacts } from './contest-creation.js';
import { milestoneExecutionRecords } from './milestoneExecution.js';
import { reconciliationReportLedgers } from './reconciliationReport.js';
import { userIdentities, walletBindings } from './user-bindings.js';
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
  authAccountRelations,
  authSessionRelations,
  authUserRelations
} from './auth.js';

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
  organizerComponents,
  organizerComponentRelations
} from './organizer.js';

export {
  contestCreationRequests,
  contestCreationRequestRelations,
  contestDeploymentArtifacts,
  contestDeploymentArtifactRelations
} from './contest-creation.js';

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

export {
  authUsers,
  authAccounts,
  authSessions,
  authVerificationTokens,
  authUserRelations,
  authAccountRelations,
  authSessionRelations
} from './auth.js';

export type { Contest, ContestSnapshot, LeaderboardVersion, Participant, RewardClaim } from './contest-domain.js';
export type { NewContest, NewContestSnapshot, NewLeaderboardVersion, NewParticipant, NewRewardClaim } from './contest-domain.js';
export type { IngestionCursor, NewIngestionCursor, IngestionEvent, NewIngestionEvent } from './ingestion.js';
export type { MilestoneExecutionRecord, NewMilestoneExecutionRecord, MilestoneExecutionStatus } from './milestoneExecution.js';
export type { ReconciliationReportLedger, NewReconciliationReportLedger, ReconciliationReportStatus } from './reconciliationReport.js';
export type { UserIdentity, WalletBinding, NewUserIdentity, NewWalletBinding } from './user-bindings.js';
export type { OrganizerComponent, NewOrganizerComponent } from './organizer.js';
export type {
  ContestCreationRequest,
  NewContestCreationRequest,
  ContestDeploymentArtifact,
  NewContestDeploymentArtifact
} from './contest-creation.js';

export const dbSchema = {
  authUsers,
  authAccounts,
  authSessions,
  authVerificationTokens,
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
  reconciliationReportLedgers,
  organizerComponents,
  contestCreationRequests,
  contestDeploymentArtifacts
};

export type DbSchema = typeof dbSchema;
