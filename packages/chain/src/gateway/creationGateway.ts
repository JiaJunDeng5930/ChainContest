import { createHash } from 'node:crypto';
import type { Address, Hex } from 'viem';
import { defineChain, type Chain } from 'viem';
import {
  createContestCreationReceipt,
  createContestDeploymentArtifact,
  createOrganizerComponentRegistrationResult,
  type ContestCreationReceipt,
  type ContestDeploymentArtifact,
  type OrganizerComponentRegistrationResult
} from './domainModels.js';
import {
  type ContestCreationGateway,
  type ExecuteContestDeploymentInput,
  type RegisterOrganizerComponentInput,
  type CreateContestCreationGatewayOptions,
  type ContestDeploymentPayload,
  type ContestDeploymentConfigInput,
  type ContestDeploymentTimelineInput
} from './contracts.js';
import { lowercaseAddress } from './types.js';
import {
  deployPriceSource,
  deployVaultImplementation,
  type ComponentDeploymentResult
} from './componentDeployment.js';
import { defaultDeploymentRuntime, type DeploymentRuntime } from '../runtime/deploymentRuntime.js';
import { deployContestBundle } from './contestDeployment.js';
import { wrapContestChainError } from '../errors/contestChainError.js';

const ETH_CURRENCY = {
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18
} as const;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
};

const computeConfigHash = (config: Record<string, unknown>): string => {
  const digest = createHash('sha256');
  digest.update(stableStringify(config));
  return digest.digest('hex');
};

const deriveRequestId = (seed: string): string => {
  const digest = createHash('sha1').update(seed).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
};

const toIsoString = (instant: Date | null | undefined): string | undefined =>
  instant ? instant.toISOString() : undefined;

const nowIso = (clock?: () => Date): string => {
  const instant = clock ? clock() : new Date();
  return instant.toISOString();
};

const serializeReceipt = (
  receipt: { transactionHash: Hex; blockNumber: bigint; confirmedAt: string | null }
) => ({
  transactionHash: receipt.transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  confirmedAt: receipt.confirmedAt
});

const validateComponentOwnership = (
  organizer: Address,
  component: { owner: Address; walletAddress: Address; contractAddress: Address; componentId: string },
  kind: 'vault_implementation' | 'price_source'
) => {
  const owner = lowercaseAddress(component.owner);
  if (owner !== organizer) {
    throw wrapContestChainError(null, {
      code: 'AUTHORIZATION_REQUIRED',
      message: `Component owner mismatch for ${kind}`,
      retryable: false,
      details: {
        expectedOwner: organizer,
        actualOwner: owner,
        componentId: component.componentId
      }
    });
  }
};

const assertEqualAddress = (left: Address, right: Address, context: string): void => {
  if (lowercaseAddress(left) !== lowercaseAddress(right)) {
    throw wrapContestChainError(null, {
      code: 'VALIDATION_FAILED',
      message: `Address mismatch for ${context}`,
      retryable: false,
      details: {
        expected: left,
        actual: right
      }
    });
  }
};

const normalizeContestConfig = (
  config: ContestDeploymentConfigInput,
  priceSource: Address
) => ({
  entryAsset: lowercaseAddress(config.entryAsset),
  entryAmount: config.entryAmount,
  entryFee: config.entryFee,
  priceSource: lowercaseAddress(priceSource),
  swapPool: lowercaseAddress(config.swapPool),
  priceToleranceBps: config.priceToleranceBps,
  settlementWindow: config.settlementWindow,
  maxParticipants: config.maxParticipants,
  topK: config.topK
});

const normalizeTimeline = (timeline: ContestDeploymentTimelineInput) => ({
  registeringEnds: timeline.registeringEnds,
  liveEnds: timeline.liveEnds,
  claimEnds: timeline.claimEnds
});

const deriveReceiptMetadata = (
  payload: ContestDeploymentPayload,
  contestAddress: Address,
  vaultFactoryAddress: Address,
  bundle: {
    contestDeployment: { transactionHash: Hex; blockNumber: bigint; confirmedAt: string | null };
    vaultFactoryDeployment: { transactionHash: Hex; blockNumber: bigint; confirmedAt: string | null };
    initialization: { transactionHash: Hex; blockNumber: bigint; confirmedAt: string | null };
  }
) => ({
  contestAddress,
  vaultFactoryAddress,
  components: {
    vault: payload.vaultComponent,
    priceSource: payload.priceSourceComponent
  },
  config: {
    entryAsset: payload.config.entryAsset,
    entryAmount: payload.config.entryAmount.toString(),
    entryFee: payload.config.entryFee.toString(),
    priceSource: payload.config.priceSource,
    swapPool: payload.config.swapPool,
    priceToleranceBps: payload.config.priceToleranceBps,
    settlementWindow: payload.config.settlementWindow,
    maxParticipants: payload.config.maxParticipants,
    topK: payload.config.topK
  },
  timeline: {
    registeringEnds: payload.timeline.registeringEnds.toString(),
    liveEnds: payload.timeline.liveEnds.toString(),
    claimEnds: payload.timeline.claimEnds.toString()
  },
  initialPrizeAmount: payload.initialPrizeAmount.toString(),
  transactions: {
    contest: serializeReceipt(bundle.contestDeployment),
    vaultFactory: serializeReceipt(bundle.vaultFactoryDeployment),
    initialize: serializeReceipt(bundle.initialization)
  },
  extra: payload.metadata ?? {}
});

class ContestCreationGatewayImpl implements ContestCreationGateway {
  private readonly runtime: DeploymentRuntime;

  private readonly clock?: () => Date;

  constructor(options: CreateContestCreationGatewayOptions = {}) {
    this.runtime = options.deploymentRuntime ?? defaultDeploymentRuntime;
    this.clock = options.clock;
  }

  private resolveChain(networkId: number): Chain {
    const rpcUrls = this.runtime.resolveRpcUrls(networkId);
    return defineChain({
      id: networkId,
      name: `chain-${networkId}`,
      network: `chain-${networkId}`,
      nativeCurrency: ETH_CURRENCY,
      rpcUrls: {
        default: { http: rpcUrls },
        public: { http: rpcUrls }
      }
    });
  }

  private async deployComponent(
    input: RegisterOrganizerComponentInput
  ): Promise<ComponentDeploymentResult> {
    const chain = this.resolveChain(input.networkId);

    if (input.component.componentType === 'vault_implementation') {
      const baseAsset = lowercaseAddress(input.component.baseAsset);
      const quoteAsset = lowercaseAddress(input.component.quoteAsset);

      return deployVaultImplementation({
        runtime: this.runtime,
        chain,
        baseAsset,
        quoteAsset
      });
    }

    const poolAddress = lowercaseAddress(input.component.poolAddress);
    return deployPriceSource({
      runtime: this.runtime,
      chain,
      poolAddress,
      twapSeconds: input.component.twapSeconds
    });
  }

  public async registerOrganizerComponent(
    input: RegisterOrganizerComponentInput
  ): Promise<OrganizerComponentRegistrationResult> {
    const organizer = lowercaseAddress(input.organizer);
    const walletAddress = lowercaseAddress(input.walletAddress);
    const deployment = await this.deployComponent(input);

    const config: Record<string, unknown> = { ...input.component };
    delete config.componentType;

    return createOrganizerComponentRegistrationResult({
      status: 'confirmed',
      organizer,
      walletAddress,
      networkId: input.networkId,
      componentType: input.component.componentType,
      contractAddress: lowercaseAddress(deployment.contractAddress),
      metadata: {
        config,
        configHash: computeConfigHash(config),
        transactionHash: deployment.transactionHash,
        confirmedAt: toIsoString(deployment.confirmedAt)
      }
    });
  }

  public async executeContestDeployment(
    input: ExecuteContestDeploymentInput
  ): Promise<ContestCreationReceipt> {
    const organizer = lowercaseAddress(input.organizer);
    const payload = input.payload;

    validateComponentOwnership(organizer, payload.vaultComponent, 'vault_implementation');
    validateComponentOwnership(organizer, payload.priceSourceComponent, 'price_source');

    assertEqualAddress(payload.vaultImplementation, payload.vaultComponent.contractAddress, 'vaultImplementation');
    assertEqualAddress(payload.config.priceSource, payload.priceSourceComponent.contractAddress, 'config.priceSource');

    const chain = this.resolveChain(input.networkId);
    const bundle = await deployContestBundle({
      runtime: this.runtime,
      chain,
      organizer,
      contestId: payload.contestId,
      vaultImplementation: lowercaseAddress(payload.vaultImplementation),
      config: normalizeContestConfig(payload.config, payload.priceSourceComponent.contractAddress),
      timeline: normalizeTimeline(payload.timeline),
      initialPrizeAmount: payload.initialPrizeAmount,
      payoutSchedule: payload.payoutSchedule,
      metadata: payload.metadata
    });

    const artifact: ContestDeploymentArtifact = createContestDeploymentArtifact({
      networkId: input.networkId,
      contestAddress: bundle.contestAddress,
      vaultFactoryAddress: bundle.vaultFactoryAddress,
      transactionHash: bundle.initialization.transactionHash,
      confirmedAt: bundle.initialization.confirmedAt ?? undefined,
      metadata: deriveReceiptMetadata(payload, bundle.contestAddress, bundle.vaultFactoryAddress, bundle)
    });

    const seed = JSON.stringify({
      organizer,
      networkId: input.networkId,
      contestAddress: bundle.contestAddress,
      vaultFactoryAddress: bundle.vaultFactoryAddress,
      tx: bundle.initialization.transactionHash
    });

    return createContestCreationReceipt({
      status: 'confirmed',
      requestId: deriveRequestId(seed),
      organizer,
      networkId: input.networkId,
      artifact,
      acceptedAt: bundle.initialization.confirmedAt ?? nowIso(this.clock),
      metadata: {
        componentConfigHash: {
          vault: payload.vaultComponent.configHash,
          priceSource: payload.priceSourceComponent.configHash
        }
      }
    });
  }
}

export const createContestCreationGateway = (
  options: CreateContestCreationGatewayOptions = {}
): ContestCreationGateway => new ContestCreationGatewayImpl(options);

export type {
  ContestCreationGateway,
  ExecuteContestDeploymentInput,
  RegisterOrganizerComponentInput,
  CreateContestCreationGatewayOptions
} from './contracts.js';
