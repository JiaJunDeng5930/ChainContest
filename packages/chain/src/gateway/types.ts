import type { Address } from 'viem';
import type {
  BlockAnchorShape,
  ContestEventEnvelopeShape,
  ContestIdentifier,
  ContestLifecyclePhase,
  ContestTimelineShape,
  PlanRejectionReasonShape,
  PrizePoolSnapshotShape,
  RegistrationCapacityShape,
  QualificationVerdictShape,
  TokenApprovalRequestShape,
  ExecutionCallShape,
  FeeEstimateShape,
  RouteDescriptorShape,
  PayoutDescriptorShape,
} from './domainModels.js';

export interface RegistrationRequirement {
  readonly tokenAddress: Address;
  readonly amount: string;
  readonly spender: Address;
  readonly symbol?: string;
  readonly decimals?: number;
  readonly reason?: string;
}

export interface RegistrationPlanTemplate {
  readonly call: ExecutionCallShape;
  readonly estimatedFees?: FeeEstimateShape;
}

export interface ContestParticipantProfile {
  readonly address: Address;
  readonly balances: Readonly<Record<string, string>>;
  readonly allowances: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly registered: boolean;
  readonly vaultReference?: Address;
  readonly vaultId?: `0x${string}`;
  readonly lastRebalanceAt?: string;
  readonly cooldownEndsAt?: string;
  readonly totalRebalanced?: string;
  readonly rewardStatus?: 'eligible' | 'claimed' | 'blocked';
  readonly rewardPayout?: PayoutDescriptorShape;
  readonly rewardReason?: PlanRejectionReasonShape;
  readonly rewardCall?: ExecutionCallShape;
  readonly redemptionStatus?: 'eligible' | 'redeemed' | 'blocked';
  readonly redemptionPayout?: PayoutDescriptorShape;
  readonly redemptionReason?: PlanRejectionReasonShape;
  readonly redemptionCall?: ExecutionCallShape;
}

export interface ContestRebalanceConfig {
  readonly whitelist: readonly Address[];
  readonly maxTradeAmount: string;
  readonly cooldownSeconds: number;
  readonly priceFreshnessSeconds: number;
  readonly lastPriceUpdatedAt: string;
  readonly spender: Address;
  readonly router: Address;
  readonly slippageBps: number;
  readonly deadlineSeconds: number;
  readonly rollbackAdvice?: string;
  readonly approvals?: readonly TokenApprovalRequestShape[];
  readonly defaultRoute?: RouteDescriptorShape;
  readonly baseAsset: Address;
  readonly quoteAsset: Address;
  readonly poolAddress?: Address;
}

export interface ContestSettlementConfig {
  readonly ready: boolean;
  readonly executed: boolean;
  readonly settlementCall?: ExecutionCallShape;
  readonly rejectionReason?: PlanRejectionReasonShape;
  readonly frozenAt: BlockAnchorShape;
  readonly leaderboardVersion: string;
  readonly snapshotHash?: string;
  readonly operator?: Address;
  readonly detail?: Record<string, unknown>;
}

export interface ContestRewardConfigEntry {
  readonly status: 'eligible' | 'claimed' | 'blocked';
  readonly payout?: PayoutDescriptorShape;
  readonly claimCall?: ExecutionCallShape;
  readonly reason?: PlanRejectionReasonShape;
  readonly derivedAt: BlockAnchorShape;
}

export interface ContestRedemptionConfigEntry {
  readonly status: 'eligible' | 'redeemed' | 'blocked';
  readonly payout?: PayoutDescriptorShape;
  readonly redemptionCall?: ExecutionCallShape;
  readonly reason?: PlanRejectionReasonShape;
  readonly derivedAt: BlockAnchorShape;
}

export interface ContestEventsConfig {
  readonly events: readonly ContestEventEnvelopeShape[];
}

export interface ContestDefinition {
  readonly contest: ContestIdentifier;
  readonly phase: ContestLifecyclePhase;
  readonly timeline: ContestTimelineShape;
  readonly prizePool: PrizePoolSnapshotShape;
  readonly registrationCapacity: RegistrationCapacityShape;
  readonly qualificationVerdict: QualificationVerdictShape;
  readonly derivedAt: BlockAnchorShape;
  readonly registration: {
    readonly window: { readonly opensAt: string; readonly closesAt: string };
    readonly requirement: RegistrationRequirement;
    readonly template: RegistrationPlanTemplate;
    readonly approvals?: readonly TokenApprovalRequestShape[];
  };
  readonly rebalance?: ContestRebalanceConfig;
  readonly settlement?: ContestSettlementConfig;
  readonly rewards?: Readonly<Record<string, ContestRewardConfigEntry>>;
  readonly redemption?: Readonly<Record<string, ContestRedemptionConfigEntry>>;
  readonly participants: Readonly<Record<string, ContestParticipantProfile>>;
  readonly events?: ContestEventsConfig;
}

export interface ContestChainDataProvider {
  loadContestDefinition(
    contest: ContestIdentifier,
    options?: { readonly blockTag?: bigint | 'latest'; readonly rpcUrl?: string },
  ): Promise<ContestDefinition>;
}

export interface EventQueryOptions {
  readonly cursor?: { readonly blockNumber: bigint; readonly logIndex: number };
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
  readonly limit?: number;
}

export interface ContestEventsContext extends ContestEventsConfig {}

export type ParticipantLookup = (
  definition: ContestDefinition,
  participant: Address,
) => ContestParticipantProfile | undefined;

export const lowercaseAddress = (address: Address): Address =>
  address.toLowerCase() as Address;
