import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, shutdownDatabase, database } from '../apps/api-server/lib/db/client';
import {
  buildFallbackContestMetadata,
  deserializeStoredPayload,
  toIsoOrNow
} from '../apps/api-server/lib/contests/deploymentService';

const args = process.argv.slice(2);
const userId = args[0];
const requestFilterArg = args.find((value) => value.startsWith('--request='));
const requestFilter = requestFilterArg
  ? requestFilterArg.replace('--request=', '').split(',').map((value) => value.trim()).filter(Boolean)
  : null;

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
    if (key && rest.length > 0 && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
};

if (!userId) {
  console.error('Usage: pnpm dlx ts-node --project apps/api-server/tsconfig.json scripts/backfill-contests.ts <userId>');
  process.exit(1);
}

loadEnvFile(path.resolve('dev-bootstrap.env'));
process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://chaincontest:chaincontest@localhost:55432/chaincontest';

const PAGE_SIZE = 50;

const fetchByRequestIds = async (requestIds: string[]): Promise<Array<{
  request: Record<string, any>;
  artifact: Record<string, any> | null;
}>> => {
  const aggregates: Array<{ request: Record<string, any>; artifact: Record<string, any> | null }> = [];
  for (const requestId of requestIds) {
    const record = (await database.getContestCreationRequest(requestId)) as {
      request: Record<string, any>;
      artifact: Record<string, any> | null;
    } | null;
    if (record) {
      aggregates.push(record);
    }
  }
  return aggregates;
};

const fetchAllRequests = async (): Promise<Array<{
  request: Record<string, any>;
  artifact: Record<string, any> | null;
}>> => {
  const aggregates: Array<{ request: Record<string, any>; artifact: Record<string, any> | null }> = [];
  let cursor: string | null = null;

  do {
    const response = (await database.listContestCreationRequests({
      userId,
      pagination: {
        pageSize: PAGE_SIZE,
        cursor
      }
    })) as {
      items: Array<{ request: Record<string, any>; artifact: Record<string, any> | null }>;
      nextCursor: string | null;
    };

    aggregates.push(...response.items);
    cursor = response.nextCursor;
  } while (cursor);

  return aggregates;
};

void (async () => {
  const summary: Array<{ requestId: string; contestId: string | null; status: 'applied' | 'noop' }> = [];
  try {
    await initDatabase();
    const aggregates = requestFilter ? await fetchByRequestIds(requestFilter) : await fetchAllRequests();

    for (const aggregate of aggregates) {
      const artifact = aggregate.artifact;
      if (!artifact || !artifact.contestAddress) {
        continue;
      }

      const payload = deserializeStoredPayload(aggregate.request.payload as Record<string, unknown>);
      const registrationOpensAt = toIsoOrNow(artifact.confirmedAt?.toISOString());

      const { metadata, timeWindow } = buildFallbackContestMetadata({
        payload,
        artifact,
        networkId: aggregate.request.networkId,
        registrationOpensAt
      });

      const result = (await database.writeContestDomain({
        action: 'track',
        payload: {
          chainId: aggregate.request.networkId,
          contractAddress: artifact.contestAddress,
          internalKey: payload.contestId,
          status: 'registered',
          timeWindow: {
            start: timeWindow.start,
            end: timeWindow.end
          },
          metadata
        }
      })) as { status: 'applied' | 'noop'; contestId?: string };

      const contestId = result.contestId ?? null;

      if (contestId) {
        await database.recordContestDeploymentArtifact({
          requestId: aggregate.request.requestId,
          contestId,
          networkId: aggregate.request.networkId,
          contestAddress: artifact.contestAddress,
          vaultFactoryAddress: artifact.vaultFactoryAddress,
          registrarAddress: artifact.registrarAddress ?? artifact.contestAddress,
          treasuryAddress: artifact.treasuryAddress,
          settlementAddress: artifact.settlementAddress,
          rewardsAddress: artifact.rewardsAddress,
          transactionHash: artifact.transactionHash,
          confirmedAt: artifact.confirmedAt,
          metadata: artifact.metadata
        });
      }

      summary.push({
        requestId: aggregate.request.requestId,
        contestId,
        status: result.status
      });
    }

    console.table(summary);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await shutdownDatabase();
  }
})();
