import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerStatusRoutes } from '@indexer-tasks/http/routes/statusRoute';

const noopAuth = async (): Promise<void> => {};

describe('status endpoint', () => {
  it('returns a health snapshot with queue metrics', async () => {
    const buildSnapshot = vi.fn().mockResolvedValue({
      mode: 'live',
      timestamp: new Date('2025-10-22T10:00:00Z'),
      queues: [
        {
          name: 'indexer.milestone',
          pending: 1,
          delayed: 0,
          failed: 0,
          lastSuccessAt: new Date('2025-10-22T09:59:00Z'),
          lastError: null
        }
      ],
      activeAlerts: []
    });

    const app = Fastify();
    await app.register(async (instance) => {
      await registerStatusRoutes(instance, {
        authenticate: noopAuth,
        buildSnapshot
      });
    });

    const response = await app.inject({ method: 'GET', url: '/v1/tasks/status' });

    expect(response.statusCode).toBe(200);
    expect(buildSnapshot).toHaveBeenCalledTimes(1);

    expect(response.json()).toEqual({
      mode: 'live',
      timestamp: '2025-10-22T10:00:00.000Z',
      activeAlerts: [],
      queues: [
        {
          name: 'indexer.milestone',
          pending: 1,
          delayed: 0,
          failed: 0,
          lastSuccessAt: '2025-10-22T09:59:00.000Z',
          lastError: null
        }
      ]
    });
  });
});
