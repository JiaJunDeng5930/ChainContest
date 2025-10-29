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
  type CreateContestCreationGatewayOptions
} from './contracts.js';
import { lowercaseAddress } from './types.js';
import {
  deployPriceSource,
  deployVaultImplementation,
  type ComponentDeploymentResult
} from './componentDeployment.js';
import { defaultDeploymentRuntime, type DeploymentRuntime } from '../runtime/deploymentRuntime.js';

const ETH_CURRENCY = {
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18
} as const;

const hex = (buffer: Buffer, length = 40): string => buffer.toString('hex').slice(0, length);

const deriveAddress = (seed: string, label: string): Address => {
  const digest = createHash('sha256').update(`${seed}:${label}`).digest();
  return `0x${hex(digest, 40)}` as Address;
};

const computeConfigHash = (config: Record<string, unknown>): string => {
  const digest = createHash('sha256');
  const sorted = JSON.stringify(config, Object.keys(config).sort());
  digest.update(sorted);
  return digest.digest('hex');
};

const deriveRequestId = (seed: string): string => {
  const digest = createHash('sha1').update(seed).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
};

const normalizeHex = (value: Hex | null | undefined): Hex | null =>
  value ? (value.toLowerCase() as Hex) : null;

const toIsoString = (instant: Date | null | undefined): string | undefined =>
  instant ? instant.toISOString() : undefined;

const nowIso = (clock?: () => Date): string => {
  const instant = clock ? clock() : new Date();
  return instant.toISOString();
};

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

  public executeContestDeployment(
    input: ExecuteContestDeploymentInput
  ): Promise<ContestCreationReceipt> {
    const organizer = lowercaseAddress(input.organizer);
    const payload = input.payload ?? {};
    const seed = JSON.stringify({ organizer, networkId: input.networkId, payload });

    const artifact: ContestDeploymentArtifact = createContestDeploymentArtifact({
      networkId: input.networkId,
      registrarAddress: deriveAddress(seed, 'registrar'),
      treasuryAddress: deriveAddress(seed, 'treasury'),
      settlementAddress: deriveAddress(seed, 'settlement'),
      rewardsAddress: deriveAddress(seed, 'rewards'),
      metadata: {
        payloadDigest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        seedDigest: createHash('sha256').update(seed).digest('hex')
      }
    });

    return Promise.resolve(createContestCreationReceipt({
      status: 'accepted',
      requestId: deriveRequestId(seed),
      organizer,
      networkId: input.networkId,
      artifact,
      acceptedAt: nowIso(this.clock),
      metadata: {
        payloadSummary: Array.isArray(payload) ? payload.length : Object.keys(payload).length
      }
    }));
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
