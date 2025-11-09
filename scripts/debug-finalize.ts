import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, shutdownDatabase } from '@/lib/db/client';
import { finalizeContestDeployment } from '@/lib/contests/deploymentService';

const [requestId, txHash, userId, organizer] = process.argv.slice(2);

if (!requestId || !txHash || !userId || !organizer) {
  console.error('Usage: ts-node scripts/debug-finalize.ts <requestId> <txHash> <userId> <organizerAddress>');
  process.exit(1);
}

const envFile = path.resolve('dev-bootstrap.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0 && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://chaincontest:chaincontest@localhost:55432/chaincontest';

(async () => {
  try {
    await initDatabase();
    const result = await finalizeContestDeployment({
      requestId,
      transactionHash: txHash as `0x${string}`,
      userId,
      organizerAddress: organizer
    });
    console.log(JSON.stringify({ status: result.request.status, requestId: result.request.request.requestId }, null, 2));
  } catch (error) {
    console.error('Finalize failed:', error);
  } finally {
    await shutdownDatabase();
  }
})();
