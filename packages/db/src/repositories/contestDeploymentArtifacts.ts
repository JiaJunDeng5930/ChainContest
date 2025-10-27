import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import { contestDeploymentArtifacts, type ContestDeploymentArtifact, type DbSchema } from '../schema/index.js';

export interface RecordContestDeploymentArtifactParams {
  requestId: string;
  contestId?: string | null;
  networkId: number;
  registrarAddress?: string | null;
  treasuryAddress?: string | null;
  settlementAddress?: string | null;
  rewardsAddress?: string | null;
  metadata?: Record<string, unknown>;
}

const normalizeAddress = (value?: string | null): string | null =>
  value ? value.trim().toLowerCase() : null;

export const normalizeDeploymentArtifact = (
  artifact: ContestDeploymentArtifact | null
): ContestDeploymentArtifact | null => {
  if (!artifact) {
    return null;
  }

  return {
    ...artifact,
    registrarAddress: normalizeAddress(artifact.registrarAddress),
    treasuryAddress: normalizeAddress(artifact.treasuryAddress),
    settlementAddress: normalizeAddress(artifact.settlementAddress),
    rewardsAddress: normalizeAddress(artifact.rewardsAddress),
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
        registrarAddress: normalizeAddress(params.registrarAddress),
        treasuryAddress: normalizeAddress(params.treasuryAddress),
        settlementAddress: normalizeAddress(params.settlementAddress),
        rewardsAddress: normalizeAddress(params.rewardsAddress),
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
      registrarAddress: normalizeAddress(params.registrarAddress) ?? existing.registrarAddress,
      treasuryAddress: normalizeAddress(params.treasuryAddress) ?? existing.treasuryAddress,
      settlementAddress: normalizeAddress(params.settlementAddress) ?? existing.settlementAddress,
      rewardsAddress: normalizeAddress(params.rewardsAddress) ?? existing.rewardsAddress,
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
