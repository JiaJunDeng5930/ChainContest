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

export const registerMilestoneModeRoute = (
  app: FastifyInstance,
  dependencies: MilestoneModeRouteDependencies
): void => {
  app.post(
    '/v1/tasks/milestones/actions/mode',
    {
      preHandler: (request, reply, done) => {
        try {
          const maybe = dependencies.authenticate(request, reply);
          if (maybe && typeof (maybe as Promise<void>).then === 'function') {
            (maybe as Promise<void>).then(() => done()).catch(done);
          } else {
            done();
          }
        } catch (err) {
          done(err as Error);
        }
      }
    },
    async (request, reply) => {
      try {
        const body = requestSchema.parse(request.body);
        const result = await dependencies.setContestMode(body);
        await reply.status(200).send({ mode: result.mode });
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
};

const handleError = (error: unknown, reply: FastifyReply): void => {
  if (error instanceof ManualActionError) {
    if (error.code === 'NOT_FOUND') {
      void reply.status(404).send({ error: 'not_found', message: error.message });
      return;
    }

    void reply.status(400).send({ error: 'invalid_state', message: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    void reply.status(400).send({
      error: 'validation_error',
      details: error.flatten()
    });
    return;
  }

  void reply.status(500).send({ error: 'internal_error', message: 'Unexpected error' });
};
