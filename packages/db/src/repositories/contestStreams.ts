import { sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import { contests } from '../schema/index.js';
import type { DbSchema } from '../schema/index.js';

export interface ContestStreamRecord {
  readonly contestId: string;
  readonly chainId: number;
  readonly contractAddress: string;
  readonly metadata: Record<string, unknown>;
}

export const listContestStreams = async (
  db: DrizzleDatabase<DbSchema>
): Promise<ContestStreamRecord[]> => {
  const rows = await db
    .select({
      contestId: contests.id,
      chainId: contests.chainId,
      contractAddress: contests.contractAddress,
      metadata: contests.metadata
    })
    .from(contests)
    .where(sql`${contests.metadata} ? 'chainGatewayDefinition'`);

  return rows.map((row) => ({
    contestId: row.contestId,
    chainId: row.chainId,
    contractAddress: row.contractAddress.toLowerCase(),
    metadata: (row.metadata ?? {}) as Record<string, unknown>
  }));
};
