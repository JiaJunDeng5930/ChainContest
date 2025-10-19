import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  init,
  queryContests,
  queryUserContests,
  shutdown,
  type ContestAggregate,
  type QueryContestsResponse,
  type QueryUserContestsResponse
} from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture } from '../fixtures/database.js';
import { buildTestValidators } from '../helpers/validators.js';
import {
  contests,
  contestOriginEnum,
  contestStatusEnum,
  leaderboardVersions,
  participants,
  rewardClaims
} from '../../src/schema/index.js';
import { userIdentities, walletBindings, walletSourceEnum } from '../../src/schema/user-bindings.js';

let fixture: TestDatabaseFixture;

describe('contest queries', () => {
  beforeAll(async () => {
    fixture = await createDatabaseFixture();
    await init({
      databaseUrl: fixture.connectionString,
      validators: buildTestValidators()
    });
  });

  afterAll(async () => {
    await shutdown();
    if (fixture) {
      await fixture.cleanup();
    }
  });

  it('returns aggregated contest data with requested includes', async () => {
    const contestId = await seedContest({
      chainId: 1,
      contractAddress: '0xabc0000000000000000000000000000000000001',
      metadata: {
        keywords: 'defi,racing',
        creatorWallet: '0xc000000000000000000000000000000000000001',
        contestsHosted: 3
      }
    });

    await seedLeaderboardVersion(contestId, 1n, [
      { rank: 1, walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', score: '100' }
    ]);

    await seedParticipant(contestId, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '250000000000000000', new Date('2025-09-01T00:00:00Z'));
    await seedParticipant(contestId, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '100000000000000000', new Date('2025-09-02T00:00:00Z'));

    await seedRewardClaim(contestId, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '500000000000000000', new Date('2025-09-05T00:00:00Z'));

    const response: QueryContestsResponse = await queryContests({
      selector: {
        items: [{ chainId: 1, contractAddress: '0xabc0000000000000000000000000000000000001' }]
      },
      includes: {
        participants: true,
        leaderboard: { mode: 'latest' },
        rewards: true,
        creatorSummary: true
      }
    });

    expect(response.items).toHaveLength(1);
    const aggregate = response.items[0] as ContestAggregate;
    expect(aggregate.contest.chainId).toBe(1);
    expect(aggregate.participants).toHaveLength(2);
    expect(aggregate.rewards).toHaveLength(1);
    expect(aggregate.leaderboard?.version).toBe('1');
    expect(aggregate.leaderboard?.entries[0]?.walletAddress).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(aggregate.creatorSummary?.totalRewards).toBe('500000000000000000');
  });

  it('throws resource unsupported when filtering by unsupported chain', async () => {
    await expect(
      queryContests({
        selector: {
          filter: {
            chainIds: [999999]
          }
        }
      })
    ).rejects.toMatchObject({ code: 'RESOURCE_UNSUPPORTED' });
  });

  it('aggregates contests for a specific user across wallets', async () => {
    const { identityId, walletAddress } = await seedUser('user-123', '0xcccccccccccccccccccccccccccccccccccccccc');

    const contestA = await seedContest({
      chainId: 1,
      contractAddress: '0xabc0000000000000000000000000000000000002',
      status: 'active'
    });
    const contestB = await seedContest({
      chainId: 5,
      contractAddress: '0xabc0000000000000000000000000000000000003',
      status: 'sealed'
    });

    await seedParticipant(contestA, walletAddress, '100', new Date('2025-09-10T10:00:00Z'));
    await seedRewardClaim(contestA, walletAddress, '40', new Date('2025-09-11T11:00:00Z'));

    await seedParticipant(contestB, walletAddress, '200', new Date('2025-09-12T12:00:00Z'));

    const response: QueryUserContestsResponse = await queryUserContests({
      userId: 'user-123',
      filters: {
        statuses: ['active', 'sealed']
      }
    });

    expect(response.items).toHaveLength(2);
    const contestIds = response.items.map((item) => item.contest.contestId);
    expect(contestIds).toContain(contestA);
    expect(contestIds).toContain(contestB);
    const aggregateForA = response.items.find((item) => item.contest.contestId === contestA);
    expect(aggregateForA?.participations).toHaveLength(1);
    expect(aggregateForA?.rewardClaims).toHaveLength(1);
    expect(aggregateForA?.lastActivity?.toISOString()).toBe('2025-09-11T11:00:00.000Z');
  });
});

const seedContest = async (
  overrides: Partial<{
    chainId: number;
    contractAddress: string;
    internalKey: string | null;
    status: string;
    originTag: string;
    metadata: Record<string, unknown>;
  }> = {}
): Promise<string> => {
  const id = randomUUID();
  await fixture.db.insert(contests).values({
    id,
    chainId: overrides.chainId ?? 1,
    contractAddress: (overrides.contractAddress ?? '0xabc0000000000000000000000000000000000000').toLowerCase(),
    internalKey: overrides.internalKey ?? null,
    status: overrides.status ?? contestStatusEnum.enumValues[0]!,
    timeWindowStart: new Date('2025-09-01T00:00:00Z'),
    timeWindowEnd: new Date('2025-10-01T00:00:00Z'),
    originTag: overrides.originTag ?? contestOriginEnum.enumValues[0]!,
    metadata: overrides.metadata ?? {},
    createdAt: new Date('2025-08-01T00:00:00Z'),
    updatedAt: new Date('2025-08-01T00:00:00Z')
  });

  return id;
};

const seedParticipant = async (
  contestId: string,
  walletAddress: string,
  amount: string,
  occurredAt: Date
): Promise<void> => {
  await fixture.db.insert(participants).values({
    id: randomUUID(),
    contestId,
    walletAddress: walletAddress.toLowerCase(),
    amountWei: amount,
    eventLocator: {
      tx_hash: randomUUID().replace(/-/g, ''),
      log_index: Math.floor(Math.random() * 100)
    },
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt
  });
};

const seedRewardClaim = async (
  contestId: string,
  walletAddress: string,
  amount: string,
  claimedAt: Date
): Promise<void> => {
  await fixture.db.insert(rewardClaims).values({
    id: randomUUID(),
    contestId,
    walletAddress: walletAddress.toLowerCase(),
    amountWei: amount,
    eventLocator: {
      tx_hash: randomUUID().replace(/-/g, ''),
      log_index: Math.floor(Math.random() * 100)
    },
    claimedAt,
    createdAt: claimedAt,
    updatedAt: claimedAt
  });
};

const seedLeaderboardVersion = async (
  contestId: string,
  version: bigint,
  entries: Array<{ rank: number; walletAddress: string; score?: string }>
): Promise<void> => {
  await fixture.db.insert(leaderboardVersions).values({
    id: randomUUID(),
    contestId,
    version,
    entries,
    writtenAt: new Date('2025-09-03T00:00:00Z'),
    createdAt: new Date('2025-09-03T00:00:00Z'),
    updatedAt: new Date('2025-09-03T00:00:00Z')
  });
};

const seedUser = async (externalId: string, walletAddress: string): Promise<{ identityId: string; walletAddress: string }> => {
  const identityId = randomUUID();
  await fixture.db.insert(userIdentities).values({
    id: identityId,
    externalId,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await fixture.db.insert(walletBindings).values({
    id: randomUUID(),
    userId: identityId,
    walletAddress: walletAddress.toLowerCase(),
    walletAddressChecksum: walletAddress,
    source: walletSourceEnum.enumValues[0]!,
    boundAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return { identityId, walletAddress: walletAddress.toLowerCase() };
};
