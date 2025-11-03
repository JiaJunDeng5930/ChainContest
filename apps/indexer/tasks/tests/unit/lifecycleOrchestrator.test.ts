import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeploymentRuntime } from '@chaincontest/chain';
import { ContestLifecycleOrchestrator } from '../../src/services/lifecycleOrchestrator.js';

vi.mock('@chaincontest/chain', () => ({
  computeLeaderboardUpdates: vi.fn(),
  freezeContest: vi.fn(),
  readContestState: vi.fn(),
  readContestTimeline: vi.fn(),
  readContestTopK: vi.fn(),
  readVaultScore: vi.fn(),
  sealContest: vi.fn(),
  settleContestParticipant: vi.fn(),
  updateContestLeaders: vi.fn()
}));

const chainMocks = vi.mocked(await import('@chaincontest/chain'));

const buildRuntime = (): DeploymentRuntime => ({
  account: {
    address: '0x0000000000000000000000000000000000000001',
    source: 'privateKey',
    type: 'local'
  },
  resolveRpcUrls: () => ['http://127.0.0.1:8545'],
  createTransport: () => ({}),
  createWalletClient: () => ({
    account: {
      address: '0x0000000000000000000000000000000000000001'
    }
  })
});

const contestStream = {
  contestId: 'contest-1',
  chainId: 31337,
  contractAddress: '0x000000000000000000000000000000000000000a',
  registrarAddress: '0x000000000000000000000000000000000000000a',
  treasuryAddress: null,
  settlementAddress: null,
  rewardsAddress: null,
  startBlock: 0n,
  metadata: {
    chainGatewayDefinition: {
      participants: {
        '0x000000000000000000000000000000000000000b': {
          address: '0x000000000000000000000000000000000000000b',
          vaultId: '0x00000000000000000000000000000000000000000000000000000000000000ab'
        }
      }
    }
  }
};

const waitForTick = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

describe('ContestLifecycleOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('freezes contest when live window elapsed', async () => {
    chainMocks.readContestState
      .mockResolvedValueOnce({
        state: 'live',
        participantCount: 0,
        settledCount: 0,
        leaderboardVersion: 0
      })
      .mockResolvedValue({
        state: 'frozen',
        participantCount: 0,
        settledCount: 0,
        leaderboardVersion: 0
      });
    chainMocks.readContestTimeline.mockResolvedValue({
      registeringEnds: new Date(Date.now() - 60_000),
      liveEnds: new Date(Date.now() - 30_000),
      claimEnds: new Date(Date.now() + 30_000)
    });
    const orchestrator = new ContestLifecycleOrchestrator({
      logger: pino({ level: 'silent' }),
      runtime: buildRuntime(),
      db: {
        listTrackedContests: async () => [contestStream]
      },
      pollIntervalMs: 10
    });

    orchestrator.start();
    await waitForTick();
    orchestrator.stop();

    expect(chainMocks.freezeContest).toHaveBeenCalledTimes(1);
  });

  it('settles participants when contest frozen', async () => {
    chainMocks.readContestState.mockResolvedValue({
      state: 'frozen',
      participantCount: 1,
      settledCount: 0,
      leaderboardVersion: 0
    });
    chainMocks.readContestTimeline.mockResolvedValue({
      registeringEnds: new Date(),
      liveEnds: new Date(),
      claimEnds: new Date()
    });
    chainMocks.readVaultScore.mockResolvedValue({
      settled: false,
      nav: 0n,
      roiBps: 0
    });

    const orchestrator = new ContestLifecycleOrchestrator({
      logger: pino({ level: 'silent' }),
      runtime: buildRuntime(),
      db: {
        listTrackedContests: async () => [contestStream]
      },
      pollIntervalMs: 10
    });

    orchestrator.start();
    await waitForTick();
    orchestrator.stop();

    expect(chainMocks.settleContestParticipant).toHaveBeenCalledTimes(1);
  });

  it('updates leaderboard after settlement', async () => {
    chainMocks.readContestState
      .mockResolvedValueOnce({
        state: 'frozen',
        participantCount: 1,
        settledCount: 1,
        leaderboardVersion: 0
      })
      .mockResolvedValue({
        state: 'frozen',
        participantCount: 1,
        settledCount: 1,
        leaderboardVersion: 1
      });
    chainMocks.readContestTimeline.mockResolvedValue({
      registeringEnds: new Date(),
      liveEnds: new Date(),
      claimEnds: new Date()
    });
    chainMocks.readVaultScore.mockResolvedValue({
      settled: true,
      nav: 1_000n,
      roiBps: 120
    });
    chainMocks.readContestTopK.mockResolvedValue(4);
    chainMocks.computeLeaderboardUpdates.mockResolvedValue([
      {
        vaultId: '0x00000000000000000000000000000000000000000000000000000000000000ab',
        nav: 1_000n,
        roiBps: 120
      }
    ]);

    const orchestrator = new ContestLifecycleOrchestrator({
      logger: pino({ level: 'silent' }),
      runtime: buildRuntime(),
      db: {
        listTrackedContests: async () => [contestStream]
      },
      pollIntervalMs: 10
    });

    orchestrator.start();
    await waitForTick();
    orchestrator.stop();

    expect(chainMocks.updateContestLeaders).toHaveBeenCalledTimes(1);
  });

  it('seals contest when leaderboard ready', async () => {
    chainMocks.readContestState.mockResolvedValue({
      state: 'frozen',
      participantCount: 1,
      settledCount: 1,
      leaderboardVersion: 2
    });
    chainMocks.readContestTimeline.mockResolvedValue({
      registeringEnds: new Date(),
      liveEnds: new Date(),
      claimEnds: new Date()
    });
    chainMocks.readVaultScore.mockResolvedValue({
      settled: true,
      nav: 1_000n,
      roiBps: 120
    });

    const orchestrator = new ContestLifecycleOrchestrator({
      logger: pino({ level: 'silent' }),
      runtime: buildRuntime(),
      db: {
        listTrackedContests: async () => [contestStream]
      },
      pollIntervalMs: 10
    });

    orchestrator.start();
    await waitForTick();
    orchestrator.stop();

    expect(chainMocks.sealContest).toHaveBeenCalledTimes(1);
  });
});
