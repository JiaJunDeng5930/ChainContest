import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeContestDomain = vi.fn();

vi.mock('@/lib/db/client', () => ({
  database: {
    writeContestDomain
  }
}));

const logger = {
  warn: vi.fn(),
  info: vi.fn()
};

vi.mock('@/lib/observability/logger', () => ({
  getRequestLogger: () => logger
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
        phase: 'live',
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

  it('promotes active contest to sealed when trading window elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-09T13:00:00.000Z'));

    const { synchronizeContestPhase } = await import('@/lib/contests/phaseSync');

    const contest = {
      contestId: 'contest-3',
      chainId: 31337,
      contractAddress: '0x3',
      internalKey: null,
      status: 'active',
      timeWindowStart: new Date('2025-11-07T18:20:00.000Z'),
      timeWindowEnd: new Date('2025-11-10T06:00:00.000Z'),
      originTag: 'factory',
      sealedAt: null,
      metadata: {
        chainGatewayDefinition: {
          timeline: {
            tradingClosesAt: '2025-11-09T12:00:00.000Z'
          }
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    writeContestDomain.mockResolvedValue({ status: 'applied', contestId: contest.contestId });

    const changed = await synchronizeContestPhase(contest);

    expect(changed).toBe(true);
    expect(contest.status).toBe('sealed');
    expect(writeContestDomain).toHaveBeenCalledWith({
      action: 'update_phase',
      payload: {
        contestId: 'contest-3',
        phase: 'sealed',
        status: 'sealed'
      },
      actorContext: {
        source: 'api.contest.phaseSync',
        reason: 'timeline_auto_transition'
      }
    });
  });

  it('promotes sealed contest to settled when redemption window elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-12T10:00:00.000Z'));

    const { synchronizeContestPhase } = await import('@/lib/contests/phaseSync');

    const contest = {
      contestId: 'contest-4',
      chainId: 31337,
      contractAddress: '0x4',
      internalKey: null,
      status: 'sealed',
      timeWindowStart: new Date('2025-11-07T18:20:00.000Z'),
      timeWindowEnd: new Date('2025-11-10T06:00:00.000Z'),
      originTag: 'factory',
      sealedAt: new Date('2025-11-10T07:00:00.000Z'),
      metadata: {
        chainGatewayDefinition: {
          timeline: {
            redemptionAvailableAt: '2025-11-11T08:00:00.000Z'
          }
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    writeContestDomain.mockResolvedValue({ status: 'applied', contestId: contest.contestId });

    const changed = await synchronizeContestPhase(contest);

    expect(changed).toBe(true);
    expect(contest.status).toBe('settled');
    expect(writeContestDomain).toHaveBeenCalledWith({
      action: 'update_phase',
      payload: {
        contestId: 'contest-4',
        phase: 'settled',
        status: 'settled'
      },
      actorContext: {
        source: 'api.contest.phaseSync',
        reason: 'timeline_auto_transition'
      }
    });
  });
});
