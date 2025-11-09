import { buildDerivedAnchor } from '@/lib/contests/adminPlanUtils';
import type { ContestChainState } from '@/lib/contests/adminPlanUtils';
import type { ContestSnapshot } from '@/lib/contests/repository';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toIsoTimestamp = (seconds: number | null | undefined): string | undefined => {
  if (seconds === null || seconds === undefined) {
    return undefined;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
};

const readExistingSettlement = (metadata: ContestSnapshot['metadata']): Record<string, unknown> | null => {
  if (!isRecord(metadata)) {
    return null;
  }
  if (isRecord(metadata.settlement)) {
    return metadata.settlement as Record<string, unknown>;
  }
  const gateway = metadata.chainGatewayDefinition;
  if (isRecord(gateway) && isRecord(gateway.settlement)) {
    return gateway.settlement as Record<string, unknown>;
  }
  return null;
};

export const buildSettlementMetadata = (
  snapshot: ContestSnapshot,
  chainState: ContestChainState,
  organizerWallet: string,
  executed: boolean
): Record<string, unknown> => {
  const existing = readExistingSettlement(snapshot.metadata ?? null);
  const anchor = buildDerivedAnchor(snapshot);
  const frozenTimestamp = toIsoTimestamp(chainState.frozenAt) ?? anchor.timestamp ?? new Date().toISOString();
  const blockNumberSource = anchor.blockNumber ?? BigInt(snapshot.derivedAt.blockNumber ?? 0);
  const blockNumber = typeof blockNumberSource === 'bigint' ? blockNumberSource.toString() : String(blockNumberSource);
  const blockHash = anchor.blockHash ?? (snapshot.derivedAt.blockHash as `0x${string}`);
  const leaderboardVersion =
    snapshot.leaderboard?.version ??
    (typeof existing?.leaderboardVersion === 'string' ? (existing.leaderboardVersion as string) : '0');

  const detail = {
    ...(isRecord(existing?.detail) ? (existing!.detail as Record<string, unknown>) : {}),
    participantCount: snapshot.registrationCapacity.registered,
    updatedAt: new Date().toISOString()
  };

  return {
    ready: true,
    executed,
    settlementCall: existing?.settlementCall,
    rejectionReason: existing?.rejectionReason,
    frozenAt: {
      blockNumber,
      blockHash,
      timestamp: frozenTimestamp
    },
    leaderboardVersion,
    snapshotHash: typeof existing?.snapshotHash === 'string' ? (existing.snapshotHash as string) : undefined,
    operator: organizerWallet,
    detail
  };
};
