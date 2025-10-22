import { getQueueStates, type QueueStateCounts } from '../bootstrap/queue.js';

export interface QueueBacklogMetric {
  name: string;
  pending: number;
  delayed: number;
  failed: number;
  active: number;
}

const EMPTY_COUNTS: QueueStateCounts = {
  created: 0,
  retry: 0,
  active: 0,
  completed: 0,
  expired: 0,
  cancelled: 0,
  failed: 0
};

export const readQueueBacklog = async (queueNames: string[]): Promise<QueueBacklogMetric[]> => {
  const snapshot = await getQueueStates();

  return queueNames.map((name) => {
    const counts = snapshot.queues[name] ?? EMPTY_COUNTS;
    return {
      name,
      pending: counts.created,
      delayed: counts.retry,
      failed: counts.failed,
      active: counts.active
    } satisfies QueueBacklogMetric;
  });
};
