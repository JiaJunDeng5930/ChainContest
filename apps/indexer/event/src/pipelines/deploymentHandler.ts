import type { Logger } from 'pino';
import type { DomainWriteContext } from '../services/ingestionWriter.js';
import type { DbClient } from '../services/dbClient.js';

const asString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const parseDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) {
      return new Date(time);
    }
  }
  return null;
};

export const createDeploymentEventHandler = ({
  db,
  logger,
}: {
  db: DbClient;
  logger: Logger;
}) => async ({ stream, event }: DomainWriteContext): Promise<void> => {
  const payload = asRecord(event.payload);

  const requestId =
    asString(payload.requestId)
    ?? asString(payload.contestCreationRequestId)
    ?? asString(payload.id);

  const contestAddress = asString(payload.contestAddress) ?? asString(payload.contest);
  const vaultFactoryAddress = asString(payload.vaultFactoryAddress) ?? asString(payload.vaultFactory);
  const registrarAddress = asString(payload.registrarAddress) ?? stream.addresses.registrar ?? null;
  const treasuryAddress = asString(payload.treasuryAddress) ?? stream.addresses.treasury ?? null;
  const settlementAddress = asString(payload.settlementAddress) ?? stream.addresses.settlement ?? null;
  const rewardsAddress = asString(payload.rewardsAddress) ?? stream.addresses.rewards ?? null;
  const transactionHash = asString(payload.transactionHash) ?? event.txHash ?? null;
  const confirmedAt = parseDate(payload.confirmedAt) ?? parseDate(event.derivedAt.timestamp) ?? new Date();
  const metadata = {
    ...asRecord(payload.metadata),
    source: 'event-ingestion',
    blockNumber: event.blockNumber.toString()
  };

  if (!requestId) {
    logger.warn(
      {
        contestId: stream.contestId,
        chainId: stream.chainId,
        eventType: event.type,
        txHash: event.txHash,
      },
      'deployment event missing requestId; skipping reconciliation',
    );
    return;
  }

  if (!contestAddress || !vaultFactoryAddress) {
    logger.warn(
      {
        contestId: stream.contestId,
        chainId: stream.chainId,
        requestId,
        eventType: event.type,
      },
      'deployment event missing contract addresses; skipping reconciliation',
    );
    return;
  }

  try {
    await db.recordContestDeploymentArtifact({
      requestId,
      contestId: null,
      networkId: stream.chainId,
      contestAddress,
      vaultFactoryAddress,
      registrarAddress,
      treasuryAddress,
      settlementAddress,
      rewardsAddress,
      transactionHash,
      confirmedAt,
      metadata,
    });

    await db.updateContestCreationRequestStatus({
      requestId,
      status: 'confirmed',
      transactionHash,
      confirmedAt,
      failureReason: null,
    });
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
        contestId: stream.contestId,
        chainId: stream.chainId,
        requestId,
      },
      'failed to reconcile deployment artifact from event',
    );
  }
};
