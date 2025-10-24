import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TaskServiceHealthSnapshot } from '../../telemetry/healthSnapshot.js';

export interface StatusRouteDependencies {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;
  buildSnapshot: () => Promise<TaskServiceHealthSnapshot>;
}

export const registerStatusRoutes = (
  app: FastifyInstance,
  dependencies: StatusRouteDependencies
): void => {
  app.get(
    '/v1/tasks/status',
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
    async (_request, reply) => {
      const snapshot = await dependencies.buildSnapshot();
      void reply.send(serialiseSnapshot(snapshot));
    }
  );
};

const serialiseSnapshot = (snapshot: TaskServiceHealthSnapshot) => ({
  mode: snapshot.mode,
  timestamp: snapshot.timestamp.toISOString(),
  activeAlerts: snapshot.activeAlerts,
  queues: snapshot.queues.map((queue) => ({
    name: queue.name,
    pending: queue.pending,
    delayed: queue.delayed,
    failed: queue.failed,
    active: queue.active,
    lastSuccessAt: queue.lastSuccessAt ? queue.lastSuccessAt.toISOString() : null,
    lastError: queue.lastError
  }))
});
