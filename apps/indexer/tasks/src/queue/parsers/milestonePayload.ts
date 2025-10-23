import { z } from 'zod';
import type { MilestonePayload } from '../../services/milestoneProcessor.js';
import { buildMilestoneIdempotencyKey } from '../../services/milestoneIdempotency.js';

const BASE_PAYLOAD_SCHEMA = z
  .object({
    contestId: z.string().min(1, 'contestId is required'),
    chainId: z.coerce.number().int().min(0, 'chainId must be non-negative'),
    milestone: z.string().min(1, 'milestone is required'),
    payload: z.record(z.string(), z.unknown()).default({}),
    generatedAt: z.union([z.string(), z.date()]).optional(),
    sourceTxHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, 'sourceTxHash must be a 32-byte hex string prefixed with 0x')
      .optional(),
    sourceLogIndex: z.coerce.number().int().min(0, 'sourceLogIndex must be non-negative').optional(),
    sourceBlockNumber: z
      .union([z.string(), z.number(), z.bigint()])
      .transform((value) => value.toString())
      .optional(),
    sourceEvent: z
      .object({
        txHash: z
          .string()
          .regex(/^0x[0-9a-fA-F]{64}$/, 'sourceEvent.txHash must be a 32-byte hex string prefixed with 0x'),
        logIndex: z.coerce.number().int().min(0, 'sourceEvent.logIndex must be non-negative'),
        blockNumber: z
          .union([z.string(), z.number(), z.bigint()])
          .transform((value) => value.toString())
      })
      .optional()
  })
  .catchall(z.unknown())
  .superRefine((value, ctx) => {
    const hasTopLevelSource =
      value.sourceTxHash !== undefined &&
      value.sourceLogIndex !== undefined &&
      value.sourceBlockNumber !== undefined;
    const hasSourceEvent = value.sourceEvent !== undefined;

    if (!hasTopLevelSource && !hasSourceEvent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceEvent'],
        message: 'sourceEvent is required when top-level source fields are missing'
      });
    }
  });

export interface ParsedMilestonePayload {
  payload: MilestonePayload;
  idempotencyKey: string;
}

export const parseMilestonePayload = (raw: unknown): ParsedMilestonePayload => {
  const parsed = BASE_PAYLOAD_SCHEMA.parse(raw);

  const sourceTxHash = parsed.sourceTxHash ?? parsed.sourceEvent?.txHash;
  const sourceLogIndex = parsed.sourceLogIndex ?? parsed.sourceEvent?.logIndex;
  const sourceBlockNumber = parsed.sourceBlockNumber ?? parsed.sourceEvent?.blockNumber;

  if (!sourceTxHash || sourceLogIndex === undefined || sourceBlockNumber === undefined) {
    throw new Error('milestone payload is missing required source event information');
  }

  const payload: MilestonePayload = {
    contestId: parsed.contestId,
    chainId: parsed.chainId,
    milestone: parsed.milestone,
    sourceTxHash,
    sourceLogIndex,
    sourceBlockNumber,
    payload: parsed.payload
  };

  return {
    payload,
    idempotencyKey: buildMilestoneIdempotencyKey(payload)
  };
};
