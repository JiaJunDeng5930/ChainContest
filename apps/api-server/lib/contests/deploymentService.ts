import { z } from 'zod';
import { getCreationGateway } from '@/lib/chain/creationGateway';
import { database } from '@/lib/db/client';
import { httpErrors } from '@/lib/http/errors';
import type {
  ContestCreationRequestRecord,
  ContestDeploymentArtifactRecord
} from '@chaincontest/db';
import type { ContestCreationReceipt } from '@chaincontest/chain';
import { lowercaseAddress } from '@/lib/runtime/address';

const bigintSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => (typeof value === 'bigint' ? value : BigInt(value)));

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/u, { message: 'Invalid address format' })
  .transform((value) => lowercaseAddress(value));

const contestIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/u, { message: 'contestId must be bytes32 hex string' })
  .transform((value) => value as `0x${string}`);

const configSchema = z.object({
  entryAsset: addressSchema,
  entryAmount: bigintSchema,
  entryFee: bigintSchema,
  priceSource: addressSchema,
  swapPool: addressSchema,
  priceToleranceBps: z.number().int().nonnegative(),
  settlementWindow: z.number().int().positive(),
  maxParticipants: z.number().int().positive(),
  topK: z.number().int().positive()
});

const timelineSchema = z.object({
  registeringEnds: bigintSchema,
  liveEnds: bigintSchema,
  claimEnds: bigintSchema
});

const payloadSchema = z.object({
  contestId: contestIdSchema,
  vaultComponentId: z.string().uuid(),
  priceSourceComponentId: z.string().uuid(),
  vaultImplementation: addressSchema,
  config: configSchema,
  timeline: timelineSchema,
  initialPrizeAmount: bigintSchema,
  payoutSchedule: z.array(z.number().int().nonnegative()).max(32),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export interface ContestDeploymentServiceInput {
  userId: string;
  organizerAddress: string;
  networkId: number;
  payload: unknown;
}

export interface ContestDeploymentServiceResult {
  request: ContestCreationRequestRecord;
  artifact: ContestDeploymentArtifactRecord | null;
  receipt: ContestCreationReceipt;
}

const toSerializablePayload = (
  payload: z.infer<typeof payloadSchema>
): Record<string, unknown> => ({
  contestId: payload.contestId,
  vaultComponentId: payload.vaultComponentId,
  priceSourceComponentId: payload.priceSourceComponentId,
  vaultImplementation: lowercaseAddress(payload.vaultImplementation),
  config: {
    ...payload.config,
    entryAsset: lowercaseAddress(payload.config.entryAsset),
    priceSource: lowercaseAddress(payload.config.priceSource),
    swapPool: lowercaseAddress(payload.config.swapPool),
    entryAmount: payload.config.entryAmount.toString(),
    entryFee: payload.config.entryFee.toString()
  },
  timeline: {
    registeringEnds: payload.timeline.registeringEnds.toString(),
    liveEnds: payload.timeline.liveEnds.toString(),
    claimEnds: payload.timeline.claimEnds.toString()
  },
  initialPrizeAmount: payload.initialPrizeAmount.toString(),
  payoutSchedule: payload.payoutSchedule,
  metadata: payload.metadata ?? {}
});

const toContestPayload = async (
  userId: string,
  organizerAddress: string,
  networkId: number,
  payload: z.infer<typeof payloadSchema>
) => {
  const [vaultComponent, priceSourceComponent] = await Promise.all([
    database.getOrganizerComponent({ userId, componentId: payload.vaultComponentId }),
    database.getOrganizerComponent({ userId, componentId: payload.priceSourceComponentId })
  ]);

  if (!vaultComponent) {
    throw httpErrors.notFound('Vault component not found', {
      detail: { componentId: payload.vaultComponentId }
    });
  }

  if (!priceSourceComponent) {
    throw httpErrors.notFound('PriceSource component not found', {
      detail: { componentId: payload.priceSourceComponentId }
    });
  }

  if (vaultComponent.componentType !== 'vault_implementation') {
    throw httpErrors.conflict('Selected component is not a vault implementation', {
      detail: { componentId: vaultComponent.id, componentType: vaultComponent.componentType }
    });
  }

  if (priceSourceComponent.componentType !== 'price_source') {
    throw httpErrors.conflict('Selected component is not a price source', {
      detail: { componentId: priceSourceComponent.id, componentType: priceSourceComponent.componentType }
    });
  }

  if (vaultComponent.networkId !== networkId || priceSourceComponent.networkId !== networkId) {
    throw httpErrors.conflict('Component network mismatch', {
      detail: {
        networkId,
        vaultComponentNetwork: vaultComponent.networkId,
        priceSourceComponentNetwork: priceSourceComponent.networkId
      }
    });
  }

  if (vaultComponent.status !== 'confirmed' || priceSourceComponent.status !== 'confirmed') {
    throw httpErrors.conflict('Components must be confirmed before deployment');
  }

  const vaultContractAddress = lowercaseAddress(vaultComponent.contractAddress) as `0x${string}`;
  const priceSourceContractAddress = lowercaseAddress(priceSourceComponent.contractAddress) as `0x${string}`;

  const requestedVaultImplementation = lowercaseAddress(payload.vaultImplementation);
  if (requestedVaultImplementation !== vaultContractAddress) {
    throw httpErrors.conflict('Vault implementation address must match selected component', {
      detail: {
        provided: requestedVaultImplementation,
        expected: vaultContractAddress,
        componentId: payload.vaultComponentId
      }
    });
  }

  const requestedPriceSource = lowercaseAddress(payload.config.priceSource);
  if (requestedPriceSource !== priceSourceContractAddress) {
    throw httpErrors.conflict('Price source address must match selected component', {
      detail: {
        provided: requestedPriceSource,
        expected: priceSourceContractAddress,
        componentId: payload.priceSourceComponentId
      }
    });
  }

  const toComponentReference = (
    component: typeof vaultComponent,
    componentId: string
  ) => ({
    componentId,
    owner: organizerAddress as `0x${string}`,
    walletAddress: (component.walletAddress
      ? lowercaseAddress(component.walletAddress)
      : organizerAddress) as `0x${string}`,
    contractAddress: lowercaseAddress(component.contractAddress) as `0x${string}`,
    configHash: component.configHash
  });

  return {
    contestId: payload.contestId,
    owner: organizerAddress as `0x${string}`,
    vaultImplementation: vaultContractAddress,
    vaultComponent: toComponentReference(vaultComponent, payload.vaultComponentId),
    priceSourceComponent: toComponentReference(priceSourceComponent, payload.priceSourceComponentId),
    config: {
      ...payload.config,
      entryAsset: lowercaseAddress(payload.config.entryAsset) as `0x${string}`,
      priceSource: priceSourceContractAddress,
      swapPool: lowercaseAddress(payload.config.swapPool) as `0x${string}`
    },
    timeline: payload.timeline,
    initialPrizeAmount: payload.initialPrizeAmount,
    payoutSchedule: payload.payoutSchedule,
    metadata: payload.metadata ?? {}
  };
};

const toArtifactRecord = (
  requestId: string,
  artifact: ContestDeploymentArtifact
): ContestDeploymentArtifactRecord => ({
  artifactId: 'pending',
  requestId,
  contestId: null,
  networkId: artifact.networkId,
  registrarAddress: artifact.registrarAddress ?? null,
  treasuryAddress: artifact.treasuryAddress ?? null,
  settlementAddress: artifact.settlementAddress ?? null,
  rewardsAddress: artifact.rewardsAddress ?? null,
  metadata: artifact.metadata ?? {},
  contestId: null,
  contestAddress: artifact.contestAddress,
  vaultFactoryAddress: artifact.vaultFactoryAddress,
  transactionHash: artifact.transactionHash ?? null,
  confirmedAt: artifact.confirmedAt ? new Date(artifact.confirmedAt) : null,
  createdAt: new Date(),
  updatedAt: new Date()
});

export const deployContest = async (
  input: ContestDeploymentServiceInput
): Promise<ContestDeploymentServiceResult> => {
  const parsedPayload = payloadSchema.safeParse(input.payload);
  if (!parsedPayload.success) {
    throw httpErrors.validationFailed('Invalid contest deployment payload', {
      detail: parsedPayload.error.flatten().fieldErrors
    });
  }

  const organizerAddress = lowercaseAddress(input.organizerAddress);
  const chainPayload = await toContestPayload(input.userId, organizerAddress, input.networkId, parsedPayload.data);

  const storedPayload = toSerializablePayload(parsedPayload.data);

  const creation = await database.createContestCreationRequest({
    userId: input.userId,
    networkId: input.networkId,
    payload: storedPayload,
    vaultComponentId: parsedPayload.data.vaultComponentId,
    priceSourceComponentId: parsedPayload.data.priceSourceComponentId,
    status: 'deploying'
  });

  const gateway = getCreationGateway();

  try {
    const receipt = await gateway.executeContestDeployment({
      organizer: organizerAddress as `0x${string}`,
      networkId: input.networkId,
      payload: chainPayload
    });

    if (receipt.status !== 'confirmed' || !receipt.artifact) {
      throw httpErrors.conflict('Contest deployment did not complete successfully', {
        detail: {
          status: receipt.status,
          hasArtifact: Boolean(receipt.artifact)
        }
      });
    }

    let artifactRecord: ContestDeploymentArtifactRecord | null = null;
    artifactRecord = await database.recordContestDeploymentArtifact({
      requestId: creation.request.requestId,
      contestId: null,
      networkId: receipt.artifact.networkId,
      contestAddress: receipt.artifact.contestAddress,
      vaultFactoryAddress: receipt.artifact.vaultFactoryAddress,
      registrarAddress: receipt.artifact.registrarAddress,
      treasuryAddress: receipt.artifact.treasuryAddress,
      settlementAddress: receipt.artifact.settlementAddress,
      rewardsAddress: receipt.artifact.rewardsAddress,
      transactionHash: receipt.artifact.transactionHash ?? null,
      confirmedAt: receipt.artifact.confirmedAt ? new Date(receipt.artifact.confirmedAt) : null,
      metadata: receipt.artifact.metadata ?? {}
    });

    const updated = await database.updateContestCreationRequestStatus({
      requestId: creation.request.requestId,
      status: 'confirmed',
      transactionHash: receipt.artifact?.transactionHash ?? null,
      confirmedAt: receipt.artifact?.confirmedAt ? new Date(receipt.artifact.confirmedAt) : null,
      failureReason: null
    });

    return {
      request: updated,
      artifact: artifactRecord ?? updated.artifact,
      receipt
    };
  } catch (error) {
    await database.updateContestCreationRequestStatus({
      requestId: creation.request.requestId,
      status: 'failed',
      failureReason: {
        message: error instanceof Error ? error.message : 'Contest deployment failed'
      },
      transactionHash: null,
      confirmedAt: null
    });
    throw error;
  }
};
