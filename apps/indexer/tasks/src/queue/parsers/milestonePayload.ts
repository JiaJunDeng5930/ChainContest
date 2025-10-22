import { z } from 'zod';
import type { MilestonePayload } from '../../services/milestoneProcessor.js';
import { buildMilestoneIdempotencyKey } from '../../services/milestoneIdempotency.js';

const BASE_PAYLOAD_SCHEMA = z
  .object({
    contestId: z.string().min(1, 'contestId is required'),
    chainId: z.coerce.number().int().min(0, 'chainId must be non-negative'),
    milestone: z.string().min(1, 'milestone is required'),
    sourceTxHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, 'sourceTxHash must be a 32-byte hex string prefixed with 0x'),
    sourceLogIndex: z.coerce.number().int().min(0, 'sourceLogIndex must be non-negative'),
    sourceBlockNumber: z
      .union([z.string(), z.number(), z.bigint()])
      .transform((value) => value.toString()),
    payload: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

export interface ParsedMilestonePayload {
  payload: MilestonePayload;
  idempotencyKey: string;
}

export const parseMilestonePayload = (raw: unknown): ParsedMilestonePayload => {
  const parsed = BASE_PAYLOAD_SCHEMA.parse(raw);

  const payload: MilestonePayload = {
    contestId: parsed.contestId,
    chainId: parsed.chainId,
    milestone: parsed.milestone,
    sourceTxHash: parsed.sourceTxHash,
    sourceLogIndex: parsed.sourceLogIndex,
    sourceBlockNumber: parsed.sourceBlockNumber,
    payload: parsed.payload
  };

  return {
    payload,
    idempotencyKey: buildMilestoneIdempotencyKey(payload)
  };
};
