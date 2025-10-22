import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerMilestoneRetryRoute } from '@indexer-tasks/http/routes/milestoneRetryRoute';
import { registerMilestoneModeRoute } from '@indexer-tasks/http/routes/milestoneModeRoute';
import { ManualActionError } from '@indexer-tasks/services/milestoneControl';

const noopAuth = async (): Promise<void> => {};

describe('manual milestone operations', () => {
  it('enqueues a milestone retry request', async () => {
    const retryMilestone = vi.fn().mockResolvedValue({ queued: true });

    const app = Fastify();
    await app.register(async (instance) => {
      await registerMilestoneRetryRoute(instance, {
        authenticate: noopAuth,
        retryMilestone
      });
    });

    const payload = {
      contestId: 'contest-a',
      chainId: 11155111,
      milestone: 'settled',
      sourceTxHash: '0x' + 'd'.repeat(64),
      sourceLogIndex: 12,
      actor: 'ops-user',
      reason: 'manual retry after investigation'
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tasks/milestones/actions/retry',
      payload
    });

    expect(response.statusCode).toBe(202);
    expect(retryMilestone).toHaveBeenCalledWith(expect.objectContaining({
      contestId: payload.contestId,
      actor: payload.actor
    }));
  });

  it('maps known service errors to HTTP responses', async () => {
    const retryMilestone = vi
      .fn()
      .mockRejectedValue(new ManualActionError('not found', 'NOT_FOUND'));

    const app = Fastify();
    await app.register(async (instance) => {
      await registerMilestoneRetryRoute(instance, {
        authenticate: noopAuth,
        retryMilestone
      });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tasks/milestones/actions/retry',
      payload: {
        contestId: 'contest-missing',
        chainId: 111,
        milestone: 'settled',
        sourceTxHash: '0x' + 'a'.repeat(64),
        sourceLogIndex: 1,
        actor: 'ops-user'
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it('updates milestone mode with audit context', async () => {
    const setContestMode = vi.fn().mockResolvedValue({ mode: 'paused' });

    const app = Fastify();
    await app.register(async (instance) => {
      await registerMilestoneModeRoute(instance, {
        authenticate: noopAuth,
        setContestMode
      });
    });

    const payload = {
      contestId: 'contest-a',
      chainId: 11155111,
      mode: 'paused',
      actor: 'ops-user',
      reason: 'chain replay in progress'
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/tasks/milestones/actions/mode',
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(setContestMode).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'paused',
      actor: 'ops-user'
    }));
    expect(response.json()).toEqual({
      mode: 'paused'
    });
  });
});
