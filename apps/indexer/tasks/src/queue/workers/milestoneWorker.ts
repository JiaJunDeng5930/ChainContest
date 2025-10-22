import process from 'node:process';
import type { Job } from 'pg-boss';
import { getLogger } from '../../telemetry/logger.js';
import type { TasksApplication } from '../../bootstrap/app.js';
import { createTaskJobEnvelope } from '../models/taskJobEnvelope.js';
import { recordJobResult, recordJobRetry } from '../../telemetry/metrics.js';
import type { MilestoneProcessor, MilestonePayload } from '../../services/milestoneProcessor.js';
import { MilestoneAlreadyProcessedError } from '../../services/milestoneProcessor.js';
import { buildMilestoneIdempotencyKey } from '../../services/milestoneIdempotency.js';
import { isContestPaused } from '../../services/milestoneControl.js';

const QUEUE_NAME = 'indexer.milestone';

export interface MilestoneWorkerDependencies {
  processor: MilestoneProcessor;
  parsePayload: (raw: unknown) => MilestonePayload;
}

export const registerMilestoneWorker = async (
  app: TasksApplication,
  dependencies: MilestoneWorkerDependencies
): Promise<void> => {
  const baseLogger = app.logger ?? getLogger();

  await app.registerWorker(
    QUEUE_NAME,
    async (job: Job<unknown>) => {
      const start = process.hrtime.bigint();
      const envelope = createTaskJobEnvelope(job);
      const jobLogger = baseLogger.child({
        jobId: envelope.jobId,
        queue: envelope.queueName,
        attempt: envelope.attempt
      });

      try {
        const payload = dependencies.parsePayload(job.data);
        const idempotencyKey = buildMilestoneIdempotencyKey(payload);

        if (isContestPaused(payload.contestId, payload.chainId)) {
          const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
          await app.publishJob(QUEUE_NAME, job.data, {
            dedupeKey: idempotencyKey,
            startAfter: new Date(Date.now() + 30_000)
          });
          recordJobResult(app.metrics, QUEUE_NAME, 'deferred', durationSeconds);
          jobLogger.info(
            {
              outcome: 'deferred',
              reason: 'contest_paused',
              contestId: payload.contestId,
              chainId: payload.chainId
            },
            'milestone job deferred because contest is paused'
          );
          return;
        }

        const result = await dependencies.processor.process({ envelope, payload });

        const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
        const outcome = result.status === 'processed' ? 'success' : 'skipped';
        recordJobResult(app.metrics, QUEUE_NAME, outcome, durationSeconds);

        jobLogger.info({ outcome }, 'milestone job handled');
      } catch (error) {
        if (error instanceof MilestoneAlreadyProcessedError) {
          const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
          recordJobResult(app.metrics, QUEUE_NAME, 'skipped', durationSeconds);
          jobLogger.warn({ err: error.context }, 'duplicate milestone job skipped');
          return;
        }

        const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
        recordJobRetry(app.metrics, QUEUE_NAME, 'processor_error');
        recordJobResult(app.metrics, QUEUE_NAME, 'failure', durationSeconds);
        jobLogger.error({ err: serialiseError(error) }, 'milestone job failed');
        throw error;
      }
    },
    {
      includeMetadata: true,
      concurrency: app.config.queue.concurrency
    }
  );

  baseLogger.info({ queue: QUEUE_NAME }, 'registered milestone worker');
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
