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

export const milestoneExecutionStatusEnum = pgEnum('milestone_execution_status', [
  'pending',
  'in_progress',
  'succeeded',
  'retrying',
  'needs_attention'
]);

export const milestoneExecutionRecords = pgTable(
  'milestone_execution_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    jobId: text('job_id').notNull(),
    contestId: text('contest_id').notNull(),
    chainId: integer('chain_id').notNull(),
    milestone: text('milestone').notNull(),
    sourceTxHash: text('source_tx_hash').notNull(),
    sourceLogIndex: integer('source_log_index').notNull(),
    sourceBlockNumber: text('source_block_number').notNull(),
    status: milestoneExecutionStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    lastError: jsonb('last_error'),
    actorContext: jsonb('actor_context'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex('milestone_execution_idempotency_key_unique').on(table.idempotencyKey),
    jobIdUnique: uniqueIndex('milestone_execution_job_id_unique').on(table.jobId),
    uniqueEvent: uniqueIndex('milestone_execution_unique_event').on(
      table.contestId,
      table.chainId,
      table.milestone,
      table.sourceTxHash,
      table.sourceLogIndex
    ),
    statusIdx: index('milestone_execution_status_idx').on(table.status),
    updatedAtIdx: index('milestone_execution_updated_at_idx').on(table.updatedAt.desc()),
    txHashFormat: check(
      'milestone_execution_tx_hash_format',
      sql`${table.sourceTxHash} ~ '^0x[0-9a-fA-F]{64}$'`
    ),
    sourceLogIndexNonNegative: check('milestone_execution_source_log_index_non_negative', sql`${table.sourceLogIndex} >= 0`),
    chainIdNonNegative: check('milestone_execution_chain_id_non_negative', sql`${table.chainId} >= 0`)
  })
);

export const milestoneExecutionRelations = relations(milestoneExecutionRecords, () => ({}));

export type MilestoneExecutionRecord = typeof milestoneExecutionRecords.$inferSelect;
export type NewMilestoneExecutionRecord = typeof milestoneExecutionRecords.$inferInsert;
export type MilestoneExecutionStatus = (typeof milestoneExecutionStatusEnum.enumValues)[number];
