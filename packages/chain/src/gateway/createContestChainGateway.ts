import {
  createGatewayValidationAdapter,
  isGatewayValidationAdapter,
  type GatewayValidationAdapter,
  type ValidationContext,
} from '@chain/policies/validationContext';
import {
  createContestChainGatewayInstance,
  type ContestChainGatewayInstance,
} from './contestChainGateway';
import type {
  ContestChainGateway,
  CreateContestChainGatewayOptions,
  GatewayRuntime,
} from './contracts';

const resolveValidationAdapter = (
  validators: CreateContestChainGatewayOptions['validators'],
): GatewayValidationAdapter =>
  isGatewayValidationAdapter(validators)
    ? validators
    : createGatewayValidationAdapter(validators as ValidationContext);

const createRuntime = (
  options: CreateContestChainGatewayOptions,
): GatewayRuntime => ({
  validation: resolveValidationAdapter(options.validators),
  rpcClientFactory: options.rpcClientFactory,
  signerLocator: options.signerLocator,
  errorLogger: options.errorLogger,
  dataProvider: options.dataProvider,
});

export const createContestChainGateway = (
  options: CreateContestChainGatewayOptions,
): ContestChainGateway =>
  createContestChainGatewayInstance(createRuntime(options)) as ContestChainGatewayInstance;

export type {
  ContestChainGateway,
  CreateContestChainGatewayOptions,
  DescribeContestLifecycleInput,
  PlanParticipantRegistrationInput,
  PlanPortfolioRebalanceInput,
  ExecuteContestSettlementInput,
  ExecuteRewardClaimInput,
  ExecutePrincipalRedemptionInput,
  PullContestEventsInput,
  RebalanceIntent,
} from './contracts';
