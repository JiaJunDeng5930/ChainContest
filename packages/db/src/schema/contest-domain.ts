import { relations } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const contestStatusEnum = pgEnum('contest_status', ['registered', 'active', 'sealed', 'settled']);

export const contestOriginEnum = pgEnum('contest_origin_tag', ['factory', 'imported']);

export const contests = pgTable(
  'contests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chainId: integer('chain_id').notNull(),
    contractAddress: text('contract_address').notNull(),
    internalKey: text('internal_key'),
    status: contestStatusEnum('status').default('registered').notNull(),
    timeWindowStart: timestamp('time_window_start', { withTimezone: true }).notNull(),
    timeWindowEnd: timestamp('time_window_end', { withTimezone: true }).notNull(),
    originTag: contestOriginEnum('origin_tag').default('factory').notNull(),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    uniqueContract: uniqueIndex('contests_chain_contract_unique').on(table.chainId, table.contractAddress),
    internalKeyUnique: uniqueIndex('contests_internal_key_unique').on(table.internalKey),
    statusWindowIdx: index('contests_status_window_idx').on(
      table.status,
      table.timeWindowStart,
      table.timeWindowEnd
    ),
    contractAddressFormat: check(
      'contests_contract_address_format',
      sql`${table.contractAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    windowOrder: check(
      'contests_time_window_order',
      sql`${table.timeWindowStart} <= ${table.timeWindowEnd}`
    )
  })
);

export const contestSnapshots = pgTable(
  'contest_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    cursorHeight: bigint('cursor_height', { mode: 'bigint' }).notNull(),
    payload: jsonb('payload').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    uniqueCursor: uniqueIndex('contest_snapshots_cursor_unique').on(table.contestId, table.cursorHeight),
    contestTimelineIdx: index('contest_snapshots_effective_idx').on(
      table.contestId,
      table.effectiveAt.desc()
    )
  })
);

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    walletAddress: text('wallet_address').notNull(),
    vaultReference: text('vault_reference'),
    amountWei: numeric('amount_wei', { precision: 78, scale: 0 }).notNull().default('0'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    eventLocator: jsonb('event_locator').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    walletFormat: check('participants_wallet_format', sql`${table.walletAddress} ~ '^0x[0-9a-fA-F]{40}$'`),
    amountNonNegative: check('participants_amount_non_negative', sql`${table.amountWei} >= 0`),
    eventLocatorShape: check(
      'participants_event_locator_shape',
      sql`${table.eventLocator} ? 'tx_hash' AND ${table.eventLocator} ? 'log_index'`
    ),
    uniqueEvent: uniqueIndex('participants_event_unique').on(
      table.contestId,
      sql`(event_locator ->> 'tx_hash')`,
      sql`(event_locator ->> 'log_index')`
    ),
    contestTimelineIdx: index('participants_contest_time_idx').on(table.contestId, table.occurredAt),
    walletIdx: index('participants_wallet_idx').on(table.walletAddress)
  })
);

export const leaderboardVersions = pgTable(
  'leaderboard_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    version: bigint('version', { mode: 'bigint' }).notNull(),
    entries: jsonb('entries').notNull(),
    writtenAt: timestamp('written_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    uniqueVersion: uniqueIndex('leaderboard_versions_unique').on(table.contestId, table.version),
    timelineIdx: index('leaderboard_versions_written_idx').on(table.contestId, table.writtenAt.desc())
  })
);

export const rewardClaims = pgTable(
  'reward_claims',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    walletAddress: text('wallet_address').notNull(),
    amountWei: numeric('amount_wei', { precision: 78, scale: 0 }).notNull().default('0'),
    eventLocator: jsonb('event_locator').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    walletFormat: check('reward_claims_wallet_format', sql`${table.walletAddress} ~ '^0x[0-9a-fA-F]{40}$'`),
    eventLocatorShape: check(
      'reward_claims_event_locator_shape',
      sql`${table.eventLocator} ? 'tx_hash' AND ${table.eventLocator} ? 'log_index'`
    ),
    uniqueEvent: uniqueIndex('reward_claims_event_unique').on(
      table.contestId,
      sql`(event_locator ->> 'tx_hash')`,
      sql`(event_locator ->> 'log_index')`
    ),
    contestTimelineIdx: index('reward_claims_claimed_idx').on(table.contestId, table.claimedAt),
    walletIdx: index('reward_claims_wallet_idx').on(table.walletAddress)
  })
);

export const contestRelations = relations(contests, ({ many }) => ({
  snapshots: many(contestSnapshots),
  participants: many(participants),
  leaderboardVersions: many(leaderboardVersions),
  rewardClaims: many(rewardClaims)
}));

export const participantRelations = relations(participants, ({ one }) => ({
  contest: one(contests, {
    fields: [participants.contestId],
    references: [contests.id]
  })
}));

export const rewardClaimRelations = relations(rewardClaims, ({ one }) => ({
  contest: one(contests, {
    fields: [rewardClaims.contestId],
    references: [contests.id]
  })
}));

export const leaderboardRelations = relations(leaderboardVersions, ({ one }) => ({
  contest: one(contests, {
    fields: [leaderboardVersions.contestId],
    references: [contests.id]
  })
}));

export const contestSnapshotRelations = relations(contestSnapshots, ({ one }) => ({
  contest: one(contests, {
    fields: [contestSnapshots.contestId],
    references: [contests.id]
  })
}));

export type Contest = typeof contests.$inferSelect;
export type NewContest = typeof contests.$inferInsert;

export type ContestSnapshot = typeof contestSnapshots.$inferSelect;
export type NewContestSnapshot = typeof contestSnapshots.$inferInsert;

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;

export type LeaderboardVersion = typeof leaderboardVersions.$inferSelect;
export type NewLeaderboardVersion = typeof leaderboardVersions.$inferInsert;

export type RewardClaim = typeof rewardClaims.$inferSelect;
export type NewRewardClaim = typeof rewardClaims.$inferInsert;
