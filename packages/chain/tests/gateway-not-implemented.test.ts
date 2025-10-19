import { describe, expect, it } from 'vitest';
import {
  createContestChainGateway,
  type CreateContestChainGatewayOptions,
} from '../src/gateway/createContestChainGateway';
import type { RpcClientFactory, SignerLocator } from '../src/adapters/rpcClientFactory';
type StubPublicClient = ReturnType<RpcClientFactory>;
type StubWalletClient = Awaited<ReturnType<SignerLocator>>;

import {
  createNotImplementedError,
  ContestChainError,
  wrapContestChainError,
} from '../src/errors/contestChainError';
import type {
  GatewayValidationAdapter,
  ValidationContext,
  FrozenValidationResult,
} from '../src/policies/validationContext';
import type { ContestIdentifier } from '../src/gateway/domainModels';

const stubValidationResult: FrozenValidationResult = Object.freeze({
  status: 'success',
  validatedTypes: Object.freeze([]),
  firstError: null,
  metrics: undefined,
});

const stubValidationAdapter: GatewayValidationAdapter = {
  context: {} as ValidationContext,
  validateRequest: () => stubValidationResult,
  validateType: () => stubValidationResult,
  assertValid: () => stubValidationResult,
  assertTypeValid: () => stubValidationResult,
};

const createGateway = () => {
  const rpcClientFactory = Object.assign(
    () => ({} as StubPublicClient),
    { clear: () => undefined },
  ) as RpcClientFactory;
  const signerLocator: SignerLocator = async () => ({} as StubWalletClient);

  const options: CreateContestChainGatewayOptions = {
    validators: stubValidationAdapter,
    rpcClientFactory,
    signerLocator,
  };

  return createContestChainGateway(options);
};

const contest: ContestIdentifier = Object.freeze({
  contestId: 'contest-1',
  chainId: 1,
  gatewayVersion: 'test',
  addresses: Object.freeze({ registrar: '0x0000000000000000000000000000000000000001' }),
});

describe('createContestChainGateway', () => {
  const gateway = createGateway();

  const methods = [
    () => gateway.describeContestLifecycle({ contest }),
    () =>
      gateway.planParticipantRegistration({
        contest,
        participant: '0x0000000000000000000000000000000000000002',
      }),
    () =>
      gateway.planPortfolioRebalance({
        contest,
        participant: '0x0000000000000000000000000000000000000002',
        intent: {
          sellAsset: '0x0000000000000000000000000000000000000003',
          buyAsset: '0x0000000000000000000000000000000000000004',
          amount: '1',
        },
      }),
    () =>
      gateway.executeContestSettlement({
        contest,
        caller: '0x0000000000000000000000000000000000000002',
      }),
    () =>
      gateway.executeRewardClaim({
        contest,
        participant: '0x0000000000000000000000000000000000000002',
      }),
    () =>
      gateway.executePrincipalRedemption({
        contest,
        participant: '0x0000000000000000000000000000000000000002',
      }),
    () => gateway.pullContestEvents({ contest }),
  ];

  it('rejects with NOT_IMPLEMENTED error for all methods', async () => {
    await Promise.all(
      methods.map(async (factory) => {
        await expect(factory()).rejects.toBeInstanceOf(ContestChainError);
      }),
    );
  });

  it('createNotImplementedError tags the error correctly', () => {
    const error = createNotImplementedError('pending');
    expect(error.code).toBe('NOT_IMPLEMENTED');
  });

  it('wrapContestChainError converts generic errors', () => {
    const wrapped = wrapContestChainError(new Error('Nonce too low'), {
      code: 'STATE_CONFLICT',
    });
    expect(wrapped.code).toBe('STATE_CONFLICT');
  });
});
