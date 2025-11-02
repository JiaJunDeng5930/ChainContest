import type { Logger } from 'pino';
import type { DomainWriteContext } from '../services/ingestionWriter.js';
import type { DbClient } from '../services/dbClient.js';

const ensureRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toLowerHex = (value: unknown): `0x${string}` | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() as `0x${string}`;
};

const toNumericString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return null;
};

export const createRewardEventHandler = ({
  db,
  logger,
}: {
  db: DbClient;
  logger: Logger;
}) => async ({ stream, event }: DomainWriteContext): Promise<void> => {
  const payload = ensureRecord(event.payload);
  const vaultId = toLowerHex(payload.vaultId);
  if (!vaultId) {
    logger.warn(
      {
        contestId: stream.contestId,
        chainId: stream.chainId,
        txHash: event.txHash,
      },
      'reward event missing vault identifier; skipping',
    );
    return;
  }

  const amount = toNumericString(payload.amount) ?? '0';
  const claimedAt = event.derivedAt.timestamp ?? new Date().toISOString();

  try {
    const participant = await db.findParticipantByVaultReference(stream.contestId, vaultId);
    if (!participant) {
      logger.warn(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
          vaultId,
          txHash: event.txHash,
        },
        'reward event for unknown vault reference',
      );
      return;
    }

    await db.writeContestDomain({
      action: 'append_reward_claim',
      payload: {
        contestId: stream.contestId,
        walletAddress: participant.walletAddress,
        amountWei: amount,
        claimedAt,
        event: {
          chainId: stream.chainId,
          txHash: event.txHash,
          logIndex: event.logIndex,
        },
      },
    });

    await db.writeContestDomain({
      action: 'update_participant',
      payload: {
        contestId: stream.contestId,
        walletAddress: participant.walletAddress,
        updates: {
          rewardStatus: 'claimed',
          rewardClaimedAt: claimedAt,
          rewardPayoutAmount: amount,
          rewardVaultReference: vaultId,
        },
      },
    });
  } catch (error) {
    logger.error(
      {
        contestId: stream.contestId,
        chainId: stream.chainId,
        vaultId,
        txHash: event.txHash,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
      },
      'failed to persist reward claim event',
    );
  }
};

