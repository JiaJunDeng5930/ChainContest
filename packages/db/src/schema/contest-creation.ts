import { relations } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { contests } from './contest-domain.js';
import { organizerComponents } from './organizer.js';

export const contestCreationRequests = pgTable(
  'contest_creation_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    networkId: integer('network_id').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    vaultComponentId: uuid('vault_component_id').references(() => organizerComponents.id, {
      onDelete: 'restrict'
    }),
    priceSourceComponentId: uuid('price_source_component_id').references(() => organizerComponents.id, {
      onDelete: 'restrict'
    }),
    status: text('status').notNull().default('accepted'),
    failureReason: jsonb('failure_reason').notNull().default(sql`'{}'::jsonb`),
    transactionHash: text('transaction_hash'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userIdx: index('contest_creation_requests_user_idx').on(table.userId),
    networkIdx: index('contest_creation_requests_network_idx').on(table.networkId),
    createdAtIdx: index('contest_creation_requests_created_at_idx').on(
      table.createdAt.desc(),
      table.id.desc()
    ),
    statusIdx: index('contest_creation_requests_status_idx').on(table.status),
    componentIdx: index('contest_creation_requests_components_idx').on(
      table.vaultComponentId,
      table.priceSourceComponentId
    ),
    networkPositive: check('contest_creation_requests_network_positive', sql`${table.networkId} > 0`),
    statusCheck: check(
      'contest_creation_requests_status_check',
      sql`${table.status} IN ('accepted', 'deploying', 'confirmed', 'failed')`
    ),
    transactionFormat: check(
      'contest_creation_requests_transaction_format',
      sql`${table.transactionHash} IS NULL OR ${table.transactionHash} ~ '^0x[0-9a-fA-F]{64}$'`
    )
  })
);

export const contestDeploymentArtifacts = pgTable(
  'contest_deployment_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => contestCreationRequests.id, { onDelete: 'cascade' }),
    contestId: uuid('contest_id').references(() => contests.id, { onDelete: 'set null' }),
    networkId: integer('network_id').notNull(),
    contestAddress: text('contest_address'),
    vaultFactoryAddress: text('vault_factory_address'),
    registrarAddress: text('registrar_address'),
    treasuryAddress: text('treasury_address'),
    settlementAddress: text('settlement_address'),
    rewardsAddress: text('rewards_address'),
    transactionHash: text('transaction_hash'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    requestUnique: uniqueIndex('contest_deployment_artifacts_request_unique').on(table.requestId),
    contestIdx: index('contest_deployment_artifacts_contest_idx').on(table.contestId),
    networkIdx: index('contest_deployment_artifacts_network_idx').on(table.networkId),
    networkContestUnique: uniqueIndex('contest_deployment_artifacts_network_contest_unique').on(
      table.networkId,
      table.contestAddress
    ),
    networkVaultFactoryUnique: uniqueIndex('contest_deployment_artifacts_network_vault_factory_unique').on(
      table.networkId,
      table.vaultFactoryAddress
    ),
    networkPositive: check('contest_deployment_artifacts_network_positive', sql`${table.networkId} > 0`),
    registrarFormat: check(
      'contest_deployment_artifacts_registrar_format',
      sql`${table.registrarAddress} IS NULL OR ${table.registrarAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    treasuryFormat: check(
      'contest_deployment_artifacts_treasury_format',
      sql`${table.treasuryAddress} IS NULL OR ${table.treasuryAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    settlementFormat: check(
      'contest_deployment_artifacts_settlement_format',
      sql`${table.settlementAddress} IS NULL OR ${table.settlementAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    rewardsFormat: check(
      'contest_deployment_artifacts_rewards_format',
      sql`${table.rewardsAddress} IS NULL OR ${table.rewardsAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    contestAddressFormat: check(
      'contest_deployment_artifacts_contest_address_format',
      sql`${table.contestAddress} IS NULL OR ${table.contestAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    vaultFactoryAddressFormat: check(
      'contest_deployment_artifacts_vault_factory_format',
      sql`${table.vaultFactoryAddress} IS NULL OR ${table.vaultFactoryAddress} ~ '^0x[0-9a-fA-F]{40}$'`
    ),
    transactionHashFormat: check(
      'contest_deployment_artifacts_tx_hash_format',
      sql`${table.transactionHash} IS NULL OR ${table.transactionHash} ~ '^0x[0-9a-fA-F]{64}$'`
    )
  })
);

export const contestCreationRequestRelations = relations(contestCreationRequests, ({ one }) => ({
  artifact: one(contestDeploymentArtifacts, {
    fields: [contestCreationRequests.id],
    references: [contestDeploymentArtifacts.requestId]
  }),
  vaultComponent: one(organizerComponents, {
    fields: [contestCreationRequests.vaultComponentId],
    references: [organizerComponents.id]
  }),
  priceSourceComponent: one(organizerComponents, {
    fields: [contestCreationRequests.priceSourceComponentId],
    references: [organizerComponents.id]
  })
}));

export const contestDeploymentArtifactRelations = relations(contestDeploymentArtifacts, ({ one }) => ({
  request: one(contestCreationRequests, {
    fields: [contestDeploymentArtifacts.requestId],
    references: [contestCreationRequests.id]
  }),
  contest: one(contests, {
    fields: [contestDeploymentArtifacts.contestId],
    references: [contests.id]
  })
}));

export type ContestCreationRequest = typeof contestCreationRequests.$inferSelect;
export type NewContestCreationRequest = typeof contestCreationRequests.$inferInsert;

export type ContestDeploymentArtifact = typeof contestDeploymentArtifacts.$inferSelect;
export type NewContestDeploymentArtifact = typeof contestDeploymentArtifacts.$inferInsert;
