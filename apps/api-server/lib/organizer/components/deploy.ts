import { z } from 'zod';
import { httpErrors } from '@/lib/http/errors';
import { database } from '@/lib/db/client';
import { getCreationGateway } from '@/lib/chain/creationGateway';
import { logComponentDeployment } from '@/lib/observability/logger';
import type { OrganizerComponentRecord } from '@chaincontest/db';
import type {
  OrganizerComponentRegistrationResult,
  RegisterOrganizerComponentInput,
  OrganizerComponentStatus
} from '@chaincontest/chain';

type OrganizerComponentType = 'vault_implementation' | 'price_source';

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/u, { message: 'Invalid address format' });

const metadataSchema = z.record(z.string(), z.unknown()).optional();

const vaultComponentSchema = z.object({
  componentType: z.literal('vault_implementation'),
  baseAsset: addressSchema,
  quoteAsset: addressSchema,
  metadata: metadataSchema
});

const priceSourceComponentSchema = z.object({
  componentType: z.literal('price_source'),
  poolAddress: addressSchema,
  twapSeconds: z
    .number()
    .int()
    .positive()
    .min(60, { message: 'twapSeconds must be at least 60 seconds' }),
  metadata: metadataSchema
});

const deploymentSchema = z.object({
  userId: z.string().min(1),
  organizerAddress: addressSchema,
  walletAddress: addressSchema,
  networkId: z.number().int().positive(),
  component: z.discriminatedUnion('componentType', [
    vaultComponentSchema,
    priceSourceComponentSchema
  ])
});

export type DeployOrganizerComponentRequest = z.infer<typeof deploymentSchema>;

export interface DeployOrganizerComponentResponse {
  readonly registration: OrganizerComponentRegistrationResult;
  readonly component: OrganizerComponentRecord;
}

const toRegisterInput = (
  payload: DeployOrganizerComponentRequest
): RegisterOrganizerComponentInput => {
  const normalize = (value: string): `0x${string}` => value.toLowerCase() as `0x${string}`;

  const component: RegisterOrganizerComponentInput['component'] =
    payload.component.componentType === 'vault_implementation'
      ? {
          componentType: 'vault_implementation',
          baseAsset: normalize(payload.component.baseAsset),
          quoteAsset: normalize(payload.component.quoteAsset),
          metadata: payload.component.metadata
        }
      : {
          componentType: 'price_source',
          poolAddress: normalize(payload.component.poolAddress),
          twapSeconds: payload.component.twapSeconds,
          metadata: payload.component.metadata
        };

  return {
    organizer: normalize(payload.organizerAddress),
    walletAddress: normalize(payload.walletAddress),
    networkId: payload.networkId,
    component
  };
};

const toDbStatus = (status: OrganizerComponentRegistrationResult['status']): OrganizerComponentStatus => {
  switch (status) {
    case 'pending':
    case 'confirmed':
    case 'failed':
      return status;
    default:
      return 'failed';
  }
};

const ensureContractAddress = (
  contractAddress: OrganizerComponentRegistrationResult['contractAddress'],
  componentType: OrganizerComponentType
): string => {
  if (!contractAddress) {
    throw httpErrors.internal('Deployment did not return a contract address', {
      detail: { componentType }
    });
  }
  return contractAddress.toLowerCase();
};

export const deployOrganizerComponent = async (
  request: DeployOrganizerComponentRequest
): Promise<DeployOrganizerComponentResponse> => {
  const parsed = deploymentSchema.safeParse(request);
  if (!parsed.success) {
    throw httpErrors.badRequest('Invalid component deployment request', {
      detail: parsed.error.flatten().fieldErrors
    });
  }

  const gateway = getCreationGateway();
  const registerInput = toRegisterInput(parsed.data);

  let registration: OrganizerComponentRegistrationResult;
  try {
    registration = await gateway.registerOrganizerComponent(registerInput);
  } catch (error) {
    logComponentDeployment(
      {
        status: 'failed',
        componentType: parsed.data.component.componentType,
        networkId: parsed.data.networkId,
        organizer: parsed.data.organizerAddress,
        walletAddress: parsed.data.walletAddress,
        failureReason: { error: error instanceof Error ? error.message : String(error) }
      },
      error
    );
    throw httpErrors.internal('Component deployment failed', {
      detail: { error: error instanceof Error ? error.message : error }
    });
  }

  const status = toDbStatus(registration.status);
  const contractAddress = ensureContractAddress(
    registration.contractAddress,
    parsed.data.component.componentType
  );

  const metadata = registration.metadata ?? { config: {}, configHash: '' };
  const failureReason = registration.metadata?.failureReason ?? null;
  const transactionHash = registration.metadata?.transactionHash
    ? registration.metadata.transactionHash.toLowerCase()
    : null;
  const confirmedAt = registration.metadata?.confirmedAt
    ? new Date(registration.metadata.confirmedAt)
    : null;

  const dbRecord = (await database.registerOrganizerComponent({
    userId: parsed.data.userId,
    walletAddress: parsed.data.walletAddress,
    networkId: parsed.data.networkId,
    componentType: parsed.data.component.componentType,
    contractAddress,
    config: metadata.config ?? {},
    transactionHash,
    status,
    failureReason,
    confirmedAt
  })) as { component: OrganizerComponentRecord; created: boolean };

  logComponentDeployment({
    status,
    componentType: parsed.data.component.componentType,
    networkId: parsed.data.networkId,
    organizer: parsed.data.organizerAddress,
    walletAddress: parsed.data.walletAddress,
    contractAddress,
    transactionHash,
    metadata: metadata.config,
    failureReason
  });

  return {
    registration,
    component: dbRecord.component
  };
};
