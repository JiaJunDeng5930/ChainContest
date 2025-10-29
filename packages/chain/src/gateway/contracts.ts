import type { Address, Hex } from 'viem';
import type { ContestChainError } from '../errors/contestChainError.js';
import type {
  ContestEventBatch,
  ContestIdentifier,
  ContestCreationReceipt,
  EventCursor,
  LifecycleSnapshot,
  OrganizerComponentRegistrationResult,
  OrganizerContractRegistrationResult,
  RedemptionResult,
  RegistrationPlan,
  RegistrationExecutionResult,
  RebalanceExecutionResult,
  RebalancePlan,
  RewardClaimResult,
  SettlementResult,
} from './domainModels.js';
import type {
  GatewayValidationAdapter,
  ValidationContext,
} from '../policies/validationContext.js';
import type { RpcClientFactory, SignerLocator } from '../adapters/rpcClientFactory.js';
import type { DeploymentRuntime } from '../runtime/deploymentRuntime.js';
import type { ContestChainDataProvider } from './types.js';

export interface DescribeContestLifecycleInput {
  readonly contest: ContestIdentifier;
  readonly participant?: Address;
  readonly blockTag?: bigint | 'latest';
  readonly includeQualification?: boolean;
}

export interface PlanParticipantRegistrationInput {
  readonly contest: ContestIdentifier;
  readonly participant: Address;
  readonly referrer?: Address;
  readonly blockTag?: bigint | 'latest';
  readonly dryRun?: boolean;
}

export interface RebalanceIntent {
  readonly sellAsset: Address;
  readonly buyAsset: Address;
  readonly amount: string;
  readonly minimumReceived?: string;
  readonly quoteId?: string;
}

export interface PlanPortfolioRebalanceInput {
  readonly contest: ContestIdentifier;
  readonly participant: Address;
  readonly intent: RebalanceIntent;
  readonly blockTag?: bigint | 'latest';
  readonly dryRun?: boolean;
}

export interface ExecuteParticipantRegistrationInput extends PlanParticipantRegistrationInput {}

export interface ExecutePortfolioRebalanceInput extends PlanPortfolioRebalanceInput {}

export interface ExecuteContestSettlementInput {
  readonly contest: ContestIdentifier;
  readonly caller: Address;
  readonly blockTag?: bigint | 'latest';
}

export interface ExecuteRewardClaimInput {
  readonly contest: ContestIdentifier;
  readonly participant: Address;
  readonly blockTag?: bigint | 'latest';
}

export interface ExecutePrincipalRedemptionInput {
  readonly contest: ContestIdentifier;
  readonly participant: Address;
  readonly blockTag?: bigint | 'latest';
}

export interface PullContestEventsInput {
  readonly contest: ContestIdentifier;
  readonly cursor?: EventCursor;
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
  readonly limit?: number;
  readonly rpcUrl?: string;
}

export interface ContestChainGateway {
  readonly describeContestLifecycle: (
    input: DescribeContestLifecycleInput,
  ) => Promise<LifecycleSnapshot>;
  readonly planParticipantRegistration: (
    input: PlanParticipantRegistrationInput,
  ) => Promise<RegistrationPlan>;
  readonly planPortfolioRebalance: (
    input: PlanPortfolioRebalanceInput,
  ) => Promise<RebalancePlan>;
  readonly executeParticipantRegistration: (
    input: ExecuteParticipantRegistrationInput,
  ) => Promise<RegistrationExecutionResult>;
  readonly executePortfolioRebalance: (
    input: ExecutePortfolioRebalanceInput,
  ) => Promise<RebalanceExecutionResult>;
  readonly executeContestSettlement: (
    input: ExecuteContestSettlementInput,
  ) => Promise<SettlementResult>;
  readonly executeRewardClaim: (
    input: ExecuteRewardClaimInput,
  ) => Promise<RewardClaimResult>;
  readonly executePrincipalRedemption: (
    input: ExecutePrincipalRedemptionInput,
  ) => Promise<RedemptionResult>;
  readonly pullContestEvents: (
    input: PullContestEventsInput,
  ) => Promise<ContestEventBatch>;
}

export interface CreateContestChainGatewayOptions {
  readonly validators: GatewayValidationAdapter | ValidationContext;
  readonly rpcClientFactory: RpcClientFactory;
  readonly signerLocator: SignerLocator;
  readonly errorLogger?: (error: ContestChainError) => void;
  readonly dataProvider: ContestChainDataProvider;
}

export interface GatewayRuntime {
  readonly validation: GatewayValidationAdapter;
  readonly rpcClientFactory: RpcClientFactory;
  readonly signerLocator: SignerLocator;
  readonly errorLogger?: (error: ContestChainError) => void;
  readonly dataProvider: ContestChainDataProvider;
}

export interface VaultComponentRegistrationConfig {
  readonly componentType: 'vault_implementation';
  readonly baseAsset: Address;
  readonly quoteAsset: Address;
  readonly metadata?: Record<string, unknown>;
}

export interface PriceSourceComponentRegistrationConfig {
  readonly componentType: 'price_source';
  readonly poolAddress: Address;
  readonly twapSeconds: number;
  readonly metadata?: Record<string, unknown>;
}

export type OrganizerComponentRegistrationConfig =
  | VaultComponentRegistrationConfig
  | PriceSourceComponentRegistrationConfig;

export interface RegisterOrganizerComponentInput {
  readonly organizer: Address;
  readonly walletAddress: Address;
  readonly networkId: number;
  readonly component: OrganizerComponentRegistrationConfig;
}

export interface ExecuteContestDeploymentInput {
  readonly organizer: Address;
  readonly networkId: number;
  readonly payload: ContestDeploymentPayload;
}

export interface CreateContestCreationGatewayOptions {
  readonly clock?: () => Date;
  readonly deploymentRuntime?: DeploymentRuntime;
}

export interface ContestCreationGateway {
  readonly registerOrganizerComponent: (
    input: RegisterOrganizerComponentInput,
  ) => Promise<OrganizerComponentRegistrationResult>;
  readonly executeContestDeployment: (
    input: ExecuteContestDeploymentInput,
  ) => Promise<ContestCreationReceipt>;
}

export type {
  ContestCreationReceipt,
  ContestDeploymentArtifact,
  OrganizerContractRegistrationResult,
  OrganizerComponentRegistrationResult,
  OrganizerComponentStatus,
} from './domainModels.js';

export interface ContestComponentReference {
  readonly componentId: string;
  readonly owner: Address;
  readonly walletAddress: Address;
  readonly contractAddress: Address;
  readonly configHash: string;
}

export interface ContestDeploymentConfigInput {
  readonly entryAsset: Address;
  readonly entryAmount: bigint;
  readonly entryFee: bigint;
  readonly priceSource: Address;
  readonly swapPool: Address;
  readonly priceToleranceBps: number;
  readonly settlementWindow: number;
  readonly maxParticipants: number;
  readonly topK: number;
}

export interface ContestDeploymentTimelineInput {
  readonly registeringEnds: bigint;
  readonly liveEnds: bigint;
  readonly claimEnds: bigint;
}

export interface ContestDeploymentPayload {
  readonly contestId: Hex;
  readonly owner: Address;
  readonly vaultImplementation: Address;
  readonly vaultComponent: ContestComponentReference;
  readonly priceSourceComponent: ContestComponentReference;
  readonly config: ContestDeploymentConfigInput;
  readonly timeline: ContestDeploymentTimelineInput;
  readonly initialPrizeAmount: bigint;
  readonly payoutSchedule: readonly number[];
  readonly metadata?: Record<string, unknown>;
}
