import type { Address } from 'viem';
import type { ContestChainError } from '../errors/contestChainError.js';
import type {
  ContestEventBatch,
  ContestIdentifier,
  ContestCreationReceipt,
  EventCursor,
  LifecycleSnapshot,
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

export interface RegisterOrganizerContractInput {
  readonly organizer: Address;
  readonly networkId: number;
  readonly contractType: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ExecuteContestDeploymentInput {
  readonly organizer: Address;
  readonly networkId: number;
  readonly payload: Record<string, unknown>;
}

export interface CreateContestCreationGatewayOptions {
  readonly clock?: () => Date;
}

export interface ContestCreationGateway {
  readonly registerOrganizerContract: (
    input: RegisterOrganizerContractInput,
  ) => Promise<OrganizerContractRegistrationResult>;
  readonly executeContestDeployment: (
    input: ExecuteContestDeploymentInput,
  ) => Promise<ContestCreationReceipt>;
}

export type {
  ContestCreationReceipt,
  ContestDeploymentArtifact,
  OrganizerContractRegistrationResult,
} from './domainModels.js';
