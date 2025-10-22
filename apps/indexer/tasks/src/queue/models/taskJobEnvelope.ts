import { z } from 'zod';
import type { Job } from 'pg-boss';

export const taskQueueNameSchema = z.enum(['indexer.milestone', 'indexer.reconcile']);

export const taskJobEnvelopeSchema = z.object({
  jobId: z.string().min(1),
  queueName: taskQueueNameSchema,
  payload: z.unknown(),
  attempt: z.number().int().min(0),
  retryLimit: z.number().int().min(0),
  enqueuedAt: z.date(),
  availableAt: z.date().nullable(),
  singletonKey: z.string().nullish(),
  priority: z.number().int().optional(),
  state: z.string().optional()
});

export type TaskJobEnvelope = z.infer<typeof taskJobEnvelopeSchema>;

export interface AuditSerialisationOptions {
  includePayload?: boolean;
}

export const createTaskJobEnvelope = <TPayload>(job: Job<TPayload>): TaskJobEnvelope => {
  const queueName = taskQueueNameSchema.parse(job.name);

  const envelope = {
    jobId: job.id,
    queueName,
    payload: job.data,
    attempt: job.retrycount ?? 0,
    retryLimit: job.retrylimit ?? 0,
    enqueuedAt: coerceDate(job.createdon),
    availableAt: job.nextiteration ? coerceDate(job.nextiteration) : null,
    singletonKey: job.singletonKey ?? null,
    priority: job.priority ?? undefined,
    state: job.state ?? undefined
  } satisfies TaskJobEnvelope;

  return taskJobEnvelopeSchema.parse(envelope);
};

export const serialiseForAudit = (
  envelope: TaskJobEnvelope,
  options: AuditSerialisationOptions = {}
): Record<string, unknown> => {
  const includePayload = options.includePayload ?? true;

  const record: Record<string, unknown> = {
    jobId: envelope.jobId,
    queueName: envelope.queueName,
    attempt: envelope.attempt,
    retryLimit: envelope.retryLimit,
    enqueuedAt: envelope.enqueuedAt.toISOString(),
    availableAt: envelope.availableAt ? envelope.availableAt.toISOString() : null,
    singletonKey: envelope.singletonKey ?? null,
    priority: envelope.priority ?? null,
    state: envelope.state ?? null
  };

  if (includePayload) {
    record.payload = clonePayload(envelope.payload);
  }

  return record;
};

const coerceDate = (input: string | Date): Date => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value provided: ${String(input)}`);
  }
  return date;
};

const clonePayload = (payload: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return payload;
  }
};
