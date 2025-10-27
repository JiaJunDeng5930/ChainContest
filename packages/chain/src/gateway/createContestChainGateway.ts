import {
  createGatewayValidationAdapter,
  isGatewayValidationAdapter,
  type GatewayValidationAdapter,
} from '../policies/validationContext.js';
import { createContestChainGatewayInstance } from './contestChainGateway.js';
import type {
  ContestChainGateway,
  CreateContestChainGatewayOptions,
  GatewayRuntime,
} from './contracts.js';

const resolveValidationAdapter = (
  validators: CreateContestChainGatewayOptions['validators'],
): GatewayValidationAdapter =>
  isGatewayValidationAdapter(validators)
    ? validators
    : createGatewayValidationAdapter(validators);

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
  createContestChainGatewayInstance(createRuntime(options));

export type {
  ContestChainGateway,
  CreateContestChainGatewayOptions,
  DescribeContestLifecycleInput,
  PlanParticipantRegistrationInput,
  PlanPortfolioRebalanceInput,
  ExecuteParticipantRegistrationInput,
  ExecutePortfolioRebalanceInput,
  ExecuteContestSettlementInput,
  ExecuteRewardClaimInput,
  ExecutePrincipalRedemptionInput,
  PullContestEventsInput,
  RebalanceIntent,
} from './contracts.js';
