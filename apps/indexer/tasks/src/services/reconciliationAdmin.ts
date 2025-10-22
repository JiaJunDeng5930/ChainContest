import type { Logger } from 'pino';
import {
  getReconciliationReportByReportId,
  updateReconciliationReportStatus,
  type ReconciliationReportLedger,
  type ReconciliationReportStatus
} from '@chaincontest/db';
import {
  assertReconciliationStatusTransition,
  InvalidReconciliationStatusTransitionError
} from './reconciliationProcessor.js';
import { ManualActionError } from './milestoneControl.js';

export interface UpdateReportStatusRequest {
  reportId: string;
  status: ReconciliationReportStatus;
  actor: string;
  note?: string;
}

export interface ReconciliationAdminDependencies {
  logger: Logger;
}

export type ReconciliationAdminActionResult = ReconciliationReportLedger;

export const createReconciliationAdminActions = (deps: ReconciliationAdminDependencies) => ({
  updateReportStatus: async (request: UpdateReportStatusRequest): Promise<ReconciliationAdminActionResult> => {
    const existing = await getReconciliationReportByReportId(request.reportId);
    if (!existing) {
      throw new ManualActionError('Reconciliation report not found', 'NOT_FOUND');
    }

    try {
      assertReconciliationStatusTransition(existing.status, request.status);
    } catch (error) {
      if (error instanceof InvalidReconciliationStatusTransitionError) {
        throw new ManualActionError('Illegal reconciliation report transition', 'CONFLICT');
      }
      throw error;
    }

    const actorContext = buildActorContext(request.actor, request.note);

    const record = await updateReconciliationReportStatus({
      reportId: request.reportId,
      toStatus: request.status,
      actorContext,
      notifications: existing.notifications,
      attempts: existing.attempts,
      completedAt: request.status === 'resolved' ? new Date() : null
    });

    deps.logger.info(
      {
        action: 'report_status_update',
        reportId: request.reportId,
        previousStatus: existing.status,
        status: request.status,
        actor: request.actor
      },
      'reconciliation report status updated'
    );

    return record;
  }
});

const buildActorContext = (actor: string, note?: string): Record<string, unknown> => ({
  actor,
  note: note ?? null,
  timestamp: new Date().toISOString()
});
