import type { Address } from 'viem';
import type { PlanRejectionReasonShape } from '../gateway/domainModels.js';
import type {
  ContestRewardConfigEntry,
  ContestRedemptionConfigEntry,
  ContestSettlementConfig,
} from '../gateway/types.js';

export interface SettlementGuardsInput {
  readonly caller: Address;
  readonly config: ContestSettlementConfig;
  readonly blockTimestamp: string;
}

export type SettlementGuardStatus = 'ready' | 'blocked' | 'noop';

export interface SettlementGuardResult {
  readonly status: SettlementGuardStatus;
  readonly reason?: PlanRejectionReasonShape;
}

const settlementAlreadyExecutedReason = (): PlanRejectionReasonShape => ({
  code: 'STATE_CONFLICT',
  message: 'Contest already settled',
});

const settlementNotReadyReason = (
  config: ContestSettlementConfig,
): PlanRejectionReasonShape =>
  config.rejectionReason ?? {
    code: 'RULE_VIOLATION',
    message: 'Contest does not meet settlement predicates',
  };

export const evaluateSettlementGuards = (
  input: SettlementGuardsInput,
): SettlementGuardResult => {
  if (input.config.executed) {
    return {
      status: 'noop',
      reason: settlementAlreadyExecutedReason(),
    };
  }

  if (!input.config.ready) {
    return {
      status: 'blocked',
      reason: settlementNotReadyReason(input.config),
    };
  }

  return {
    status: 'ready',
  };
};

export interface RewardClaimGuardsInput {
  readonly participant: Address;
  readonly entry?: ContestRewardConfigEntry;
}

export type RewardClaimGuardStatus = 'applied' | 'noop' | 'blocked';

export interface RewardClaimGuardResult {
  readonly status: RewardClaimGuardStatus;
  readonly reason?: PlanRejectionReasonShape;
}

const rewardMissingReason = (participant: Address): PlanRejectionReasonShape => ({
  code: 'QUALIFICATION_FAILED',
  message: `No reward available for participant ${participant}`,
});

const rewardBlockedReason = (
  entry: ContestRewardConfigEntry,
): PlanRejectionReasonShape =>
  entry.reason ?? {
    code: 'RULE_VIOLATION',
    message: 'Reward cannot be claimed currently',
  };

export const evaluateRewardClaimGuards = (
  input: RewardClaimGuardsInput,
): RewardClaimGuardResult => {
  if (!input.entry) {
    return {
      status: 'blocked',
      reason: rewardMissingReason(input.participant),
    };
  }

  if (input.entry.status === 'blocked') {
    return {
      status: 'blocked',
      reason: rewardBlockedReason(input.entry),
    };
  }

  if (input.entry.status === 'claimed') {
    return {
      status: 'noop',
      reason: {
        code: 'STATE_CONFLICT',
        message: 'Reward already claimed',
      },
    };
  }

  return {
    status: 'applied',
  };
};

export interface RedemptionGuardsInput {
  readonly participant: Address;
  readonly entry?: ContestRedemptionConfigEntry;
}

export type RedemptionGuardStatus = 'applied' | 'noop' | 'blocked';

export interface RedemptionGuardResult {
  readonly status: RedemptionGuardStatus;
  readonly reason?: PlanRejectionReasonShape;
}

const redemptionMissingReason = (
  participant: Address,
): PlanRejectionReasonShape => ({
  code: 'QUALIFICATION_FAILED',
  message: `No principal redemption available for participant ${participant}`,
});

const redemptionBlockedReason = (
  entry: ContestRedemptionConfigEntry,
): PlanRejectionReasonShape =>
  entry.reason ?? {
    code: 'RULE_VIOLATION',
    message: 'Principal redemption not permitted',
  };

export const evaluateRedemptionGuards = (
  input: RedemptionGuardsInput,
): RedemptionGuardResult => {
  if (!input.entry) {
    return {
      status: 'blocked',
      reason: redemptionMissingReason(input.participant),
    };
  }

  if (input.entry.status === 'blocked') {
    return {
      status: 'blocked',
      reason: redemptionBlockedReason(input.entry),
    };
  }

  if (input.entry.status === 'redeemed') {
    return {
      status: 'noop',
      reason: {
        code: 'STATE_CONFLICT',
        message: 'Principal already redeemed',
      },
    };
  }

  return {
    status: 'applied',
  };
};
