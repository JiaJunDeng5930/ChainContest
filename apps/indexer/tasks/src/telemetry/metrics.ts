import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export interface MetricsOptions {
  prefix?: string;
  defaultLabels?: Record<string, string>;
}

export interface TaskMetrics {
  registry: Registry;
  jobDuration: Histogram<'queue' | 'outcome'>;
  jobCounter: Counter<'queue' | 'outcome'>;
  jobRetryCounter: Counter<'queue' | 'reason'>;
  queueDepthGauge: Gauge<'queue' | 'state'>;
  lastSuccessGauge: Gauge<'queue'>;
}

export type JobOutcome = 'success' | 'failure' | 'deferred' | 'skipped';
export type QueueState = 'pending' | 'delayed' | 'failed' | 'active';

export const createTaskMetrics = (options: MetricsOptions = {}): TaskMetrics => {
  const prefix = options.prefix ?? 'indexer_tasks_';
  const registry = new Registry();

  if (options.defaultLabels) {
    registry.setDefaultLabels(options.defaultLabels);
  }

  collectDefaultMetrics({ register: registry, prefix });

  const jobDuration = new Histogram({
    name: `${prefix}job_duration_seconds`,
    help: 'Task job processing duration in seconds',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    labelNames: ['queue', 'outcome'] as const,
    registers: [registry],
  });

  const jobCounter = new Counter({
    name: `${prefix}jobs_total`,
    help: 'Total number of task jobs processed by outcome',
    labelNames: ['queue', 'outcome'] as const,
    registers: [registry],
  });

  const jobRetryCounter = new Counter({
    name: `${prefix}job_retries_total`,
    help: 'Number of retries triggered for task jobs grouped by reason',
    labelNames: ['queue', 'reason'] as const,
    registers: [registry],
  });

  const queueDepthGauge = new Gauge({
    name: `${prefix}queue_depth`,
    help: 'Current queue backlog grouped by job state',
    labelNames: ['queue', 'state'] as const,
    registers: [registry],
  });

  const lastSuccessGauge = new Gauge({
    name: `${prefix}last_success_timestamp_seconds`,
    help: 'Unix timestamp of the last successful job per queue',
    labelNames: ['queue'] as const,
    registers: [registry],
  });

  return {
    registry,
    jobDuration,
    jobCounter,
    jobRetryCounter,
    queueDepthGauge,
    lastSuccessGauge,
  };
};

export const recordJobResult = (
  metrics: TaskMetrics,
  queue: string,
  outcome: JobOutcome,
  durationSeconds: number,
): void => {
  metrics.jobDuration.labels(queue, outcome).observe(durationSeconds);
  metrics.jobCounter.labels(queue, outcome).inc();

  if (outcome === 'success') {
    metrics.lastSuccessGauge.labels(queue).set(Date.now() / 1000);
  }
};

export const recordJobRetry = (
  metrics: TaskMetrics,
  queue: string,
  reason: string,
): void => {
  metrics.jobRetryCounter.labels(queue, reason).inc();
};

export const setQueueDepth = (
  metrics: TaskMetrics,
  queue: string,
  state: QueueState,
  value: number,
): void => {
  metrics.queueDepthGauge.labels(queue, state).set(value);
};

export const resetTaskMetrics = (metrics: TaskMetrics): void => {
  metrics.registry.resetMetrics();
};

export const serializeTaskMetrics = async (metrics: TaskMetrics): Promise<string> =>
  metrics.registry.metrics();
