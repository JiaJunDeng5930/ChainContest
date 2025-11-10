import fs from 'node:fs';
import path from 'node:path';
import type { Address } from 'viem';
import { readContestState, createDeploymentRuntime } from '@chaincontest/chain';
import type { ContestRecord, QueryContestsResponse } from '@chaincontest/db';
import { initDatabase, shutdownDatabase, database } from '../apps/api-server/lib/db/client';

type ChainContestState = 'uninitialized' | 'registering' | 'live' | 'frozen' | 'sealed' | 'closed';
type DomainStatus = 'registered' | 'active' | 'sealed' | 'settled';

interface PhaseMapping {
  readonly status: DomainStatus;
  readonly phase: 'registering' | 'live' | 'sealed' | 'settled';
}

const loadEnvFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
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

const stateMapping: Record<ChainContestState, PhaseMapping> = {
  uninitialized: { status: 'registered', phase: 'registering' },
  registering: { status: 'registered', phase: 'registering' },
  live: { status: 'active', phase: 'live' },
  frozen: { status: 'sealed', phase: 'sealed' },
  sealed: { status: 'sealed', phase: 'sealed' },
  closed: { status: 'settled', phase: 'settled' }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readPhaseFromMetadata = (contest: ContestRecord): string | null => {
  const metadata = contest.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  if (typeof metadata.phase === 'string' && metadata.phase.length > 0) {
    return metadata.phase;
  }
  const gateway = metadata.chainGatewayDefinition;
  if (isRecord(gateway) && typeof gateway.phase === 'string' && gateway.phase.length > 0) {
    return gateway.phase;
  }
  return null;
};

const normalizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === 'object' && error !== null) {
    return { ...(error as Record<string, unknown>) };
  }
  return { message: String(error) };
};

const isMissingContractError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('contractfunctionexecutionerror')
    || message.includes('execution reverted')
    || message.includes('returned no data')
    || message.includes('function selector was not recognized')
    || (message.includes('contract') && message.includes('not deployed'))
  );
};

const ensureAddress = (value: string): Address => value as Address;

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

const ensureLocalRpcUrl = (): void => {
  const fallback = 'http://127.0.0.1:8545';
  const current = process.env.HARDHAT_RPC_URL;
  if (!current) {
    process.env.HARDHAT_RPC_URL = fallback;
    return;
  }
  try {
    const parsed = new URL(current);
    if (parsed.hostname === 'hardhat-node') {
      parsed.hostname = '127.0.0.1';
      parsed.port = parsed.port || '8545';
      process.env.HARDHAT_RPC_URL = parsed.toString();
    }
  } catch {
    process.env.HARDHAT_RPC_URL = fallback;
  }
  process.env.LOCAL_RPC_URL = process.env.HARDHAT_RPC_URL;
};

const main = async (): Promise<void> => {
  loadEnvFile(path.resolve('dev-bootstrap.env'));
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
  ensureLocalDatabaseUrl();
  ensureLocalRpcUrl();

  const runtime = createDeploymentRuntime();
  await initDatabase();

  try {
    const response = (await database.queryContests({
      selector: {
        filter: {}
      },
      includes: {},
      pagination: {
        cursor: null,
        pageSize: 100
      }
    })) as QueryContestsResponse;

    const contests = (response.items ?? []).map((aggregate) => aggregate.contest);
    if (contests.length === 0) {
      console.log('No contests found in database.');
      return;
    }

    const updates: Array<{ contestId: string; fromStatus: string; toStatus: DomainStatus; toPhase: string }> = [];
    const missing: Array<{ contestId: string; contractAddress: string }> = [];

    for (const contest of contests) {
      const reference = {
        chainId: contest.chainId,
        contestAddress: ensureAddress(contest.contractAddress)
      };
      try {
        const snapshot = await readContestState(runtime, reference);
        const mapping = stateMapping[snapshot.state as ChainContestState];
        if (!mapping) {
          console.warn(
            {
              contestId: contest.contestId,
              state: snapshot.state
            },
            'Unknown contest state mapping; skipping'
          );
          continue;
        }

        const currentPhase = readPhaseFromMetadata(contest);
        if (contest.status === mapping.status && currentPhase === mapping.phase) {
          continue;
        }

        console.log(
          {
            contestId: contest.contestId,
            storedStatus: contest.status,
            storedPhase: currentPhase,
            targetStatus: mapping.status,
            targetPhase: mapping.phase
          },
          'Contest phase mismatch detected'
        );

        await database.writeContestDomain({
          action: 'update_phase',
          payload: {
            contestId: contest.contestId,
            phase: mapping.phase,
            status: mapping.status
          },
          actorContext: {
            actorId: 'scripts.reconcile',
            source: 'manual_sync',
            reason: `chain_state:${snapshot.state}`
          }
        });
        updates.push({
          contestId: contest.contestId,
          fromStatus: contest.status,
          toStatus: mapping.status,
          toPhase: mapping.phase
        });
      } catch (error) {
        if (isMissingContractError(error)) {
          missing.push({
            contestId: contest.contestId,
            contractAddress: contest.contractAddress
          });
          continue;
        }
        console.error(
          {
            contestId: contest.contestId,
            contractAddress: contest.contractAddress,
            err: normalizeError(error)
          },
          'Failed to read contest state'
        );
      }
    }

    if (updates.length > 0) {
      console.table(
        updates.map((entry) => ({
          contestId: entry.contestId,
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          phase: entry.toPhase
        }))
      );
    } else {
      console.log('No contest phase updates were required.');
    }

    if (missing.length > 0) {
      console.warn('Contracts missing on-chain code:');
      console.table(
        missing.map((entry) => ({
          contestId: entry.contestId,
          contractAddress: entry.contractAddress
        }))
      );
    }
  } finally {
    await shutdownDatabase();
  }
};

void main().catch((error) => {
  console.error('reconcile-contests failed', normalizeError(error));
  process.exitCode = 1;
});
