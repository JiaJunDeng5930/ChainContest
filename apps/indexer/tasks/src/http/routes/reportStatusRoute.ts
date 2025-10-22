import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ReconciliationReportStatus } from '@chaincontest/db';
import type {
  UpdateReportStatusRequest,
  ReconciliationAdminActionResult
} from '../../services/reconciliationAdmin.js';
import { ManualActionError } from '../../services/milestoneControl.js';

const STATUS_VALUES: readonly ReconciliationReportStatus[] = [
  'pending_review',
  'in_review',
  'resolved',
  'needs_attention'
];

const requestSchema = z.object({
  reportId: z.string().min(1),
  status: z.enum(STATUS_VALUES as [ReconciliationReportStatus, ...ReconciliationReportStatus[]]),
  actor: z.string().min(1),
  note: z.string().optional()
});

export interface ReportStatusRouteDependencies {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;
  updateStatus: (request: UpdateReportStatusRequest) => Promise<ReconciliationAdminActionResult>;
}

export const registerReportStatusRoute = async (
  app: FastifyInstance,
  dependencies: ReportStatusRouteDependencies
): Promise<void> => {
  app.post(
    '/v1/tasks/reports/actions/status',
    {
      preHandler: dependencies.authenticate
    },
    async (request, reply) => {
      try {
        const body = requestSchema.parse(request.body);
        const record = await dependencies.updateStatus(body);
        reply.status(200).send({ reportId: record.reportId, status: record.status });
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
};

const handleError = (error: unknown, reply: FastifyReply): void => {
  if (error instanceof ManualActionError) {
    if (error.code === 'NOT_FOUND') {
      reply.status(404).send({ error: 'not_found', message: error.message });
      return;
    }

    reply.status(409).send({ error: 'conflict', message: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.status(400).send({ error: 'validation_error', details: error.flatten() });
    return;
  }

  reply.status(500).send({ error: 'internal_error', message: 'Unexpected error' });
};
