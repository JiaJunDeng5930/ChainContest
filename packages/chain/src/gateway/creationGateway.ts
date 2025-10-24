import { createHash } from 'node:crypto';
import type { Address } from 'viem';
import {
  createContestCreationReceipt,
  createContestDeploymentArtifact,
  createOrganizerContractRegistrationResult,
  type ContestCreationReceipt,
  type ContestDeploymentArtifact,
  type OrganizerContractRegistrationResult
} from './domainModels';
import {
  type ContestCreationGateway,
  type ExecuteContestDeploymentInput,
  type RegisterOrganizerContractInput,
  type CreateContestCreationGatewayOptions
} from './contracts';
import { lowercaseAddress } from './types';

const hex = (buffer: Buffer, length = 40): string => buffer.toString('hex').slice(0, length);

const deriveAddress = (seed: string, label: string): Address => {
  const digest = createHash('sha256').update(`${seed}:${label}`).digest();
  const addr = `0x${hex(digest, 40)}`;
  return addr;
};

const deriveRequestId = (seed: string): string => {
  const digest = createHash('sha1').update(seed).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
};

const nowIso = (clock?: () => Date): string => {
  const instant = clock ? clock() : new Date();
  return instant.toISOString();
};

class ContestCreationGatewayImpl implements ContestCreationGateway {
  constructor(private readonly options: CreateContestCreationGatewayOptions = {}) {}

  public registerOrganizerContract(
    input: RegisterOrganizerContractInput
  ): Promise<OrganizerContractRegistrationResult> {
    const organizer = lowercaseAddress(input.organizer);
    const seed = JSON.stringify({ organizer, networkId: input.networkId, type: input.contractType });
    const address = deriveAddress(seed, 'organizer-contract');

    return Promise.resolve(createOrganizerContractRegistrationResult({
      status: 'registered',
      organizer,
      networkId: input.networkId,
      contractType: input.contractType,
      address,
      metadata: {
        checksum: createHash('sha256').update(seed).digest('hex'),
        inputMetadata: input.metadata ?? {}
      }
    }));
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
      acceptedAt: nowIso(this.options.clock),
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
  RegisterOrganizerContractInput,
  CreateContestCreationGatewayOptions,
  ContestCreationReceipt,
  ContestDeploymentArtifact,
  OrganizerContractRegistrationResult
} from './contracts';
