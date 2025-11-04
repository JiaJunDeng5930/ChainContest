import type { Logger } from 'pino';
import type { DeploymentRuntime } from '@chaincontest/chain';
import type { TrackedContestStream } from '@chaincontest/db';
import {
  computeLeaderboardUpdates,
  freezeContest,
  readContestState,
  readContestTimeline,
  readContestTopK,
  readVaultScore,
  syncContestState,
  sealContest,
  settleContestParticipant,
  updateContestLeaders
} from '@chaincontest/chain';
import type { Address, Hex } from 'viem';

interface LifecycleDatabase {
  listTrackedContests: () => Promise<TrackedContestStream[]>;
}

interface LifecycleOrchestratorOptions {
  logger: Logger;
  runtime: DeploymentRuntime;
  db: LifecycleDatabase;
  pollIntervalMs: number;
}

interface ParticipantEntry {
  walletAddress: Address;
  vaultId: Hex;
}

const isHex = (value: unknown, bytes = 32): value is Hex => {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  const expectedLength = 2 + bytes * 2;
  return /^0x[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === expectedLength;
};

const normaliseAddress = (value: unknown): Address | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? (trimmed.toLowerCase() as Address) : null;
};

const extractParticipants = (metadata: Record<string, unknown> | null | undefined): ParticipantEntry[] => {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const gateway = metadata.chainGatewayDefinition;
  if (!gateway || typeof gateway !== 'object') {
    return [];
  }

  const participants = (gateway as Record<string, unknown>).participants;
  if (!participants || typeof participants !== 'object') {
    return [];
  }

  const entries: ParticipantEntry[] = [];
  for (const value of Object.values(participants as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const participant = value as Record<string, unknown>;
    const wallet = normaliseAddress(participant.address ?? participant.walletAddress);
    const vaultId = participant.vaultId;

    if (wallet && isHex(vaultId)) {
      entries.push({
        walletAddress: wallet,
        vaultId
      });
    }
  }

  return entries;
};

export class ContestLifecycleOrchestrator {
  private readonly logger: Logger;
  private readonly runtime: DeploymentRuntime;
  private readonly db: LifecycleDatabase;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(options: LifecycleOrchestratorOptions) {
    this.logger = options.logger;
    this.runtime = options.runtime;
    this.db = options.db;
    this.intervalMs = Math.max(options.pollIntervalMs, 1_000);
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    const tick = async (): Promise<void> => {
      if (this.ticking) {
        return;
      }
      this.ticking = true;
      try {
        await this.handleTick();
      } finally {
        this.ticking = false;
      }
    };
    this.timer = setInterval(() => {
      void tick();
    }, this.intervalMs);
    void tick();
    this.logger.info({ intervalMs: this.intervalMs }, 'contest lifecycle orchestrator started');
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
    this.logger.info('contest lifecycle orchestrator stopped');
  }

  private async handleTick(): Promise<void> {
    let streams: TrackedContestStream[];
    try {
      streams = await this.db.listTrackedContests();
    } catch (error) {
      this.logger.error({ err: serialiseError(error) }, 'failed to list tracked contests');
      return;
    }

    for (const stream of streams) {
      try {
        await this.processContest(stream);
      } catch (error) {
        this.logger.error(
          {
            err: serialiseError(error),
            contestId: stream.contestId,
            chainId: stream.chainId
          },
          'contest lifecycle handling failed'
        );
      }
    }
  }

  private async processContest(stream: TrackedContestStream): Promise<void> {
    const contestAddress = normaliseAddress(stream.contractAddress);
    if (!contestAddress) {
      this.logger.warn(
        { contestId: stream.contestId, chainId: stream.chainId },
        'skipping lifecycle orchestration for contest without registrar address'
      );
      return;
    }

    const reference = {
      chainId: stream.chainId,
      contestAddress
    };

    let state: Awaited<ReturnType<typeof readContestState>>;
    let timeline: Awaited<ReturnType<typeof readContestTimeline>>;
    try {
      [state, timeline] = await Promise.all([
        readContestState(this.runtime, reference),
        readContestTimeline(this.runtime, reference)
      ]);
    } catch (error) {
      this.logger.warn(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
          err: serialiseError(error)
        },
        'contest lifecycle snapshot unavailable'
      );
      return;
    }

    const now = new Date();
    if (state.state === 'registering' && now >= timeline.registeringEnds) {
      await syncContestState(this.runtime, reference);
      this.logger.info(
        { contestId: stream.contestId, chainId: stream.chainId },
        'contest state synced to live phase automatically'
      );
      return;
    }

    if (state.state === 'live' && now >= timeline.liveEnds) {
      await freezeContest(this.runtime, reference);
      this.logger.info(
        { contestId: stream.contestId, chainId: stream.chainId },
        'contest frozen automatically'
      );
      return;
    }

    if (!['frozen', 'sealed'].includes(state.state)) {
      return;
    }

    const participants = extractParticipants(stream.metadata ?? null);
    if (!participants.length) {
      this.logger.debug(
        { contestId: stream.contestId, chainId: stream.chainId },
        'no participants registered for contest lifecycle processing'
      );
      return;
    }

    const unsettled = [];
    for (const participant of participants) {
      const score = await readVaultScore(this.runtime, reference, participant.vaultId);
      if (!score.settled) {
        unsettled.push(participant);
      }
    }

    for (const participant of unsettled) {
      await settleContestParticipant(this.runtime, {
        ...reference,
        participantAddress: participant.walletAddress
      });
      this.logger.info(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
          participant: participant.walletAddress
        },
        'participant settled automatically'
      );
    }

    if (unsettled.length > 0) {
      return;
    }

    if (state.state === 'frozen' && state.leaderboardVersion === 0) {
      const topK = Math.max(await readContestTopK(this.runtime, reference), 1);
      const updates = await computeLeaderboardUpdates({
        runtime: this.runtime,
        reference,
        vaultIds: participants.map((entry) => entry.vaultId),
        topK
      });

      if (updates.length > 0) {
        await updateContestLeaders(this.runtime, {
          ...reference,
          updates
        });
        this.logger.info(
          {
            contestId: stream.contestId,
            chainId: stream.chainId,
            leaderboardSize: updates.length
          },
          'contest leaderboard updated automatically'
        );
        return;
      }
    }

    if (state.state === 'frozen' && state.leaderboardVersion > 0 && state.participantCount === state.settledCount) {
      await sealContest(this.runtime, reference);
      this.logger.info(
        { contestId: stream.contestId, chainId: stream.chainId },
        'contest sealed automatically'
      );
    }
  }
}

const serialiseError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  if (typeof error === 'object' && error !== null) {
    return { ...error } as Record<string, unknown>;
  }

  return { message: String(error) };
};
