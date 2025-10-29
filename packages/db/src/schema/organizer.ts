import { relations } from 'drizzle-orm';
import { check, jsonb, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contestCreationRequests } from './contest-creation.js';

export const organizerComponents = pgTable(
  'organizer_components',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    walletAddress: text('wallet_address'),
    networkId: integer('network_id').notNull(),
    componentType: text('component_type').notNull(),
    contractAddress: text('contract_address').notNull(),
    configHash: text('config_hash').notNull(),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    transactionHash: text('transaction_hash'),
    status: text('status').notNull().default('pending'),
    failureReason: jsonb('failure_reason').notNull().default(sql`'{}'::jsonb`),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userNetworkTypeHashUnique: uniqueIndex('organizer_components_user_network_type_hash_unique').on(
      table.userId,
      table.networkId,
      table.componentType,
      table.configHash
    ),
    networkContractUnique: uniqueIndex('organizer_components_network_contract_unique').on(
      table.networkId,
      table.contractAddress
    ),
    networkPositive: check('organizer_components_network_positive', sql`${table.networkId} > 0`),
    componentTypeCheck: check(
      'organizer_components_component_type',
      sql`${table.componentType} IN ('vault_implementation', 'price_source')`
    ),
    contractFormat: check(
      'organizer_components_contract_format',
      sql`${table.contractAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    walletFormat: check(
      'organizer_components_wallet_format',
      sql`${table.walletAddress} IS NULL OR ${table.walletAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    transactionFormat: check(
      'organizer_components_transaction_format',
      sql`${table.transactionHash} IS NULL OR ${table.transactionHash} ~ '^0x[0-9a-fA-F]{64}$'`
    ),
    statusCheck: check(
      'organizer_components_status',
      sql`${table.status} IN ('pending', 'confirmed', 'failed')`
    )
  })
);

export const organizerComponentRelations = relations(organizerComponents, ({ many }) => ({
  creationRequests: many(contestCreationRequests)
}));

export type OrganizerComponent = typeof organizerComponents.$inferSelect;
export type NewOrganizerComponent = typeof organizerComponents.$inferInsert;
