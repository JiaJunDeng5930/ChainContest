import type { Logger } from 'pino';
import type { DomainWriteContext } from '../services/ingestionWriter.js';
import type { DbClient } from '../services/dbClient.js';
import { findWalletByVaultReference } from '../utils/participantLookup.js';

const ensureRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toLowerHex = (value: unknown): `0x${string}` | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase() as `0x${string}`;
};

export const createSettlementEventHandler = ({
  db,
  logger,
}: {
  db: DbClient;
  logger: Logger;
}) => async ({ stream, event }: DomainWriteContext): Promise<void> => {
  const payload = ensureRecord(event.payload);
  const derivedAt = event.derivedAt.timestamp ?? new Date().toISOString();

  if (typeof payload.phase === 'string') {
    const phase = payload.phase.toLowerCase();
    try {
      if (phase === 'sealed') {
        await db.writeContestDomain({
          action: 'seal',
          payload: {
            contestId: stream.contestId,
            sealedAt: derivedAt,
            status: 'sealed',
          },
        });
        await db.writeContestDomain({
          action: 'update_phase',
          payload: {
            contestId: stream.contestId,
            phase: 'sealed',
            status: 'sealed',
            sealedAt: derivedAt,
          },
        });
      } else {
        await db.writeContestDomain({
          action: 'update_phase',
          payload: {
            contestId: stream.contestId,
            phase,
          },
        });
      }
    } catch (error) {
      logger.error(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
          phase,
          err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
        },
        'failed to persist settlement phase update',
      );
    }
    return;
  }

  const vaultId = toLowerHex(payload.vaultId);
  if (vaultId) {
    try {
      const walletAddress = await findWalletByVaultReference(db, stream.contestId, stream.chainId, vaultId);
      if (!walletAddress) {
        logger.warn(
          {
            contestId: stream.contestId,
            chainId: stream.chainId,
            vaultId,
          },
          'settlement event received for unknown vault reference',
        );
        return;
      }

      const updates: Record<string, unknown> = {
        lastSettlementAt: derivedAt,
        vaultReference: vaultId,
      };
      if (payload.nav !== undefined) {
        updates.settlementNav = payload.nav;
      }
      if (payload.roiBps !== undefined) {
        updates.settlementRoiBps = payload.roiBps;
      }

      await db.writeContestDomain({
        action: 'update_participant',
        payload: {
          contestId: stream.contestId,
          walletAddress,
          updates,
        },
      });
    } catch (error) {
      logger.error(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
          vaultId,
          err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
        },
        'failed to update participant settlement metadata',
      );
    }
  }
};
