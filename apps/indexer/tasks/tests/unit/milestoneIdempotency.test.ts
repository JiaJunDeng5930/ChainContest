import { describe, expect, it } from 'vitest';
import {
  buildMilestoneIdempotencyKey,
  shouldEscalateToNeedsAttention
} from '@indexer-tasks/services/milestoneIdempotency';
import type { MilestonePayload } from '@indexer-tasks/services/milestoneProcessor';

const basePayload: MilestonePayload = {
  contestId: 'contest-123',
  chainId: 10,
  milestone: 'settled',
  sourceTxHash: '0x' + '1'.repeat(64),
  sourceLogIndex: 0,
  sourceBlockNumber: '123',
  payload: { foo: 'bar' }
};

describe('milestone idempotency', () => {
  it('builds a deterministic idempotency key', () => {
    const keyA = buildMilestoneIdempotencyKey(basePayload);
    const keyB = buildMilestoneIdempotencyKey({ ...basePayload, payload: { foo: 'baz' } });

    expect(keyA).toBe(keyB);
    expect(keyA).toContain(basePayload.contestId);
    expect(keyA).toContain(String(basePayload.chainId));
  });

  it('produces unique keys for distinct milestones', () => {
    const keyA = buildMilestoneIdempotencyKey(basePayload);
    const keyB = buildMilestoneIdempotencyKey({ ...basePayload, milestone: 'reward_ready' });

    expect(keyA).not.toBe(keyB);
  });

  it('escalates to needs_attention when attempts exceed max retries', () => {
    expect(shouldEscalateToNeedsAttention(0, { maxAttempts: 3 })).toBe(false);
    expect(shouldEscalateToNeedsAttention(2, { maxAttempts: 3 })).toBe(false);
    expect(shouldEscalateToNeedsAttention(3, { maxAttempts: 3 })).toBe(true);
    expect(shouldEscalateToNeedsAttention(5, { maxAttempts: 3 })).toBe(true);
  });
});
