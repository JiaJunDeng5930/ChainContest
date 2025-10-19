import { relations } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const walletSourceEnum = pgEnum('wallet_binding_source', ['manual', 'auto_inferred', 'imported']);

export const userIdentityStatusEnum = pgEnum('user_identity_status', ['active', 'suspended', 'blocked']);

export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull(),
    status: userIdentityStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by')
  },
  (table) => ({
    externalIdKey: uniqueIndex('user_identities_external_id_idx').on(table.externalId)
  })
);

export const walletBindings = pgTable(
  'wallet_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => userIdentities.id, { onDelete: 'restrict' }),
    walletAddress: text('wallet_address').notNull(),
    walletAddressChecksum: text('wallet_address_checksum').notNull(),
    source: walletSourceEnum('source').notNull(),
    boundAt: timestamp('bound_at', { withTimezone: true }).defaultNow().notNull(),
    unboundAt: timestamp('unbound_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    unboundBy: text('unbound_by')
  },
  (table) => ({
    walletActiveUnique: uniqueIndex('wallet_bindings_wallet_active_unique')
      .on(table.walletAddress)
      .where(sql`${table.unboundAt} IS NULL`),
    userIndex: index('wallet_bindings_user_idx').on(table.userId),
    walletIdx: index('wallet_bindings_wallet_idx').on(table.walletAddress),
    walletFormat: check('wallet_bindings_wallet_format', sql`wallet_address ~ '^0x[0-9a-fA-F]{40}$'`),
    unboundAfterBound: check(
      'wallet_bindings_unbound_after_bound',
      sql`unbound_at IS NULL OR unbound_at >= bound_at`
    )
  })
);

export const userIdentityRelations = relations(userIdentities, ({ many }) => ({
  walletBindings: many(walletBindings)
}));

export const walletBindingRelations = relations(walletBindings, ({ one }) => ({
  user: one(userIdentities, {
    fields: [walletBindings.userId],
    references: [userIdentities.id]
  })
}));

export type UserIdentity = typeof userIdentities.$inferSelect;
export type NewUserIdentity = typeof userIdentities.$inferInsert;

export type WalletBinding = typeof walletBindings.$inferSelect;
export type NewWalletBinding = typeof walletBindings.$inferInsert;
