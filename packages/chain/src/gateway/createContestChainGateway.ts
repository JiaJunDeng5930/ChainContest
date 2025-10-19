import type { Address } from 'viem';
import type { ContestChainError } from '@chain/errors/contestChainError';
import { createNotImplementedError } from '@chain/errors/contestChainError';
import {
  createGatewayValidationAdapter,
  isGatewayValidationAdapter,
  type GatewayValidationAdapter,
  type ValidationContext,
} from '@chain/policies/validationContext';
import type {
  ContestEventBatch,
  ContestIdentifier,
  EventCursor,
  LifecycleSnapshot,
  RedemptionResult,
  RegistrationPlan,
  RebalancePlan,
  RewardClaimResult,
  SettlementResult,
} from './domainModels';
import type { RpcClientFactory, SignerLocator } from '@chain/adapters/rpcClientFactory';

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
}

interface GatewayRuntime {
  readonly validation: GatewayValidationAdapter;
  readonly rpcClientFactory: RpcClientFactory;
  readonly signerLocator: SignerLocator;
  readonly errorLogger?: (error: ContestChainError) => void;
}

const resolveValidationAdapter = (
  validators: CreateContestChainGatewayOptions['validators'],
): GatewayValidationAdapter =>
  isGatewayValidationAdapter(validators)
    ? validators
    : createGatewayValidationAdapter(validators);

const rejectNotImplemented = <T>(
  runtime: GatewayRuntime,
  method: string,
): Promise<T> => {
  const error = createNotImplementedError(
    `ContestChainGateway.${method} is not implemented yet`,
  );
  try {
    runtime.errorLogger?.(error);
  } catch {
    // Swallow logger failures but continue surfacing the original error.
  }

  return Promise.reject(error);
};

export const createContestChainGateway = (
  options: CreateContestChainGatewayOptions,
): ContestChainGateway => {
  const runtime: GatewayRuntime = {
    validation: resolveValidationAdapter(options.validators),
    rpcClientFactory: options.rpcClientFactory,
    signerLocator: options.signerLocator,
    errorLogger: options.errorLogger,
  };

  return Object.freeze<ContestChainGateway>({
    describeContestLifecycle: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'describeContestLifecycle');
    },
    planParticipantRegistration: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'planParticipantRegistration');
    },
    planPortfolioRebalance: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'planPortfolioRebalance');
    },
    executeContestSettlement: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'executeContestSettlement');
    },
    executeRewardClaim: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'executeRewardClaim');
    },
    executePrincipalRedemption: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'executePrincipalRedemption');
    },
    pullContestEvents: (_input) => {
      void _input;
      return rejectNotImplemented(runtime, 'pullContestEvents');
    },
  });
};
