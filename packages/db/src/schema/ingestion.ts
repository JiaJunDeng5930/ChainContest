import { relations } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contests } from './contest-domain.js';

export const ingestionCursors = pgTable(
  'ingestion_cursors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
    contractAddress: text('contract_address').notNull(),
    cursorHeight: bigint('cursor_height', { mode: 'bigint' }).notNull(),
    cursorLogIndex: integer('cursor_log_index').notNull().default(0),
    cursorHash: text('cursor_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    uniqueContest: uniqueIndex('ingestion_cursors_contest_unique').on(table.contestId),
    uniqueLocator: uniqueIndex('ingestion_cursors_locator_unique').on(table.chainId, table.contractAddress),
    contractFormat: check(
      'ingestion_cursors_contract_format',
      sql`${table.contractAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    )
  })
);

export const ingestionEvents = pgTable(
  'ingestion_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    uniqueEvent: uniqueIndex('ingestion_events_unique').on(table.chainId, table.txHash, table.logIndex),
    contestIndex: index('ingestion_events_contest_idx').on(table.contestId, table.occurredAt),
    hashFormat: check('ingestion_events_hash_format', sql`${table.txHash} ~ '^0x[0-9a-fA-F]{64}$'`)
  })
);

export const ingestionCursorRelations = relations(ingestionCursors, ({ one }) => ({
  contest: one(contests, {
    fields: [ingestionCursors.contestId],
    references: [contests.id]
  })
}));

export const ingestionEventRelations = relations(ingestionEvents, ({ one }) => ({
  contest: one(contests, {
    fields: [ingestionEvents.contestId],
    references: [contests.id]
  })
}));

export type IngestionCursor = typeof ingestionCursors.$inferSelect;
export type NewIngestionCursor = typeof ingestionCursors.$inferInsert;

export type IngestionEvent = typeof ingestionEvents.$inferSelect;
export type NewIngestionEvent = typeof ingestionEvents.$inferInsert;
