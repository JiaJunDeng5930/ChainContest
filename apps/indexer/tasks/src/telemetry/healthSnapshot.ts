import type { TasksConfig } from '../bootstrap/config.js';
import type { TaskMetrics } from './metrics.js';
import type { QueueBacklogMetric } from '../queue/diagnostics.js';

export type TaskServiceMode = 'live' | 'degraded' | 'paused';

export interface QueueHealthSnapshot {
  name: string;
  pending: number;
  delayed: number;
  failed: number;
  active: number;
  lastSuccessAt: Date | null;
  lastError: string | null;
}

export interface TaskServiceHealthSnapshot {
  mode: TaskServiceMode;
  timestamp: Date;
  queues: QueueHealthSnapshot[];
  activeAlerts: string[];
}

export interface HealthSnapshotDependencies {
  config: TasksConfig;
  metrics: TaskMetrics;
  queueNames: string[];
  readQueueBacklog: (queueNames: string[]) => Promise<QueueBacklogMetric[]>;
  isQueueRunning: () => boolean;
  getRecentFailures?: () => Map<string, string>;
}

export const createHealthSnapshotBuilder = (
  dependencies: HealthSnapshotDependencies
): (() => Promise<TaskServiceHealthSnapshot>) => {
  const pendingThreshold = Math.max(10, dependencies.config.queue.concurrency * 5);

  return async (): Promise<TaskServiceHealthSnapshot> => {
    const backlog = await dependencies.readQueueBacklog(dependencies.queueNames);
    const lastSuccess = await readLastSuccessTimestamps(dependencies.metrics);
    const lastErrors = dependencies.getRecentFailures?.() ?? new Map<string, string>();

    const queues = backlog.map((metric) => ({
      name: metric.name,
      pending: metric.pending,
      delayed: metric.delayed,
      failed: metric.failed,
      active: metric.active,
      lastSuccessAt: lastSuccess.get(metric.name) ?? null,
      lastError: lastErrors.get(metric.name) ?? null
    } satisfies QueueHealthSnapshot));

    const activeAlerts = deriveAlerts(queues, pendingThreshold);
    const mode = deriveMode({
      queues,
      activeAlerts,
      queueRunning: dependencies.isQueueRunning()
    });

    return {
      mode,
      timestamp: new Date(),
      queues,
      activeAlerts
    } satisfies TaskServiceHealthSnapshot;
  };
};

const deriveMode = ({
  queues,
  activeAlerts,
  queueRunning
}: {
  queues: QueueHealthSnapshot[];
  activeAlerts: string[];
  queueRunning: boolean;
}): TaskServiceMode => {
  if (!queueRunning) {
    return 'paused';
  }

  return activeAlerts.length > 0 ? 'degraded' : 'live';
};

const deriveAlerts = (queues: QueueHealthSnapshot[], pendingThreshold: number): string[] => {
  const alerts: string[] = [];

  for (const queue of queues) {
    if (queue.failed > 0) {
      alerts.push(`${queue.name} has ${queue.failed} failed job(s)`);
    }

    if (queue.pending >= pendingThreshold) {
      alerts.push(`${queue.name} backlog ${queue.pending} exceeds threshold ${pendingThreshold}`);
    }

    if (queue.delayed > 0) {
      alerts.push(`${queue.name} has ${queue.delayed} delayed job(s)`);
    }
  }

  return alerts;
};

const readLastSuccessTimestamps = async (metrics: TaskMetrics): Promise<Map<string, Date>> => {
  const gauge = await metrics.lastSuccessGauge.get();
  const timestamps = new Map<string, Date>();

  const values = Array.isArray(gauge.values) ? gauge.values : [];

  values.forEach((value) => {
    const queue = value.labels.queue as string | undefined;
    if (!queue) {
      return;
    }

    const seconds = Number(value.value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    timestamps.set(queue, new Date(seconds * 1000));
  });

  return timestamps;
};
