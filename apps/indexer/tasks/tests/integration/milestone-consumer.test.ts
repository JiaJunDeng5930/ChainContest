import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMilestoneWorker, type MilestoneWorkerDependencies } from '@indexer-tasks/queue/workers/milestoneWorker';
import type { TasksApplication } from '@indexer-tasks/bootstrap/app';
import type { MilestonePayload, MilestoneProcessor } from '@indexer-tasks/services/milestoneProcessor';
import { MilestoneAlreadyProcessedError } from '@indexer-tasks/services/milestoneProcessor';
import type { Job } from 'pg-boss';

const createJob = (overrides: Partial<Job<unknown>> = {}): Job<unknown> => ({
  id: overrides.id ?? 'job-1',
  name: overrides.name ?? 'indexer.milestone',
  data:
    overrides.data ?? {
      contestId: 'contest-a',
      chainId: 11155111,
      milestone: 'settled',
      sourceTxHash: '0x' + 'a'.repeat(64),
      sourceLogIndex: 3,
      sourceBlockNumber: '12345',
      payload: { foo: 'bar' }
    },
  priority: overrides.priority ?? 0,
  state: overrides.state ?? 'created',
  retrycount: overrides.retrycount ?? 0,
  retrylimit: overrides.retrylimit ?? 3,
  createdon: overrides.createdon ?? new Date('2025-10-22T00:00:00Z').toISOString(),
  nextiteration: overrides.nextiteration ?? null,
  singletonKey: overrides.singletonKey ?? 'singleton::contest-a',
  startedon: overrides.startedon,
  completedon: overrides.completedon,
  keepuntil: overrides.keepuntil
});

describe('milestone queue consumer', () => {
  let app: TasksApplication;
  let processor: MilestoneProcessor;
  let dependencies: MilestoneWorkerDependencies;
  let registeredHandler: ((job: Job<unknown>) => Promise<void>) | null;
  let parsedPayload: MilestonePayload;

  beforeEach(() => {
    registeredHandler = null;

    parsedPayload = {
      contestId: 'contest-a',
      chainId: 11155111,
      milestone: 'settled',
      sourceTxHash: '0x' + 'a'.repeat(64),
      sourceLogIndex: 3,
      sourceBlockNumber: '12345',
      payload: { foo: 'bar' }
    };

    processor = {
      process: vi.fn().mockResolvedValue({ status: 'processed' })
    } as unknown as MilestoneProcessor;

    dependencies = {
      processor,
      parsePayload: vi.fn(() => parsedPayload)
    } satisfies MilestoneWorkerDependencies;

    app = {
      config: {
        queue: { concurrency: 1 }
      } as unknown as TasksApplication['config'],
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis()
      } as unknown as TasksApplication['logger'],
      metrics: {
        jobCounter: { labels: vi.fn().mockReturnThis(), inc: vi.fn() },
        jobDuration: { labels: vi.fn().mockReturnThis(), observe: vi.fn() },
        jobRetryCounter: { labels: vi.fn().mockReturnThis(), inc: vi.fn() },
        queueDepthGauge: { labels: vi.fn().mockReturnThis(), set: vi.fn() },
        lastSuccessGauge: { labels: vi.fn().mockReturnThis(), set: vi.fn() }
      } as unknown as TasksApplication['metrics'],
      http: {} as TasksApplication['http'],
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn(),
      publishJob: vi.fn(),
      registerWorker: vi.fn(async (_queue, handler, _options) => {
        registeredHandler = handler as (job: Job<unknown>) => Promise<void>;
      })
    } as unknown as TasksApplication;
  });

  it('processes a milestone job successfully', async () => {
    await registerMilestoneWorker(app, dependencies);
    expect(app.registerWorker).toHaveBeenCalledWith(
      'indexer.milestone',
      expect.any(Function),
      expect.objectContaining({ includeMetadata: true })
    );

    const job = createJob();
    const handler = registeredHandler;
    expect(handler).not.toBeNull();

    await handler!(job);

    expect(dependencies.parsePayload).toHaveBeenCalledWith(job.data);
    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(processor.process).toHaveBeenCalledWith({
      envelope: expect.objectContaining({ jobId: job.id, queueName: job.name }),
      payload: parsedPayload
    });
  });

  it('swallows duplicate milestone errors and marks job as skipped', async () => {
    await registerMilestoneWorker(app, dependencies);
    const handler = registeredHandler;
    expect(handler).not.toBeNull();

    const job = createJob({ id: 'job-dup', retrycount: 1 });

    const processMock = processor.process as unknown as ReturnType<typeof vi.fn>;
    processMock.mockRejectedValueOnce(new MilestoneAlreadyProcessedError('duplicate job'));

    await expect(handler!(job)).resolves.toBeUndefined();
    expect(processMock).toHaveBeenCalledTimes(1);
  });
});
