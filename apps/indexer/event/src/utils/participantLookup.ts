import { keccak256, encodePacked } from 'viem';
import type { DbClient } from '../services/dbClient.js';

const ensureRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const resolveParticipantRegistry = (metadata: Record<string, unknown>): Record<string, unknown> => {
  if (metadata.participants && typeof metadata.participants === 'object') {
    return ensureRecord(metadata.participants);
  }

  const gateway = metadata.chainGatewayDefinition && typeof metadata.chainGatewayDefinition === 'object'
    ? ensureRecord(metadata.chainGatewayDefinition)
    : {};

  return ensureRecord(gateway.participants);
};

export const findWalletByVaultReference = async (
  db: DbClient,
  contestId: string,
  chainId: number,
  vaultReference: `0x${string}`,
): Promise<string | null> => {
  const streams = await db.listTrackedContests();
  const entry = streams.find((stream) => stream.contestId === contestId && stream.chainId === chainId);
  if (!entry) {
    return null;
  }

  const metadata = ensureRecord(entry.metadata);
  const registry = resolveParticipantRegistry(metadata);

  const contestDescriptor = ensureRecord(metadata.chainGatewayDefinition);
  const contestInfo = ensureRecord(contestDescriptor.contest);
  const contestBytes32 = typeof contestInfo.contestId === 'string' ? contestInfo.contestId.toLowerCase() : null;
  const contestKeyValid = Boolean(contestBytes32 && /^0x[0-9a-f]{64}$/.test(contestBytes32));

  for (const [wallet, value] of Object.entries(registry)) {
    const record = ensureRecord(value);
    const reference = typeof record.vaultReference === 'string' ? record.vaultReference.toLowerCase() : null;
    const storedVaultId = typeof record.vaultId === 'string' ? record.vaultId.toLowerCase() : null;

    if (reference && reference === vaultReference) {
      return wallet.toLowerCase();
    }

    if (storedVaultId && storedVaultId === vaultReference) {
      return wallet.toLowerCase();
    }

    if (contestKeyValid && /^0x[0-9a-f]{40}$/.test(wallet)) {
      const derivedId = keccak256(
        encodePacked(['bytes32', 'address'], [contestBytes32 as `0x${string}`, wallet.toLowerCase() as `0x${string}`]),
      ).toLowerCase();
      if (derivedId === vaultReference) {
        return wallet.toLowerCase();
      }
    }
  }

  return null;
};
