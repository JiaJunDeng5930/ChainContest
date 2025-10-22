import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { MilestoneModeRequest, MilestoneMode } from '../../services/milestoneControl.js';
import { ManualActionError } from '../../services/milestoneControl.js';

const requestSchema = z.object({
  contestId: z.string().min(1),
  chainId: z.coerce.number().int().min(0),
  mode: z.enum(['live', 'paused']),
  actor: z.string().min(1),
  reason: z.string().optional()
});

export interface MilestoneModeRouteDependencies {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;
  setContestMode: (request: MilestoneModeRequest) => { mode: MilestoneMode } | Promise<{ mode: MilestoneMode }>;
}

export const registerMilestoneModeRoute = async (
  app: FastifyInstance,
  dependencies: MilestoneModeRouteDependencies
): Promise<void> => {
  app.post(
    '/v1/tasks/milestones/actions/mode',
    {
      preHandler: dependencies.authenticate
    },
    async (request, reply) => {
      try {
        const body = requestSchema.parse(request.body);
        const result = await dependencies.setContestMode(body);
        reply.status(200).send({ mode: result.mode });
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
