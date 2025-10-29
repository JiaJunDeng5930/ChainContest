import type { Address, Hex } from 'viem';

export type DeepReadonly<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

const cloneAndFreeze = <T>(value: T): DeepReadonly<T> => {
  if (Array.isArray(value)) {
    const array = value as unknown[];
    const next = array.map((entry) => cloneAndFreeze(entry));
    return Object.freeze(next) as DeepReadonly<T>;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      clone[key] = cloneAndFreeze(entry);
    }
    return Object.freeze(clone) as DeepReadonly<T>;
  }

  return value as DeepReadonly<T>;
};

export type ContestLifecyclePhase =
  | 'registering'
  | 'live'
  | 'frozen'
  | 'sealed'
  | 'closed';

export interface ContestContractAddresses {
  registrar: Address;
  treasury?: Address;
  settlement?: Address;
  rewards?: Address;
  redemption?: Address;
  oracle?: Address;
  policy?: Address;
}

export interface ContestIdentifierShape {
  contestId: string;
  chainId: number;
  gatewayVersion?: string;
  addresses: ContestContractAddresses;
}

export type ContestIdentifier = DeepReadonly<ContestIdentifierShape>;

export interface BlockAnchorShape {
  blockNumber: bigint;
  blockHash: Hex;
  timestamp?: string;
}

export type BlockAnchor = DeepReadonly<BlockAnchorShape>;

export interface ContestTimelineShape {
  registrationOpensAt?: string;
  registrationClosesAt?: string;
  tradingOpensAt?: string;
  tradingClosesAt?: string;
  freezeAt?: string;
  settlementAvailableAt?: string;
  rewardAvailableAt?: string;
  redemptionAvailableAt?: string;
}

export type ContestTimeline = DeepReadonly<ContestTimelineShape>;

export interface PrizeValuationShape {
  price: string;
  currency: string;
  source?: string;
  observedAt: string;
}

export type PrizeValuation = DeepReadonly<PrizeValuationShape>;

export interface PrizePoolSnapshotShape {
  currentBalance: string;
  accumulatedInflow: string;
  valuationAnchor?: PrizeValuationShape;
}

export type PrizePoolSnapshot = DeepReadonly<PrizePoolSnapshotShape>;

export interface RegistrationCapacityShape {
  registered: number;
  maximum: number;
  isFull: boolean;
}

export type RegistrationCapacity = DeepReadonly<RegistrationCapacityShape>;

export type QualificationVerdict = 'pass' | 'blocked';

export interface QualificationVerdictShape {
  result: QualificationVerdict;
  reason?: string;
  ruleIds?: readonly string[];
}

export type QualificationVerdictSnapshot = DeepReadonly<QualificationVerdictShape>;

export interface LifecycleSnapshotShape {
  phase: ContestLifecyclePhase;
  timeline: ContestTimelineShape;
  prizePool: PrizePoolSnapshotShape;
  registrationCapacity: RegistrationCapacityShape;
  qualificationVerdict: QualificationVerdictShape;
  derivedAt: BlockAnchorShape;
}

export type LifecycleSnapshot = DeepReadonly<LifecycleSnapshotShape>;

export interface QualificationCheckShape {
  rule: string;
  passed: boolean;
  severity?: 'info' | 'warn' | 'error';
  message?: string;
  detail?: Record<string, unknown>;
}

export type QualificationCheck = DeepReadonly<QualificationCheckShape>;

export interface TokenApprovalRequestShape {
  tokenAddress: Address;
  spender: Address;
  amount: string;
  decimals?: number;
  symbol?: string;
  reason?: string;
}

export type TokenApprovalRequest = DeepReadonly<TokenApprovalRequestShape>;

export interface ExecutionCallShape {
  to: Address;
  data: Hex;
  value?: bigint;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  deadline?: string;
}

export type ExecutionCall = DeepReadonly<ExecutionCallShape>;

export interface FeeEstimateShape {
  currency: string;
  estimatedCost: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export type FeeEstimate = DeepReadonly<FeeEstimateShape>;

export interface PlanRejectionReasonShape {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export type PlanRejectionReason = DeepReadonly<PlanRejectionReasonShape>;

export interface RegistrationPlanShape {
  status: 'ready' | 'blocked';
  qualifications: readonly QualificationCheckShape[];
  requiredApprovals: readonly TokenApprovalRequestShape[];
  registrationCall?: ExecutionCallShape;
  estimatedFees?: FeeEstimateShape;
  rejectionReason?: PlanRejectionReasonShape;
  derivedAt: BlockAnchorShape;
}

export type RegistrationPlan = DeepReadonly<RegistrationPlanShape>;

export interface PolicyCheckShape {
  rule: string;
  status: 'pass' | 'fail';
  message?: string;
  detail?: Record<string, unknown>;
}

export type PolicyCheck = DeepReadonly<PolicyCheckShape>;

export interface RouteDescriptorShape {
  steps: readonly string[];
  minimumOutput?: string;
  maximumSlippageBps?: number;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export type RouteDescriptor = DeepReadonly<RouteDescriptorShape>;

export interface RebalancePlanShape {
  status: 'ready' | 'blocked';
  policyChecks: readonly PolicyCheckShape[];
  transaction?: ExecutionCallShape & { route?: RouteDescriptorShape };
  rollbackAdvice?: string;
  rejectionReason?: PlanRejectionReasonShape;
  derivedAt: BlockAnchorShape;
}

export type RebalancePlan = DeepReadonly<RebalancePlanShape>;

export interface RegistrationExecutionResultShape {
  status: 'executed' | 'noop';
  reason?: PlanRejectionReasonShape;
  transaction?: ExecutionCallShape;
  requiredApprovals?: readonly TokenApprovalRequestShape[];
  derivedAt: BlockAnchorShape;
}

export type RegistrationExecutionResult = DeepReadonly<RegistrationExecutionResultShape>;

export interface RebalanceExecutionResultShape {
  status: 'executed' | 'noop';
  reason?: PlanRejectionReasonShape;
  transaction?: ExecutionCallShape & { route?: RouteDescriptorShape };
  rollbackAdvice?: string;
  derivedAt: BlockAnchorShape;
}

export type RebalanceExecutionResult = DeepReadonly<RebalanceExecutionResultShape>;

export interface SettlementDetailShape {
  leaderboardVersion: string;
  snapshotHash?: string;
  operator?: Address;
  metadata?: Record<string, unknown>;
}

export type SettlementDetail = DeepReadonly<SettlementDetailShape>;

export interface SettlementResultShape {
  status: 'applied' | 'noop' | 'blocked';
  settlementCall?: ExecutionCallShape;
  detail?: SettlementDetailShape;
  rejectionReason?: PlanRejectionReasonShape;
  frozenAt: BlockAnchorShape;
}

export type SettlementResult = DeepReadonly<SettlementResultShape>;

export interface PayoutDescriptorShape {
  amount: string;
  currency: string;
  tokenAddress?: Address;
  destination: Address;
}

export type PayoutDescriptor = DeepReadonly<PayoutDescriptorShape>;

export interface RewardClaimResultShape {
  status: 'applied' | 'noop' | 'blocked';
  payout?: PayoutDescriptorShape;
  claimCall?: ExecutionCallShape;
  reason?: PlanRejectionReasonShape;
  derivedAt: BlockAnchorShape;
}

export type RewardClaimResult = DeepReadonly<RewardClaimResultShape>;

export interface RedemptionResultShape {
  status: 'applied' | 'noop' | 'blocked';
  payout?: PayoutDescriptorShape;
  claimCall?: ExecutionCallShape;
  reason?: PlanRejectionReasonShape;
  derivedAt: BlockAnchorShape;
}

export type RedemptionResult = DeepReadonly<RedemptionResultShape>;

export type ContestEventType =
  | 'registration'
  | 'rebalance'
  | 'settlement'
  | 'reward'
  | 'redemption';

export interface EventCursorShape {
  blockNumber: bigint;
  logIndex: number;
}

export type EventCursor = DeepReadonly<EventCursorShape>;

export interface ContestEventEnvelopeShape {
  type: ContestEventType;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  cursor: EventCursorShape;
  payload: Record<string, unknown>;
  reorgFlag: boolean;
  derivedAt: BlockAnchorShape;
}

export type ContestEventEnvelope = DeepReadonly<ContestEventEnvelopeShape>;

export interface ContestEventBatchShape {
  events: readonly ContestEventEnvelopeShape[];
  nextCursor: EventCursorShape;
  latestBlock: BlockAnchorShape;
}

export type ContestEventBatch = DeepReadonly<ContestEventBatchShape>;

export type OrganizerComponentStatus = 'pending' | 'confirmed' | 'failed';

export interface OrganizerComponentMetadataShape {
  config: Record<string, unknown>;
  configHash: string;
  transactionHash?: Hex;
  failureReason?: Record<string, unknown>;
  confirmedAt?: string;
}

export interface OrganizerComponentRegistrationShape {
  status: OrganizerComponentStatus;
  organizer: Address;
  walletAddress: Address;
  networkId: number;
  componentType: 'vault_implementation' | 'price_source';
  contractAddress: Address | null;
  metadata: OrganizerComponentMetadataShape;
}

export type OrganizerComponentRegistrationResult = DeepReadonly<OrganizerComponentRegistrationShape>;

export interface ContestDeploymentArtifactShape {
  networkId: number;
  registrarAddress: Address;
  treasuryAddress?: Address;
  settlementAddress?: Address;
  rewardsAddress?: Address;
  metadata?: Record<string, unknown>;
}

export type ContestDeploymentArtifact = DeepReadonly<ContestDeploymentArtifactShape>;

export interface ContestCreationReceiptShape {
  status: 'accepted' | 'noop';
  requestId: string;
  organizer: Address;
  networkId: number;
  artifact: ContestDeploymentArtifactShape | null;
  acceptedAt: string;
  metadata?: Record<string, unknown>;
  reason?: string;
}

export type ContestCreationReceipt = DeepReadonly<ContestCreationReceiptShape>;

export const createContestIdentifier = (
  payload: ContestIdentifierShape,
): ContestIdentifier => cloneAndFreeze(payload);

export const createBlockAnchor = (payload: BlockAnchorShape): BlockAnchor =>
  cloneAndFreeze(payload);

export const createLifecycleSnapshot = (
  payload: LifecycleSnapshotShape,
): LifecycleSnapshot => cloneAndFreeze(payload);

export const createRegistrationPlan = (
  payload: RegistrationPlanShape,
): RegistrationPlan => cloneAndFreeze(payload);

export const createRebalancePlan = (
  payload: RebalancePlanShape,
): RebalancePlan => cloneAndFreeze(payload);

export const createRegistrationExecutionResult = (
  payload: RegistrationExecutionResultShape,
): RegistrationExecutionResult => cloneAndFreeze(payload);

export const createRebalanceExecutionResult = (
  payload: RebalanceExecutionResultShape,
): RebalanceExecutionResult => cloneAndFreeze(payload);

export const createSettlementResult = (
  payload: SettlementResultShape,
): SettlementResult => cloneAndFreeze(payload);

export const createRewardClaimResult = (
  payload: RewardClaimResultShape,
): RewardClaimResult => cloneAndFreeze(payload);

export const createRedemptionResult = (
  payload: RedemptionResultShape,
): RedemptionResult => cloneAndFreeze(payload);

export const createContestEventEnvelope = (
  payload: ContestEventEnvelopeShape,
): ContestEventEnvelope => cloneAndFreeze(payload);

export const createContestEventBatch = (
  payload: ContestEventBatchShape,
): ContestEventBatch => cloneAndFreeze(payload);

export const createOrganizerComponentRegistrationResult = (
  payload: OrganizerComponentRegistrationShape,
): OrganizerComponentRegistrationResult => cloneAndFreeze(payload);

// Backwards compatibility aliases (to be removed once call sites migrate)
export type OrganizerContractRegistrationResult = OrganizerComponentRegistrationResult;
export const createOrganizerContractRegistrationResult = (
  payload: OrganizerComponentRegistrationShape,
): OrganizerComponentRegistrationResult => createOrganizerComponentRegistrationResult(payload);

export const createContestDeploymentArtifact = (
  payload: ContestDeploymentArtifactShape,
): ContestDeploymentArtifact => cloneAndFreeze(payload);

export const createContestCreationReceipt = (
  payload: ContestCreationReceiptShape,
): ContestCreationReceipt => cloneAndFreeze(payload);
