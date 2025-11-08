import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeContestDomain = vi.fn();

vi.mock('@/lib/db/client', () => ({
  database: {
    writeContestDomain
  }
}));

vi.mock('@/lib/observability/logger', () => ({
  getRequestLogger: () => ({
    warn: vi.fn()
  })
}));

describe('contest phase synchronization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('promotes registered contest to active when registration window elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-08T05:30:00.000Z'));

    const { synchronizeContestPhase } = await import('@/lib/contests/phaseSync');

    const contest = {
      contestId: 'contest-1',
      chainId: 31337,
      contractAddress: '0x1',
      internalKey: null,
      status: 'registered',
      timeWindowStart: new Date('2025-11-07T18:20:00.000Z'),
      timeWindowEnd: new Date('2025-11-08T06:00:00.000Z'),
      originTag: 'factory',
      sealedAt: null,
      metadata: {
        timeline: {
          registrationClosesAt: '2025-11-08T04:00:00.000Z'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    writeContestDomain.mockResolvedValue({ status: 'applied', contestId: contest.contestId });

    const changed = await synchronizeContestPhase(contest);

    expect(changed).toBe(true);
    expect(contest.status).toBe('active');
    expect(writeContestDomain).toHaveBeenCalledWith({
      action: 'update_phase',
      payload: {
        contestId: 'contest-1',
        phase: 'active',
        status: 'active'
      },
      actorContext: {
        source: 'api.contest.phaseSync',
        reason: 'timeline_auto_transition'
      }
    });
  });

  it('does not update contest when within registration window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-08T02:00:00.000Z'));

    const { synchronizeContestPhase } = await import('@/lib/contests/phaseSync');

    const contest = {
      contestId: 'contest-2',
      chainId: 31337,
      contractAddress: '0x2',
      internalKey: null,
      status: 'registered',
      timeWindowStart: new Date('2025-11-07T18:20:00.000Z'),
      timeWindowEnd: new Date('2025-11-08T06:00:00.000Z'),
      originTag: 'factory',
      sealedAt: null,
      metadata: {
        timeline: {
          registrationClosesAt: '2025-11-08T04:00:00.000Z'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const changed = await synchronizeContestPhase(contest);

    expect(changed).toBe(false);
    expect(writeContestDomain).not.toHaveBeenCalled();
    expect(contest.status).toBe('registered');
  });
});
