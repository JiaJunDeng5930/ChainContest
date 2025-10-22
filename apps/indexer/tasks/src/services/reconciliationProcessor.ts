import type { Logger } from 'pino';
import type {
  ReconciliationReportLedger,
  ReconciliationReportStatus
} from '@chaincontest/db';

export interface ReconciliationPayload {
  reportId: string;
  contestId: string;
  chainId: number;
  rangeFromBlock: string;
  rangeToBlock: string;
  generatedAt: Date;
  differences: unknown[];
  notifications: NotificationTarget[];
  metadata?: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface NotificationTarget {
  channel: string;
  target?: string;
  template?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskJobEnvelopeLike {
  jobId: string;
  queueName: string;
  attempt: number;
  retryLimit: number;
}

export interface ReconciliationProcessInput {
  envelope: TaskJobEnvelopeLike;
  payload: ReconciliationPayload;
  idempotencyKey: string;
}

export interface ReconciliationProcessResult {
  status: 'processed';
  notificationsDispatched: number;
}

export interface NotificationDispatchInput {
  report: ReconciliationReportLedger;
  targets: NotificationTarget[];
}

export interface ReconciliationProcessorDependencies {
  logger: Logger;
  db: {
    upsert: (request: {
      idempotencyKey: string;
      reportId: string;
      jobId: string;
      contestId: string;
      chainId: number;
      rangeFromBlock: string;
      rangeToBlock: string;
      generatedAt: Date;
      status: ReconciliationReportStatus;
      attempts: number;
      differences: unknown[];
      notifications: unknown[];
      payload: Record<string, unknown>;
      actorContext?: Record<string, unknown> | null;
      lastError?: Record<string, unknown> | null;
      completedAt?: Date | string | null;
    }) => Promise<ReconciliationReportLedger>;
    transition: (request: {
      reportId: string;
      toStatus: ReconciliationReportStatus;
      attempts?: number;
      lastError?: Record<string, unknown> | null;
      actorContext?: Record<string, unknown> | null;
      notifications?: unknown[];
      completedAt?: Date | string | null;
    }) => Promise<ReconciliationReportLedger>;
    getByReportId: (reportId: string) => Promise<ReconciliationReportLedger | null>;
  };
  notifications?: {
    dispatch: (input: NotificationDispatchInput) => Promise<void>;
  };
  features: {
    notificationsEnabled: boolean;
  };
  maxAttempts?: number;
}

export interface ReconciliationProcessor {
  process: (input: ReconciliationProcessInput) => Promise<ReconciliationProcessResult>;
}

export class ReportAlreadyProcessedError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message, { cause: context });
    this.name = 'ReportAlreadyProcessedError';
  }
}

export class InvalidReconciliationStatusTransitionError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message, { cause: context });
    this.name = 'InvalidReconciliationStatusTransitionError';
  }
}

const transitionGraph: Record<ReconciliationReportStatus, ReadonlySet<ReconciliationReportStatus>> = {
  pending_review: new Set(['pending_review', 'in_review', 'needs_attention']),
  in_review: new Set(['in_review', 'resolved', 'needs_attention']),
  resolved: new Set(['resolved', 'needs_attention']),
  needs_attention: new Set(['needs_attention', 'in_review'])
};

export const isAllowedReconciliationTransition = (
  from: ReconciliationReportStatus,
  to: ReconciliationReportStatus
): boolean => transitionGraph[from]?.has(to) ?? false;

export const assertReconciliationStatusTransition = (
  from: ReconciliationReportStatus,
  to: ReconciliationReportStatus
): void => {
  if (!isAllowedReconciliationTransition(from, to)) {
    throw new InvalidReconciliationStatusTransitionError('Illegal reconciliation status transition', {
      from,
      to
    });
  }
};

export const buildReconciliationIdempotencyKey = (payload: ReconciliationPayload): string =>
  `report:${payload.reportId}`;

export const createReconciliationProcessor = (
  dependencies: ReconciliationProcessorDependencies
): ReconciliationProcessor => {
  const {
    logger,
    db,
    features,
    notifications = { dispatch: async () => {} }
  } = dependencies;
  const maxAttempts = dependencies.maxAttempts ?? 3;

  const process = async (
    input: ReconciliationProcessInput
  ): Promise<ReconciliationProcessResult> => {
    const { envelope, payload, idempotencyKey } = input;

    const existing = await db.getByReportId(payload.reportId);
    const isSameJobAttempt = existing?.jobId === envelope.jobId;
    if (existing && !isSameJobAttempt && existing.status !== 'needs_attention') {
      logger.debug(
        {
          reportId: payload.reportId,
          status: existing.status,
          jobId: envelope.jobId,
          existingJobId: existing.jobId
        },
        'reconciliation report already processed'
      );
      throw new ReportAlreadyProcessedError('Reconciliation report already processed', {
        reportId: payload.reportId,
        status: existing.status
      });
    }

    const serializedPayload = serialisePayload(payload);

    try {
      const record = await db.upsert({
        idempotencyKey,
        reportId: payload.reportId,
        jobId: envelope.jobId,
        contestId: payload.contestId,
        chainId: payload.chainId,
        rangeFromBlock: payload.rangeFromBlock,
        rangeToBlock: payload.rangeToBlock,
        generatedAt: payload.generatedAt,
        status: 'pending_review',
        attempts: envelope.attempt,
        differences: payload.differences,
        notifications: existing?.notifications ?? [],
        payload: serializedPayload,
        actorContext: existing?.actorContext ?? null,
        lastError: null,
        completedAt: null
      });

      let dispatchedNotifications = 0;
      let notificationAudit = existing?.notifications ?? [];

      const shouldDispatchNotifications =
        features.notificationsEnabled &&
        payload.notifications.length > 0 &&
        (!existing ||
          existing.status === 'needs_attention' ||
          existing.jobId === envelope.jobId);

      if (shouldDispatchNotifications) {
        await notifications.dispatch({
          report: record,
          targets: payload.notifications
        });
        dispatchedNotifications = payload.notifications.length;
        notificationAudit = mergeNotificationAudit(notificationAudit, payload.notifications);
      }

      await db.transition({
        reportId: payload.reportId,
        toStatus: 'pending_review',
        attempts: envelope.attempt,
        notifications: notificationAudit,
        lastError: null,
        actorContext: existing?.actorContext ?? null,
        completedAt: null
      });

      logger.info(
        {
          reportId: payload.reportId,
          contestId: payload.contestId,
          notificationsDispatched: dispatchedNotifications
        },
        'reconciliation report processed'
      );

      return {
        status: 'processed',
        notificationsDispatched: dispatchedNotifications
      };
    } catch (error) {
      const nextAttempts = envelope.attempt + 1;
      const escalate = nextAttempts >= maxAttempts;
      const toStatus: ReconciliationReportStatus = escalate ? 'needs_attention' : 'pending_review';

      await db.transition({
        reportId: payload.reportId,
        toStatus,
        attempts: nextAttempts,
        lastError: serialiseError(error)
      });

      logger.error(
        {
          reportId: payload.reportId,
          contestId: payload.contestId,
          err: serialiseError(error),
          attempt: envelope.attempt,
          escalated: escalate
        },
        'reconciliation report processing failed'
      );

      throw error;
    }
  };

  return { process } satisfies ReconciliationProcessor;
};

const mergeNotificationAudit = (
  existing: unknown[],
  targets: NotificationTarget[]
): unknown[] => {
  const base = Array.isArray(existing) ? [...existing] : [];
  const timestamp = new Date().toISOString();
  const records = targets.map((target) => ({
    channel: target.channel,
    target: target.target ?? null,
    template: target.template ?? null,
    metadata: target.metadata ?? null,
    sentAt: timestamp
  }));
  return [...base, ...records];
};

const serialisePayload = (payload: ReconciliationPayload): Record<string, unknown> => ({
  differences: payload.differences,
  metadata: payload.metadata ?? {},
  payload: payload.payload
});

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
