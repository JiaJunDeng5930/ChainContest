import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, shutdownDatabase, database } from '../apps/api-server/lib/db/client';

const loadEnvFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0 && process.env[key] === undefined) {
      process.env[key] = rest.join('=').trim();
    }
  }
};

const ensureLocalDatabaseUrl = (): void => {
  const fallback = 'postgresql://chaincontest:chaincontest@localhost:55432/chaincontest';
  const current = process.env.DATABASE_URL;
  if (!current) {
    process.env.DATABASE_URL = fallback;
    return;
  }
  try {
    const parsed = new URL(current);
    if (parsed.hostname === 'postgres') {
      parsed.hostname = 'localhost';
      parsed.port = '55432';
      process.env.DATABASE_URL = parsed.toString();
    }
  } catch {
    process.env.DATABASE_URL = fallback;
  }
};

interface RegistrationRecord {
  contestId: string;
  walletAddress: `0x${string}`;
  vaultReference: `0x${string}`;
  vaultId: `0x${string}`;
  amountWei: string;
  occurredAt: string;
  event: {
    chainId: number;
    txHash: `0x${string}`;
    logIndex: number;
  };
}

const registrations: RegistrationRecord[] = [
  {
    contestId: '8e19554d-43bf-41b4-a86f-7c1100c7c64e',
    walletAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    vaultReference: '0xa9d3e7a726dc08f819e0ec847d92ebbb3d2b8f3b',
    vaultId: '0x6dd3c90e3c5495127273a6962bf64692558cf482ade73ec65f112ca137a99768',
    amountWei: '100',
    occurredAt: '2025-11-09T11:06:19Z',
    event: {
      chainId: 31337,
      txHash: '0xb452d60af4c50eb29e45b7b6aee7c6fcf686c7cc9996cbb20cbc4d816cad6fb9',
      logIndex: 5
    }
  },
  {
    contestId: '235c3457-0914-4a72-8ad6-491d11868537',
    walletAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    vaultReference: '0xd8609476db72a72f81dabf92c1a0d0b3fd789f3e',
    vaultId: '0xbc6fb85518aac0a2986e6e58a089e77747c4f589a2d1b210bb21141e18e3d4f9',
    amountWei: '1000',
    occurredAt: '2025-11-09T11:21:25Z',
    event: {
      chainId: 31337,
      txHash: '0xdf269443011a480e4fca38f595b59854051e53c05882480cf844ef7fafc05253',
      logIndex: 5
    }
  }
];

const main = async (): Promise<void> => {
  loadEnvFile(path.resolve('dev-bootstrap.env'));
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
  ensureLocalDatabaseUrl();

  await initDatabase();
  try {
    for (const registration of registrations) {
      try {
        const result = await database.writeContestDomain({
          action: 'register_participation',
          payload: {
            contestId: registration.contestId,
            walletAddress: registration.walletAddress,
            vaultReference: registration.vaultReference,
            vaultId: registration.vaultId,
            amountWei: registration.amountWei,
            occurredAt: registration.occurredAt,
            event: registration.event
          },
          actorContext: {
            actorId: 'scripts.manual.participant_backfill',
            source: 'manual'
          }
        });
        console.log(registration.contestId, result.status);
      } catch (error) {
        const detail = error && typeof error === 'object' && 'detail' in error ? (error as { detail?: unknown }).detail : null;
        console.error(
          'failed to backfill registration',
          registration.contestId,
          JSON.stringify(detail ?? error, null, 2)
        );
        throw error;
      }
    }
  } finally {
    await shutdownDatabase();
  }
};

void main().catch((error) => {
  console.error('Backfill missing registrations failed', error);
  process.exitCode = 1;
});
