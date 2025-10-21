import type { Logger } from 'pino';
import type { QueueClient } from './queueClient.js';
import type { ReconciliationReport } from './reconciliationReport.js';

export interface ReplayJobRequest {
  contestId: string;
  chainId: number;
  fromBlock: bigint;
  toBlock: bigint;
  reason: string;
  actor?: string;
}

export interface MilestoneJobPayload {
  contestId: string;
  chainId: number;
  milestone: string;
  sourceEvent: {
    txHash: string;
    blockNumber: string;
    logIndex: number;
  };
  generatedAt: string;
}

export class JobDispatcherError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'JobDispatcherError';
  }
}

export class JobDispatcher {
  constructor(private readonly queue: QueueClient, private readonly logger: Logger) {}

  public async dispatchReplay(request: ReplayJobRequest): Promise<string | null> {
    try {
      const jobId = await this.queue.send('indexer.replay', {
        contestId: request.contestId,
        chainId: request.chainId,
        fromBlock: request.fromBlock.toString(),
        toBlock: request.toBlock.toString(),
        reason: request.reason,
        requestedBy: request.actor ?? null,
      });
      this.logger.info({ jobId, contestId: request.contestId, chainId: request.chainId }, 'dispatched replay job');
      return jobId;
    } catch (error) {
      this.logger.error({ err: normaliseError(error), contestId: request.contestId, chainId: request.chainId }, 'failed to dispatch replay job');
      throw new JobDispatcherError('failed to dispatch replay job', error);
    }
  }

  public async dispatchReconcile(report: ReconciliationReport): Promise<string | null> {
    try {
      const jobId = await this.queue.send('indexer.reconcile', report);
      this.logger.info({ jobId, reportId: report.reportId }, 'dispatched reconcile job');
      return jobId;
    } catch (error) {
      this.logger.error({ err: normaliseError(error), reportId: report.reportId }, 'failed to dispatch reconcile job');
      throw new JobDispatcherError('failed to dispatch reconcile job', error);
    }
  }

  public async dispatchMilestone(payload: MilestoneJobPayload): Promise<string | null> {
    try {
      const jobId = await this.queue.send('indexer.milestone', payload);
      this.logger.info({ jobId, contestId: payload.contestId, chainId: payload.chainId, milestone: payload.milestone }, 'dispatched milestone job');
      return jobId;
    } catch (error) {
      this.logger.error({ err: normaliseError(error), contestId: payload.contestId, chainId: payload.chainId }, 'failed to dispatch milestone job');
      throw new JobDispatcherError('failed to dispatch milestone job', error);
    }
  }
}

const normaliseError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
};
