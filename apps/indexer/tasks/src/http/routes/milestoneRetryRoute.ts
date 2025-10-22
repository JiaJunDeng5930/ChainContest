import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RetryMilestoneRequest } from '../../services/milestoneControl.js';
import { ManualActionError } from '../../services/milestoneControl.js';

const requestSchema = z.object({
  contestId: z.string().min(1),
  chainId: z.coerce.number().int().min(0),
  milestone: z.string().min(1),
  sourceTxHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'sourceTxHash must be a 32-byte hex string prefixed with 0x'),
  sourceLogIndex: z.coerce.number().int().min(0),
  actor: z.string().min(1),
  reason: z.string().optional()
});

export interface MilestoneRetryRouteDependencies {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;
  retryMilestone: (request: RetryMilestoneRequest) => Promise<{ queued: boolean }>;
}

export const registerMilestoneRetryRoute = async (
  app: FastifyInstance,
  dependencies: MilestoneRetryRouteDependencies
): Promise<void> => {
  app.post(
    '/v1/tasks/milestones/actions/retry',
    {
      preHandler: dependencies.authenticate
    },
    async (request, reply) => {
      try {
        const body = requestSchema.parse(request.body);
        await dependencies.retryMilestone(body);
        reply.status(202).send({ status: 'accepted' });
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

    if (error.code === 'CONFLICT') {
      reply.status(409).send({ error: 'conflict', message: error.message });
      return;
    }

    reply.status(400).send({ error: 'invalid_state', message: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.status(400).send({
      error: 'validation_error',
      details: error.flatten()
    });
    return;
  }

  reply.status(500).send({ error: 'internal_error', message: 'Unexpected error' });
};
