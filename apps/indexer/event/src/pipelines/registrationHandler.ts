import type { Logger } from 'pino';
import { encodePacked, keccak256 } from 'viem';
import type { DomainWriteContext } from '../services/ingestionWriter.js';
import type { DbClient } from '../services/dbClient.js';

const ensureRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const toLowerHex = (value: unknown): `0x${string}` | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
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

const extractContestId = (stream: DomainWriteContext['stream']): `0x${string}` | null => {
  const metadata = ensureRecord(stream.metadata);
  const gateway = ensureRecord(metadata.chainGatewayDefinition);
  const contest = ensureRecord(gateway.contest);
  const contestId = contest.contestId;
  if (typeof contestId !== 'string') {
    return null;
  }
  const trimmed = contestId.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(trimmed) ? (trimmed.toLowerCase() as `0x${string}`) : null;
};

const computeVaultId = (
  stream: DomainWriteContext['stream'],
  participant: `0x${string}`,
): `0x${string}` | null => {
  const contestId = extractContestId(stream);
  if (!contestId) {
    return null;
  }
  return keccak256(encodePacked(['bytes32', 'address'], [contestId, participant])) as `0x${string}`;
};

export const createRegistrationEventHandler = ({
  db,
  logger,
}: {
  db: DbClient;
  logger: Logger;
}) => async ({ stream, event }: DomainWriteContext): Promise<void> => {
  const payload = ensureRecord(event.payload);

  const participant = toLowerHex(payload.participant);
  if (!participant) {
    logger.warn(
      {
        contestId: stream.contestId,
        chainId: stream.chainId,
        txHash: event.txHash,
      },
      'registration event missing participant address; skipping',
    );
    return;
  }

  const vaultReference = toLowerHex(payload.vault);
  const amount = toNumericString(payload.entryAmount ?? payload.amount ?? payload.value) ?? '0';
  const occurredAt = event.derivedAt.timestamp ?? new Date().toISOString();
  const vaultId = participant ? computeVaultId(stream, participant) : null;

  try {
    await db.writeContestDomain({
      action: 'register_participation',
      payload: {
        contestId: stream.contestId,
        walletAddress: participant,
        vaultReference: vaultReference,
        vaultId: vaultId,
        amountWei: amount,
        occurredAt,
        event: {
          chainId: stream.chainId,
          txHash: event.txHash,
          logIndex: event.logIndex,
        },
      },
    });
  } catch (error) {
    logger.error(
      {
        contestId: stream.contestId,
        chainId: stream.chainId,
        participant,
        txHash: event.txHash,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
      },
      'failed to persist registration event',
    );
  }
};
