import type {
  ContestCreationRequestRecord,
  ContestDeploymentArtifactRecord
} from '@chaincontest/db';
import type { ContestCreationReceipt } from '@chaincontest/chain';

export const serializeArtifact = (artifact: ContestDeploymentArtifactRecord | null) =>
  artifact
    ? {
        artifactId: artifact.id,
        requestId: artifact.requestId,
        contestId: artifact.contestId,
        networkId: artifact.networkId,
        contestAddress: artifact.contestAddress,
        vaultFactoryAddress: artifact.vaultFactoryAddress,
        registrarAddress: artifact.registrarAddress,
        treasuryAddress: artifact.treasuryAddress,
        settlementAddress: artifact.settlementAddress,
        rewardsAddress: artifact.rewardsAddress,
        transactionHash: artifact.transactionHash,
        confirmedAt: artifact.confirmedAt ? artifact.confirmedAt.toISOString() : null,
        metadata: artifact.metadata,
        createdAt: artifact.createdAt.toISOString(),
        updatedAt: artifact.updatedAt.toISOString()
      }
    : null;

export const serializeContestCreation = (record: ContestCreationRequestRecord) => ({
  status: record.status,
  request: {
    requestId: record.request.requestId,
    userId: record.request.userId,
    networkId: record.request.networkId,
    payload: record.request.payload,
    vaultComponentId: record.request.vaultComponentId,
    priceSourceComponentId: record.request.priceSourceComponentId,
    failureReason: record.request.failureReason,
    transactionHash: record.request.transactionHash,
    confirmedAt: record.request.confirmedAt ? record.request.confirmedAt.toISOString() : null,
    createdAt: record.request.createdAt.toISOString(),
    updatedAt: record.request.updatedAt.toISOString()
  },
  artifact: serializeArtifact(record.artifact)
});

export const serializeReceipt = (receipt: ContestCreationReceipt) => ({
  status: receipt.status,
  requestId: receipt.requestId,
  organizer: receipt.organizer,
  networkId: receipt.networkId,
  acceptedAt: receipt.acceptedAt,
  metadata: receipt.metadata ?? {},
  artifact: receipt.artifact
    ? {
        networkId: receipt.artifact.networkId,
        contestAddress: receipt.artifact.contestAddress,
        vaultFactoryAddress: receipt.artifact.vaultFactoryAddress,
        registrarAddress: receipt.artifact.registrarAddress ?? null,
        treasuryAddress: receipt.artifact.treasuryAddress ?? null,
        settlementAddress: receipt.artifact.settlementAddress ?? null,
        rewardsAddress: receipt.artifact.rewardsAddress ?? null,
        transactionHash: receipt.artifact.transactionHash ?? null,
        confirmedAt: receipt.artifact.confirmedAt ?? null,
        metadata: receipt.artifact.metadata ?? {}
      }
    : null
});
