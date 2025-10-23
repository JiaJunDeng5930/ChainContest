import type { Logger } from 'pino';
import type {
  MilestoneExecutionRecord,
  MilestoneExecutionStatusTransitionRequest,
  MilestoneExecutionLookupRequest
} from '@chaincontest/db';
import type { PublishJobOptions } from '../bootstrap/queue.js';

export type MilestoneMode = 'live' | 'paused';

export interface RetryMilestoneRequest {
  contestId: string;
  chainId: number;
  milestone: string;
  sourceTxHash: string;
  sourceLogIndex: number;
  actor: string;
  reason?: string;
}

export interface MilestoneModeRequest {
  contestId: string;
  chainId: number;
  mode: MilestoneMode;
  actor: string;
  reason?: string;
}

export interface MilestoneManualDependencies {
  logger: Logger;
  publish: (queue: string, payload: unknown, options?: PublishJobOptions) => Promise<string | null>;
  fetchExecution: (request: MilestoneExecutionLookupRequest) => Promise<MilestoneExecutionRecord | null>;
  transitionExecution: (request: MilestoneExecutionStatusTransitionRequest) => Promise<MilestoneExecutionRecord>;
}

export class ManualActionError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_STATE') {
    super(message);
    this.name = 'ManualActionError';
  }
}

const ALLOWED_RETRY_STATUSES = new Set(['needs_attention', 'retrying']);
const pausedContests = new Map<string, { actor: string; reason?: string; updatedAt: Date }>();

export const createMilestoneManualActions = (
  dependencies: MilestoneManualDependencies
) => ({
  retryMilestone: async (request: RetryMilestoneRequest): Promise<{ queued: boolean }> => {
    const record = await dependencies.fetchExecution({
      contestId: request.contestId,
      chainId: request.chainId,
      milestone: request.milestone,
      sourceTxHash: request.sourceTxHash,
      sourceLogIndex: request.sourceLogIndex
    });

    if (!record) {
      throw new ManualActionError('Milestone execution record not found', 'NOT_FOUND');
    }

    if (!ALLOWED_RETRY_STATUSES.has(record.status)) {
      throw new ManualActionError(
        `Milestone execution is not eligible for retry (status=${record.status})`,
        'CONFLICT'
      );
    }

    const payload = buildMilestonePayload(record);
    const jobId = await dependencies.publish('indexer.milestone', payload, {
      dedupeKey: record.idempotencyKey
    });

    if (!jobId) {
      throw new ManualActionError('Milestone retry already queued', 'CONFLICT');
    }

    await dependencies.transitionExecution({
      idempotencyKey: record.idempotencyKey,
      toStatus: 'retrying',
      attempts: record.attempts + 1,
      actorContext: buildActorContext('manual_retry', request.actor, request.reason),
      lastError: null
    });

    dependencies.logger.info(
      {
        action: 'manual_retry',
        contestId: record.contestId,
        chainId: record.chainId,
        milestone: record.milestone,
        actor: request.actor
      },
      'manual milestone retry enqueued'
    );

    return { queued: true };
  },

  setContestMode: (request: MilestoneModeRequest): { mode: MilestoneMode } => {
    const key = buildContestKey(request.contestId, request.chainId);
    if (request.mode === 'paused') {
      pausedContests.set(key, {
        actor: request.actor,
        reason: request.reason,
        updatedAt: new Date()
      });
    } else {
      pausedContests.delete(key);
    }

    dependencies.logger.info(
      {
        action: 'milestone_mode',
        contestId: request.contestId,
        chainId: request.chainId,
        mode: request.mode,
        actor: request.actor,
        reason: request.reason ?? null
      },
      'milestone contest mode updated'
    );

    return { mode: request.mode };
  }
});

export const isContestPaused = (contestId: string, chainId: number): boolean =>
  pausedContests.has(buildContestKey(contestId, chainId));

export const listPausedContests = (): Array<{
  contestId: string;
  chainId: number;
  actor: string;
  reason?: string;
  updatedAt: Date;
}> =>
  Array.from(pausedContests.entries()).reduce<Array<{
    contestId: string;
    chainId: number;
    actor: string;
    reason?: string;
    updatedAt: Date;
  }>>((acc, [key, value]) => {
    const [contestId, chainIdPart] = key.split(':');
    if (!contestId || !chainIdPart) {
      return acc;
    }

    const chainId = Number.parseInt(chainIdPart, 10);
    if (Number.isNaN(chainId)) {
      return acc;
    }

    acc.push({
      contestId,
      chainId,
      actor: value.actor,
      reason: value.reason,
      updatedAt: value.updatedAt
    });

    return acc;
  }, []);

const buildMilestonePayload = (record: MilestoneExecutionRecord): Record<string, unknown> => ({
  contestId: record.contestId,
  chainId: record.chainId,
  milestone: record.milestone,
  sourceTxHash: record.sourceTxHash,
  sourceLogIndex: record.sourceLogIndex,
  sourceBlockNumber: record.sourceBlockNumber,
  payload: (record.payload ?? {}) as Record<string, unknown>
});

const buildActorContext = (
  action: string,
  actor: string,
  reason?: string
): Record<string, unknown> => ({
  actor,
  reason: reason ?? null,
  action,
  timestamp: new Date().toISOString()
});

const buildContestKey = (contestId: string, chainId: number): string => `${contestId}:${chainId}`;
