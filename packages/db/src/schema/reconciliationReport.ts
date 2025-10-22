import { relations } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const reconciliationReportStatusEnum = pgEnum('reconciliation_report_status', [
  'pending_review',
  'in_review',
  'resolved',
  'needs_attention'
]);

export const reconciliationReportLedgers = pgTable(
  'reconciliation_report_ledgers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    reportId: text('report_id').notNull(),
    jobId: text('job_id').notNull(),
    contestId: text('contest_id').notNull(),
    chainId: integer('chain_id').notNull(),
    rangeFromBlock: text('range_from_block').notNull(),
    rangeToBlock: text('range_to_block').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    status: reconciliationReportStatusEnum('status').notNull().default('pending_review'),
    attempts: integer('attempts').notNull().default(0),
    differences: jsonb('differences').notNull().default(sql`'[]'::jsonb`),
    notifications: jsonb('notifications').notNull().default(sql`'[]'::jsonb`),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    actorContext: jsonb('actor_context'),
    lastError: jsonb('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex('reconciliation_report_idempotency_key_unique').on(table.idempotencyKey),
    reportIdUnique: uniqueIndex('reconciliation_report_id_unique').on(table.reportId),
    jobIdUnique: uniqueIndex('reconciliation_report_job_id_unique').on(table.jobId),
    statusIdx: index('reconciliation_report_status_idx').on(table.status),
    updatedAtIdx: index('reconciliation_report_updated_at_idx').on(table.updatedAt.desc()),
    contestIdx: index('reconciliation_report_contest_idx').on(table.contestId, table.chainId),
    chainIdNonNegative: check('reconciliation_report_chain_id_non_negative', sql`${table.chainId} >= 0`)
  })
);

export const reconciliationReportRelations = relations(reconciliationReportLedgers, () => ({}));

export type ReconciliationReportLedger = typeof reconciliationReportLedgers.$inferSelect;
export type NewReconciliationReportLedger = typeof reconciliationReportLedgers.$inferInsert;
export type ReconciliationReportStatus = (typeof reconciliationReportStatusEnum.enumValues)[number];
