import type { Logger } from 'pino';
import type {
  MilestoneExecutionRecord,
  MilestoneExecutionStatus,
  MilestoneExecutionStatusTransitionRequest,
  UpsertMilestoneExecutionRequest
} from '@chaincontest/db';
import {
  buildMilestoneIdempotencyKey,
  shouldEscalateToNeedsAttention
} from './milestoneIdempotency.js';

export interface MilestonePayload {
  contestId: string;
  chainId: number;
  milestone: string;
  sourceTxHash: string;
  sourceLogIndex: number;
  sourceBlockNumber: string;
  payload: Record<string, unknown>;
}

export interface MilestoneProcessInput {
  envelope: TaskJobEnvelopeLike;
  payload: MilestonePayload;
}

export interface MilestoneProcessResult {
  status: 'processed' | 'skipped';
  reason?: string;
}

export interface TaskJobEnvelopeLike {
  jobId: string;
  queueName: string;
  attempt: number;
  retryLimit: number;
}

export interface MilestoneProcessorDependencies {
  logger: Logger;
  db: {
    upsert: (request: UpsertMilestoneExecutionRequest) => Promise<MilestoneExecutionRecord>;
    transition: (request: MilestoneExecutionStatusTransitionRequest) => Promise<MilestoneExecutionRecord>;
    getByIdempotencyKey: (idempotencyKey: string) => Promise<MilestoneExecutionRecord | null>;
  };
  executeMilestone?: (context: MilestoneProcessInput & { idempotencyKey: string }) => Promise<void>;
  maxAttempts?: number;
}

export class MilestoneAlreadyProcessedError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message, { cause: context });
    this.name = 'MilestoneAlreadyProcessedError';
  }
}

export const createMilestoneProcessor = (
  dependencies: MilestoneProcessorDependencies
): MilestoneProcessor => {
  const { logger, db, executeMilestone } = dependencies;
  const maxAttempts = dependencies.maxAttempts ?? 3;

  const process = async (input: MilestoneProcessInput): Promise<MilestoneProcessResult> => {
    const { envelope, payload } = input;
    const idempotencyKey = buildMilestoneIdempotencyKey(payload);

    const existing = await db.getByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === 'succeeded') {
      logger.debug({ jobId: envelope.jobId, idempotencyKey }, 'milestone already processed');
      throw new MilestoneAlreadyProcessedError('Milestone already processed', {
        jobId: envelope.jobId,
        idempotencyKey
      });
    }

    const initialStatus: MilestoneExecutionStatus = envelope.attempt > 0 ? 'retrying' : 'in_progress';

    await db.upsert({
      idempotencyKey,
      jobId: envelope.jobId,
      contestId: payload.contestId,
      chainId: payload.chainId,
      milestone: payload.milestone,
      sourceTxHash: payload.sourceTxHash,
      sourceLogIndex: payload.sourceLogIndex,
      sourceBlockNumber: payload.sourceBlockNumber,
      payload: payload.payload,
      attempt: envelope.attempt,
      status: initialStatus
    });

    try {
      if (executeMilestone) {
        await executeMilestone({ ...input, idempotencyKey });
      }

      await db.transition({
        idempotencyKey,
        toStatus: 'succeeded',
        attempts: envelope.attempt,
        completedAt: new Date()
      });

      logger.info(
        { jobId: envelope.jobId, idempotencyKey },
        'milestone job processed successfully'
      );

      return { status: 'processed' };
    } catch (error) {
      const nextAttempts = envelope.attempt + 1;
      const escalate = shouldEscalateToNeedsAttention(nextAttempts, { maxAttempts });
      const toStatus: MilestoneExecutionStatus = escalate ? 'needs_attention' : 'retrying';

      await db.transition({
        idempotencyKey,
        toStatus: toStatus,
        attempts: nextAttempts,
        lastError: serialiseError(error),
        completedAt: escalate ? new Date() : undefined
      });

      logger.error(
        { jobId: envelope.jobId, idempotencyKey, error: serialiseError(error) },
        'milestone job processing failed'
      );

      throw error;
    }
  };

  return { process } satisfies MilestoneProcessor;
};

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

export interface MilestoneProcessor {
  process: (input: MilestoneProcessInput) => Promise<MilestoneProcessResult>;
}
