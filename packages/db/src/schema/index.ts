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
  userIdentities,
  userIdentityRelations,
  userIdentityStatusEnum,
  walletBindingRelations,
  walletBindings,
  walletSourceEnum
} from './user-bindings.js';

export type { Contest, ContestSnapshot, LeaderboardVersion, Participant, RewardClaim } from './contest-domain.js';
export type { NewContest, NewContestSnapshot, NewLeaderboardVersion, NewParticipant, NewRewardClaim } from './contest-domain.js';
export type { UserIdentity, WalletBinding, NewUserIdentity, NewWalletBinding } from './user-bindings.js';

export const dbSchema = {
  userIdentities,
  walletBindings,
  contests,
  contestSnapshots,
  participants,
  leaderboardVersions,
  rewardClaims
};

export type DbSchema = typeof dbSchema;
