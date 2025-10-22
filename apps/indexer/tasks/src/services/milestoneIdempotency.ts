import type { MilestonePayload } from './milestoneProcessor.js';

export interface IdempotencyContext {
  maxAttempts: number;
}

const IDEMPOTENCY_PREFIX = 'milestone';

export const buildMilestoneIdempotencyKey = (payload: MilestonePayload): string => {
  const components = [
    IDEMPOTENCY_PREFIX,
    payload.contestId,
    String(payload.chainId),
    payload.milestone,
    payload.sourceTxHash.toLowerCase(),
    String(payload.sourceLogIndex)
  ];

  return components.join(':');
};

export const shouldEscalateToNeedsAttention = (
  attempt: number,
  context: IdempotencyContext
): boolean => attempt >= context.maxAttempts;
