import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import { contestDeploymentArtifacts, type ContestDeploymentArtifact, type DbSchema } from '../schema/index.js';

export interface RecordContestDeploymentArtifactParams {
  requestId: string;
  contestId?: string | null;
  networkId: number;
  contestAddress?: string | null;
  vaultFactoryAddress?: string | null;
  registrarAddress?: string | null;
  treasuryAddress?: string | null;
  settlementAddress?: string | null;
  rewardsAddress?: string | null;
  metadata?: Record<string, unknown>;
  transactionHash?: string | null;
  confirmedAt?: Date | null;
}

const normalizeAddress = (value?: string | null): string | null =>
  value ? value.trim().toLowerCase() : null;

const normalizeHash = (value?: string | null): string | null =>
  value ? value.trim().toLowerCase() : null;

export const normalizeDeploymentArtifact = (
  artifact: ContestDeploymentArtifact | null
): ContestDeploymentArtifact | null => {
  if (!artifact) {
    return null;
  }

  return {
    ...artifact,
    contestAddress: normalizeAddress(artifact.contestAddress),
    vaultFactoryAddress: normalizeAddress(artifact.vaultFactoryAddress),
    registrarAddress: normalizeAddress(artifact.registrarAddress),
    treasuryAddress: normalizeAddress(artifact.treasuryAddress),
    settlementAddress: normalizeAddress(artifact.settlementAddress),
    rewardsAddress: normalizeAddress(artifact.rewardsAddress),
    transactionHash: normalizeHash(artifact.transactionHash),
    confirmedAt: artifact.confirmedAt ? new Date(artifact.confirmedAt) : null,
    metadata: artifact.metadata ?? {}
  };
};

export const recordContestDeploymentArtifactRecord = async (
  db: DrizzleDatabase<DbSchema>,
  params: RecordContestDeploymentArtifactParams
): Promise<ContestDeploymentArtifact> => {
  const [existing] = await db
    .select()
    .from(contestDeploymentArtifacts)
    .where(eq(contestDeploymentArtifacts.requestId, params.requestId))
    .limit(1);

  if (!existing) {
    const [inserted] = await db
      .insert(contestDeploymentArtifacts)
      .values({
        requestId: params.requestId,
        contestId: params.contestId ?? null,
        networkId: params.networkId,
        contestAddress: normalizeAddress(params.contestAddress),
        vaultFactoryAddress: normalizeAddress(params.vaultFactoryAddress),
        registrarAddress: normalizeAddress(params.registrarAddress),
        treasuryAddress: normalizeAddress(params.treasuryAddress),
        settlementAddress: normalizeAddress(params.settlementAddress),
        rewardsAddress: normalizeAddress(params.rewardsAddress),
        transactionHash: normalizeHash(params.transactionHash),
        confirmedAt: params.confirmedAt ?? null,
        metadata: params.metadata ?? {}
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to insert contest deployment artifact record.');
    }

    return normalizeDeploymentArtifact(inserted)!;
  }

  const [updated] = await db
    .update(contestDeploymentArtifacts)
    .set({
      contestId: params.contestId ?? existing.contestId,
      networkId: params.networkId,
      contestAddress: normalizeAddress(params.contestAddress) ?? existing.contestAddress,
      vaultFactoryAddress: normalizeAddress(params.vaultFactoryAddress) ?? existing.vaultFactoryAddress,
      registrarAddress: normalizeAddress(params.registrarAddress) ?? existing.registrarAddress,
      treasuryAddress: normalizeAddress(params.treasuryAddress) ?? existing.treasuryAddress,
      settlementAddress: normalizeAddress(params.settlementAddress) ?? existing.settlementAddress,
      rewardsAddress: normalizeAddress(params.rewardsAddress) ?? existing.rewardsAddress,
      transactionHash: normalizeHash(params.transactionHash) ?? existing.transactionHash,
      confirmedAt: params.confirmedAt ?? existing.confirmedAt,
      metadata: params.metadata ?? existing.metadata,
      updatedAt: new Date()
    })
    .where(eq(contestDeploymentArtifacts.id, existing.id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update contest deployment artifact record.');
  }

  return normalizeDeploymentArtifact(updated)!;
};
