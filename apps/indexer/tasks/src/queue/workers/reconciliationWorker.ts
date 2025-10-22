import process from 'node:process';
import type { Job } from 'pg-boss';
import { getLogger } from '../../telemetry/logger.js';
import { recordJobResult, recordJobRetry } from '../../telemetry/metrics.js';
import type { TasksApplication } from '../../bootstrap/app.js';
import { createTaskJobEnvelope } from '../models/taskJobEnvelope.js';
import {
  type ReconciliationProcessor,
  ReportAlreadyProcessedError
} from '../../services/reconciliationProcessor.js';
import type { ParsedReconciliationPayload } from '../parsers/reconciliationPayload.js';

const QUEUE_NAME = 'indexer.reconcile';

export interface ReconciliationWorkerDependencies {
  processor: ReconciliationProcessor;
  parsePayload: (raw: unknown) => ParsedReconciliationPayload;
}

export const registerReconciliationWorker = async (
  app: TasksApplication,
  dependencies: ReconciliationWorkerDependencies
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
        const { payload, idempotencyKey } = dependencies.parsePayload(job.data);
        const result = await dependencies.processor.process({ envelope, payload, idempotencyKey });

        const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
        recordJobResult(app.metrics, QUEUE_NAME, 'success', durationSeconds);

        jobLogger.info(
          {
            outcome: 'processed',
            notificationsDispatched: result.notificationsDispatched,
            contestId: payload.contestId,
            chainId: payload.chainId
          },
          'reconciliation report handled'
        );
      } catch (error) {
        if (error instanceof ReportAlreadyProcessedError) {
          const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
          recordJobResult(app.metrics, QUEUE_NAME, 'skipped', durationSeconds);
          jobLogger.warn({ err: error.context }, 'duplicate reconciliation report skipped');
          return;
        }

        const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
        recordJobRetry(app.metrics, QUEUE_NAME, 'processor_error');
        recordJobResult(app.metrics, QUEUE_NAME, 'failure', durationSeconds);
        jobLogger.error({ err: serialiseError(error) }, 'reconciliation report failed');
        throw error;
      }
    },
    {
      includeMetadata: true,
      concurrency: app.config.queue.concurrency,
      keyResolver: (job: Job<unknown>) => {
        try {
          const { payload } = dependencies.parsePayload(job.data);
          return `${payload.contestId}:${payload.chainId}`;
        } catch {
          return null;
        }
      }
    }
  );

  baseLogger.info({ queue: QUEUE_NAME }, 'registered reconciliation worker');
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
