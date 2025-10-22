import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { DrizzleDatabase, DrizzleTransaction } from '../adapters/connection.js';
import { DbError, DbErrorCode } from '../instrumentation/metrics.js';
import {
  reconciliationReportLedgers,
  reconciliationReportStatusEnum,
  type ReconciliationReportLedger,
  type ReconciliationReportStatus
} from '../schema/reconciliationReport.js';
import type { DbSchema } from '../schema/index.js';

const transitionGraph: Record<ReconciliationReportStatus, ReadonlySet<ReconciliationReportStatus>> = {
  pending_review: new Set(['pending_review', 'in_review', 'needs_attention']),
  in_review: new Set(['in_review', 'resolved', 'needs_attention']),
  resolved: new Set(['resolved', 'needs_attention']),
  needs_attention: new Set(['needs_attention', 'in_review'])
};

const allowedStatuses = new Set<ReconciliationReportStatus>(
  reconciliationReportStatusEnum.enumValues as ReconciliationReportStatus[]
);

export interface ReconciliationReportUpsertParams {
  idempotencyKey: string;
  reportId: string;
  jobId: string;
  contestId: string;
  chainId: number;
  rangeFromBlock: string;
  rangeToBlock: string;
  generatedAt: Date | string;
  status: ReconciliationReportStatus;
  attempts: number;
  differences?: unknown;
  notifications?: unknown;
  payload?: unknown;
  actorContext?: Record<string, unknown> | null;
  lastError?: Record<string, unknown> | null;
  completedAt?: Date | string | null;
}

export interface ReconciliationReportStatusTransitionParams {
  reportId: string;
  toStatus: ReconciliationReportStatus;
  attempts?: number;
  lastError?: Record<string, unknown> | null;
  actorContext?: Record<string, unknown> | null;
  notifications?: unknown;
  completedAt?: Date | string | null;
}

export interface ReconciliationReportLookupParams {
  reportId: string;
}

export async function upsertReconciliationReportRecord(
  tx: DrizzleTransaction<DbSchema>,
  params: ReconciliationReportUpsertParams
): Promise<ReconciliationReportLedger> {
  validateStatus(params.status);
  const attempts = normalizeAttempts(params.attempts);
  const differences = ensureJsonArray(params.differences, 'differences');
  const notifications = ensureNotificationsArray(params.notifications);
  const payload = ensureJsonObject(params.payload ?? {});
  const actorContext = toNullableJsonObject(params.actorContext);
  const lastError = toNullableJsonObject(params.lastError);
  const generatedAt = coerceDate(params.generatedAt);
  const completedAt = coerceNullableDate(params.completedAt);

  const updateSet: Record<string, unknown> = {
    jobId: params.jobId,
    status: params.status,
    attempts,
    differences,
    notifications,
    payload,
    updatedAt: sql`now()`,
    generatedAt
  };

  if (actorContext !== undefined) {
    updateSet.actorContext = actorContext;
  }

  if (lastError !== undefined) {
    updateSet.lastError = lastError;
  }

  if (params.status === 'resolved' && completedAt === null) {
    updateSet.completedAt = sql`now()`;
  } else if (params.status !== 'resolved' && completedAt === null) {
    updateSet.completedAt = null;
  } else if (completedAt !== undefined) {
    updateSet.completedAt = completedAt;
  }

  const [record] = await tx
    .insert(reconciliationReportLedgers)
    .values({
      idempotencyKey: params.idempotencyKey,
      reportId: params.reportId,
      jobId: params.jobId,
      contestId: params.contestId,
      chainId: params.chainId,
      rangeFromBlock: params.rangeFromBlock,
      rangeToBlock: params.rangeToBlock,
      generatedAt,
      status: params.status,
      attempts,
      differences,
      notifications,
      payload,
      actorContext,
      lastError,
      completedAt
    })
    .onConflictDoUpdate({
      target: reconciliationReportLedgers.idempotencyKey,
      set: updateSet
    })
    .returning();

  return record;
}

export async function findReconciliationReportByReportId(
  db: DrizzleDatabase<DbSchema> | DrizzleTransaction<DbSchema>,
  reportId: string
): Promise<ReconciliationReportLedger | null> {
  const result = await db
    .select()
    .from(reconciliationReportLedgers)
    .where(eq(reconciliationReportLedgers.reportId, reportId))
    .limit(1);

  return result[0] ?? null;
}

export async function transitionReconciliationReportStatus(
  tx: DrizzleTransaction<DbSchema>,
  params: ReconciliationReportStatusTransitionParams
): Promise<ReconciliationReportLedger> {
  validateStatus(params.toStatus);
  const existing = await findReconciliationReportByReportId(tx, params.reportId);

  if (!existing) {
    throw new DbError(DbErrorCode.NOT_FOUND, 'Reconciliation report not found', {
      detail: {
        reason: 'reconciliation_report_not_found',
        context: { reportId: params.reportId }
      }
    });
  }

  if (!canTransition(existing.status, params.toStatus)) {
    throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Illegal reconciliation report status transition', {
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

  if (params.toStatus === 'resolved' && !Object.prototype.hasOwnProperty.call(params, 'completedAt')) {
    updateSet.completedAt = existing.completedAt ?? sql`now()`;
  } else if (Object.prototype.hasOwnProperty.call(params, 'completedAt')) {
    updateSet.completedAt = coerceNullableDate(params.completedAt);
  }

  if (params.toStatus !== 'resolved' && !Object.prototype.hasOwnProperty.call(params, 'completedAt')) {
    updateSet.completedAt = null;
  }

  if (params.toStatus === 'resolved' && !Object.prototype.hasOwnProperty.call(params, 'lastError')) {
    updateSet.lastError = null;
  } else if (Object.prototype.hasOwnProperty.call(params, 'lastError')) {
    updateSet.lastError = params.lastError === null ? null : ensureJsonObject(params.lastError);
  }

  if (Object.prototype.hasOwnProperty.call(params, 'actorContext')) {
    updateSet.actorContext = params.actorContext === null ? null : ensureJsonObject(params.actorContext);
  }

  if (Object.prototype.hasOwnProperty.call(params, 'notifications')) {
    updateSet.notifications = ensureNotificationsArray(params.notifications);
  }

  const [updated] = await tx
    .update(reconciliationReportLedgers)
    .set(updateSet)
    .where(eq(reconciliationReportLedgers.id, existing.id))
    .returning();

  if (!updated) {
    throw new DbError(DbErrorCode.INTERNAL_ERROR, 'Failed to update reconciliation report record');
  }

  return updated;
}

function normalizeAttempts(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function ensureJsonArray(value: unknown, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value as unknown[];
  }

  throw new DbError(DbErrorCode.INPUT_INVALID, `Expected ${field} to be an array`, {
    detail: { reason: 'invalid_array', context: { field } }
  });
}

function ensureNotificationsArray(value: unknown): unknown[] {
  const notifications = ensureJsonArray(value, 'notifications');
  notifications.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new DbError(DbErrorCode.INPUT_INVALID, 'Notification entry must be an object', {
        detail: { reason: 'invalid_notification_entry', context: { index } }
      });
    }
  });
  return notifications;
}

function ensureJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new DbError(DbErrorCode.INPUT_INVALID, 'Expected object value', {
    detail: { reason: 'invalid_json_object' }
  });
}

function toNullableJsonObject(value: Record<string, unknown> | null | undefined):
  | Record<string, unknown>
  | null
  | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return ensureJsonObject(value);
}

function coerceDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid date value provided', {
      detail: { reason: 'invalid_date' }
    });
  }
  return date;
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

function validateStatus(status: string): asserts status is ReconciliationReportStatus {
  if (!allowedStatuses.has(status as ReconciliationReportStatus)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Unsupported reconciliation report status', {
      detail: { reason: 'unsupported_status', context: { status } }
    });
  }
}

function canTransition(from: ReconciliationReportStatus, to: ReconciliationReportStatus): boolean {
  const allowed = transitionGraph[from];
  return allowed?.has(to) ?? false;
}
