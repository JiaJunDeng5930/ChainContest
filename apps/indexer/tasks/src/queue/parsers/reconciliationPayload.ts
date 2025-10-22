import { z } from 'zod';
import { buildReconciliationIdempotencyKey } from '../../services/reconciliationProcessor.js';

const NOTIFICATION_SCHEMA = z
  .object({
    channel: z.string().min(1, 'notification channel is required'),
    target: z.string().min(1).optional(),
    template: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const BASE_PAYLOAD_SCHEMA = z
  .object({
    reportId: z.string().min(1, 'reportId is required'),
    contestId: z.string().min(1, 'contestId is required'),
    chainId: z.coerce.number().int().min(0, 'chainId must be non-negative'),
    rangeFromBlock: z.union([z.string(), z.number(), z.bigint()]).transform((value) => value.toString()),
    rangeToBlock: z.union([z.string(), z.number(), z.bigint()]).transform((value) => value.toString()),
    generatedAt: z
      .union([z.string(), z.date()])
      .transform((value) => (value instanceof Date ? value : new Date(value))),
    differences: z.array(z.unknown()).default([]),
    notifications: z.array(NOTIFICATION_SCHEMA).default([]),
    metadata: z.record(z.string(), z.unknown()).optional(),
    payload: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export interface NotificationTarget {
  channel: string;
  target?: string;
  template?: string;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationPayload {
  reportId: string;
  contestId: string;
  chainId: number;
  rangeFromBlock: string;
  rangeToBlock: string;
  generatedAt: Date;
  differences: unknown[];
  notifications: NotificationTarget[];
  metadata?: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface ParsedReconciliationPayload {
  payload: ReconciliationPayload;
  idempotencyKey: string;
}

export const parseReconciliationPayload = (raw: unknown): ParsedReconciliationPayload => {
  const parsed = BASE_PAYLOAD_SCHEMA.parse(raw);

  if (Number.isNaN(parsed.generatedAt.getTime())) {
    throw new Error('generatedAt is not a valid date value');
  }

  const payload: ReconciliationPayload = {
    reportId: parsed.reportId,
    contestId: parsed.contestId,
    chainId: parsed.chainId,
    rangeFromBlock: parsed.rangeFromBlock,
    rangeToBlock: parsed.rangeToBlock,
    generatedAt: parsed.generatedAt,
    differences: parsed.differences,
    notifications: parsed.notifications,
    metadata: parsed.metadata,
    payload: parsed.payload ?? {}
  };

  return {
    payload,
    idempotencyKey: buildReconciliationIdempotencyKey(payload)
  };
};
