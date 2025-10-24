import { relations } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, jsonb, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contestCreationRequests } from './contest-creation.js';

export const organizerContracts = pgTable(
  'organizer_contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    networkId: integer('network_id').notNull(),
    contractType: text('contract_type').notNull(),
    address: text('address').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userNetworkTypeUnique: uniqueIndex('organizer_contracts_user_network_type_unique').on(
      table.userId,
      table.networkId,
      table.contractType
    ),
    userNetworkIdx: index('organizer_contracts_user_network_idx').on(table.userId, table.networkId),
    networkPositive: check('organizer_contracts_network_positive', sql`${table.networkId} > 0`),
    addressFormat: check(
      'organizer_contracts_address_format',
      sql`${table.address} ~ '^0x[0-9a-fA-F]{40}$'`
    )
  })
);

export const organizerContractRelations = relations(organizerContracts, ({ many }) => ({
  creationRequests: many(contestCreationRequests)
}));

export type OrganizerContract = typeof organizerContracts.$inferSelect;
export type NewOrganizerContract = typeof organizerContracts.$inferInsert;
