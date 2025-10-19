import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  init,
  writeContestDomain,
  queryContests,
  shutdown,
  type WriteContestDomainResponse
} from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture } from '../fixtures/database.js';
import { buildTestValidators } from '../helpers/validators.js';
import {
  contests,
  leaderboardVersions,
  participants,
  rewardClaims
} from '../../src/schema/index.js';

let fixture: TestDatabaseFixture;

describe('writeContestDomain', () => {
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

  it('tracks a new contest and treats duplicate track as noop', async () => {
    const response = await writeContestDomain({
      action: 'track',
      payload: {
        chainId: 1,
        contractAddress: '0xabc0000000000000000000000000000000000004',
        internalKey: 'contest-track-1',
        timeWindow: {
          start: '2025-08-01T00:00:00Z',
          end: '2025-09-01T00:00:00Z'
        },
        metadata: { name: 'Sprint' }
      }
    });

    expect(response.status).toBe('applied');
    expect(response.contestId).toBeDefined();

    const repeat = await writeContestDomain({
      action: 'track',
      payload: {
        chainId: 1,
        contractAddress: '0xabc0000000000000000000000000000000000004',
        internalKey: 'contest-track-1',
        timeWindow: {
          start: '2025-08-01T00:00:00Z',
          end: '2025-09-01T00:00:00Z'
        },
        metadata: { name: 'Sprint' }
      }
    });

    expect(repeat.status).toBe('noop');

    const stored = await fixture.db.query.contests.findFirst({
      where: (table, { eq }) => eq(table.internalKey, 'contest-track-1')
    });
    expect(stored?.metadata).toMatchObject({ name: 'Sprint' });
  });

  it('registers participation idempotently', async () => {
    const contestId = await ensureContest('contest-participation');

    const first = await writeContestDomain({
      action: 'register_participation',
      payload: {
        contestId,
        walletAddress: '0xabc0000000000000000000000000000000000005',
        amountWei: '1000',
        occurredAt: '2025-09-12T00:00:00Z',
        event: {
          chainId: 1,
          txHash: '0x' + '1'.repeat(64),
          logIndex: 0
        }
      }
    });

    expect(first.status).toBe('applied');

    const duplicate = await writeContestDomain({
      action: 'register_participation',
      payload: {
        contestId,
        walletAddress: '0xabc0000000000000000000000000000000000005',
        amountWei: '1000',
        occurredAt: '2025-09-12T00:00:00Z',
        event: {
          chainId: 1,
          txHash: '0x' + '1'.repeat(64),
          logIndex: 0
        }
      }
    });

    expect(duplicate.status).toBe('noop');

    const rows = await fixture.db
      .select({ count: participants.id })
      .from(participants)
      .where(eq(participants.contestId, contestId));
    expect(rows).toHaveLength(1);
  });

  it('enforces leaderboard version monotonicity', async () => {
    const contestId = await ensureContest('contest-leaderboard');

    await writeContestDomain({
      action: 'write_leaders_version',
      payload: {
        contestId,
        version: 1,
        writtenAt: '2025-09-20T00:00:00Z',
        entries: [
          { rank: 1, walletAddress: '0xabc0000000000000000000000000000000000006', score: '120' }
        ]
      }
    });

    await expect(
      writeContestDomain({
        action: 'write_leaders_version',
        payload: {
          contestId,
          version: 1,
          writtenAt: '2025-09-20T00:00:10Z',
          entries: [
            { rank: 1, walletAddress: '0xabc0000000000000000000000000000000000006', score: '120' }
          ]
        }
      })
    ).resolves.toMatchObject({ status: 'noop' });

    await expect(
      writeContestDomain({
        action: 'write_leaders_version',
        payload: {
          contestId,
          version: 1,
          writtenAt: '2025-09-20T00:00:15Z',
          entries: [
            { rank: 1, walletAddress: '0xabc0000000000000000000000000000000000006', score: '130' }
          ]
        }
      })
    ).resolves.toMatchObject({ status: 'noop' });

    await expect(
      writeContestDomain({
        action: 'write_leaders_version',
        payload: {
          contestId,
          version: 0,
          writtenAt: '2025-09-19T00:00:00Z',
          entries: [
            { rank: 1, walletAddress: '0xabc0000000000000000000000000000000000007', score: '50' }
          ]
        }
      })
    ).rejects.toMatchObject({ code: 'ORDER_VIOLATION' });
  });

  it('rejects sealing before contest window end', async () => {
    const contestId = await ensureContest('contest-seal');

    await expect(
      writeContestDomain({
        action: 'seal',
        payload: {
          contestId,
          sealedAt: '2025-08-15T00:00:00Z'
        }
      })
    ).rejects.toMatchObject({ code: 'ORDER_VIOLATION' });

    const applied = await writeContestDomain({
      action: 'seal',
      payload: {
        contestId,
        sealedAt: '2025-09-15T00:00:00Z',
        status: 'sealed'
      }
    });

    expect(applied.status).toBe('applied');
  });

  it('appends reward claims idempotently', async () => {
    const contestId = await ensureContest('contest-reward');

    const first = await writeContestDomain({
      action: 'append_reward_claim',
      payload: {
        contestId,
        walletAddress: '0xabc0000000000000000000000000000000000008',
        amountWei: '250',
        claimedAt: '2025-09-25T00:00:00Z',
        event: {
          chainId: 1,
          txHash: '0x' + 'a'.repeat(64),
          logIndex: 10
        }
      }
    });

    expect(first.status).toBe('applied');

    const duplicate = await writeContestDomain({
      action: 'append_reward_claim',
      payload: {
        contestId,
        walletAddress: '0xabc0000000000000000000000000000000000008',
        amountWei: '250',
        claimedAt: '2025-09-25T00:00:00Z',
        event: {
          chainId: 1,
          txHash: '0x' + 'a'.repeat(64),
          logIndex: 10
        }
      }
    });

    expect(duplicate.status).toBe('noop');

    const records = await fixture.db
      .select({ count: rewardClaims.id })
      .from(rewardClaims)
      .where(eq(rewardClaims.contestId, contestId));
    expect(records).toHaveLength(1);
  });
});

const ensureContest = async (internalKey: string): Promise<string> => {
  const existing = await fixture.db.query.contests.findFirst({
    where: eq(contests.internalKey, internalKey)
  });

  if (existing) {
    return existing.id;
  }

  const response = (await writeContestDomain({
    action: 'track',
    payload: {
      chainId: 1,
      contractAddress: `0x${randomUUID().replace(/-/g, '').slice(0, 40).padEnd(40, '0')}`,
      internalKey,
      timeWindow: {
        start: '2025-08-01T00:00:00Z',
        end: '2025-09-15T00:00:00Z'
      },
      metadata: { label: internalKey }
    }
  })) as WriteContestDomainResponse;

  return response.contestId!;
};
