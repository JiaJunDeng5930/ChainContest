import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase, DrizzleTransaction } from '../adapters/connection.js';
import { DbError, DbErrorCode } from '../instrumentation/metrics.js';
import {
  milestoneExecutionRecords,
  milestoneExecutionStatusEnum,
  type MilestoneExecutionRecord,
  type MilestoneExecutionStatus
} from '../schema/milestoneExecution.js';
import type { DbSchema } from '../schema/index.js';

const transitionGraph: Record<MilestoneExecutionStatus, ReadonlySet<MilestoneExecutionStatus>> = {
  pending: new Set(['pending', 'in_progress', 'needs_attention']),
  in_progress: new Set(['in_progress', 'succeeded', 'retrying', 'needs_attention']),
  retrying: new Set(['retrying', 'in_progress', 'succeeded', 'needs_attention']),
  succeeded: new Set(['succeeded']),
  needs_attention: new Set(['needs_attention', 'in_progress', 'retrying'])
};

const allowedStatuses = new Set<MilestoneExecutionStatus>(
  milestoneExecutionStatusEnum.enumValues as MilestoneExecutionStatus[]
);

export interface MilestoneExecutionUpsertParams {
  idempotencyKey: string;
  jobId: string;
  contestId: string;
  chainId: number;
  milestone: string;
  sourceTxHash: string;
  sourceLogIndex: number;
  sourceBlockNumber: string;
  payload: unknown;
  attempt: number;
  status: MilestoneExecutionStatus;
  lastError?: Record<string, unknown> | null;
  actorContext?: Record<string, unknown> | null;
  completedAt?: Date | string | null;
}

export interface MilestoneExecutionLookupParams {
  contestId: string;
  chainId: number;
  milestone: string;
  sourceTxHash: string;
  sourceLogIndex: number;
}

export interface MilestoneExecutionStatusTransitionParams {
  idempotencyKey: string;
  toStatus: MilestoneExecutionStatus;
  attempts?: number;
  lastError?: Record<string, unknown> | null;
  actorContext?: Record<string, unknown> | null;
  completedAt?: Date | string | null;
}

export async function upsertMilestoneExecutionRecord(
  tx: DrizzleTransaction<DbSchema>,
  params: MilestoneExecutionUpsertParams
): Promise<MilestoneExecutionRecord> {
  validateStatus(params.status);
  const attempts = normalizeAttempts(params.attempt);
  const payload = params.payload === undefined ? {} : params.payload;
  const actorContext =
    params.actorContext === undefined
      ? null
      : params.actorContext === null
        ? null
        : ensureJsonObject(params.actorContext);
  const lastError =
    params.lastError === undefined
      ? null
      : params.lastError === null
        ? null
        : ensureJsonObject(params.lastError);

  const updateSet: Record<string, unknown> = {
    jobId: params.jobId,
    status: params.status,
    attempts,
    payload,
    sourceBlockNumber: params.sourceBlockNumber,
    updatedAt: sql`now()`
  };

  if (actorContext !== undefined) {
    updateSet.actorContext = actorContext;
  }

  if (lastError !== undefined) {
    updateSet.lastError = lastError;
  }

  if (Object.prototype.hasOwnProperty.call(params, 'completedAt')) {
    updateSet.completedAt = coerceNullableDate(params.completedAt);
  }

  const [record] = await tx
    .insert(milestoneExecutionRecords)
    .values({
      idempotencyKey: params.idempotencyKey,
      jobId: params.jobId,
      contestId: params.contestId,
      chainId: params.chainId,
      milestone: params.milestone,
      sourceTxHash: params.sourceTxHash,
      sourceLogIndex: params.sourceLogIndex,
      sourceBlockNumber: params.sourceBlockNumber,
      status: params.status,
      attempts,
      payload,
      actorContext,
      lastError,
      completedAt: coerceNullableDate(params.completedAt)
    })
    .onConflictDoUpdate({
      target: milestoneExecutionRecords.idempotencyKey,
      set: updateSet
    })
    .returning();

  if (!record) {
    throw new DbError(DbErrorCode.INTERNAL_ERROR, 'Failed to upsert milestone execution record');
  }

  return record;
}

export async function findMilestoneExecutionByIdempotencyKey(
  db: DrizzleDatabase<DbSchema> | DrizzleTransaction<DbSchema>,
  idempotencyKey: string
): Promise<MilestoneExecutionRecord | null> {
  const result = await db
    .select()
    .from(milestoneExecutionRecords)
    .where(eq(milestoneExecutionRecords.idempotencyKey, idempotencyKey))
    .limit(1);

  return result[0] ?? null;
}

export async function findMilestoneExecutionByEvent(
  db: DrizzleDatabase<DbSchema> | DrizzleTransaction<DbSchema>,
  params: MilestoneExecutionLookupParams
): Promise<MilestoneExecutionRecord | null> {
  const result = await db
    .select()
    .from(milestoneExecutionRecords)
    .where(
      and(
        eq(milestoneExecutionRecords.contestId, params.contestId),
        eq(milestoneExecutionRecords.chainId, params.chainId),
        eq(milestoneExecutionRecords.milestone, params.milestone),
        eq(milestoneExecutionRecords.sourceTxHash, params.sourceTxHash),
        eq(milestoneExecutionRecords.sourceLogIndex, params.sourceLogIndex)
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function transitionMilestoneExecutionStatus(
  tx: DrizzleTransaction<DbSchema>,
  params: MilestoneExecutionStatusTransitionParams
): Promise<MilestoneExecutionRecord> {
  validateStatus(params.toStatus);

  const existing = await findMilestoneExecutionByIdempotencyKey(tx, params.idempotencyKey);
  if (!existing) {
    throw new DbError(DbErrorCode.NOT_FOUND, 'Milestone execution record not found', {
      detail: {
        reason: 'milestone_execution_not_found',
        context: { idempotencyKey: params.idempotencyKey }
      }
    });
  }

  if (!canTransition(existing.status, params.toStatus)) {
    throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Illegal milestone execution status transition', {
      detail: {
        reason: 'invalid_transition',
        context: { from: existing.status, to: params.toStatus }
      }
    });
  }

  const updateSet: Record<string, unknown> = {
    status: params.toStatus,
    updatedAt: sql`now()`
  };

  if (Object.prototype.hasOwnProperty.call(params, 'attempts')) {
    updateSet.attempts = normalizeAttempts(params.attempts ?? existing.attempts);
  }

  if (params.toStatus === 'succeeded' && !Object.prototype.hasOwnProperty.call(params, 'completedAt')) {
    updateSet.completedAt = existing.completedAt ?? sql`now()`;
  } else if (Object.prototype.hasOwnProperty.call(params, 'completedAt')) {
    updateSet.completedAt = coerceNullableDate(params.completedAt);
  }

  if (params.toStatus === 'succeeded' && !Object.prototype.hasOwnProperty.call(params, 'lastError')) {
    updateSet.lastError = null;
  } else if (Object.prototype.hasOwnProperty.call(params, 'lastError')) {
    updateSet.lastError = params.lastError === null ? null : ensureJsonObject(params.lastError);
  }

  if (Object.prototype.hasOwnProperty.call(params, 'actorContext')) {
    updateSet.actorContext = params.actorContext === null ? null : ensureJsonObject(params.actorContext);
  }

  const [updated] = await tx
    .update(milestoneExecutionRecords)
    .set(updateSet)
    .where(eq(milestoneExecutionRecords.id, existing.id))
    .returning();

  if (!updated) {
    throw new DbError(DbErrorCode.INTERNAL_ERROR, 'Failed to update milestone execution record');
  }

  return updated;
}

function normalizeAttempts(attempt: number | undefined): number {
  if (attempt === undefined || Number.isNaN(attempt)) {
    return 0;
  }
  return Math.max(0, Math.trunc(attempt));
}

function ensureJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new DbError(DbErrorCode.INPUT_INVALID, 'Expected object value', {
    detail: { reason: 'invalid_json_object', context: { valueType: typeof value } }
  });
}

function coerceNullableDate(value: Date | string | null | undefined): Date | null {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid date value provided', {
      detail: { reason: 'invalid_date' }
    });
  }
  return date;
}

function validateStatus(status: string): asserts status is MilestoneExecutionStatus {
  if (!allowedStatuses.has(status as MilestoneExecutionStatus)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Unsupported milestone execution status', {
      detail: { reason: 'unsupported_status', context: { status } }
    });
  }
}

function canTransition(from: MilestoneExecutionStatus, to: MilestoneExecutionStatus): boolean {
  const allowed = transitionGraph[from];
  return allowed?.has(to) ?? false;
}
