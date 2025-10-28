import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export const authUsers = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name'),
    email: text('email'),
    emailVerified: timestamp('emailVerified', { withTimezone: true }),
    image: text('image')
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email)
  })
);

export const authSessions = pgTable(
  'sessions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().default(sql`nextval('sessions_id_seq')`),
    sessionToken: text('sessionToken').notNull(),
    userId: uuid('userId')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { withTimezone: true }).notNull()
  },
  (table) => ({
    sessionTokenUnique: uniqueIndex('sessions_session_token_unique').on(table.sessionToken),
    userIndex: index('sessions_user_idx').on(table.userId)
  })
);

export const authAccounts = pgTable(
  'accounts',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().default(sql`nextval('accounts_id_seq')`),
    userId: uuid('userId')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: bigint('expires_at', { mode: 'number' }),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state')
  },
  (table) => ({
    providerAccountUnique: uniqueIndex('accounts_provider_providerAccountId_unique').on(
      table.provider,
      table.providerAccountId
    ),
    userIndex: index('accounts_user_idx').on(table.userId)
  })
);

export const authVerificationTokens = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull()
  },
  (table) => ({
    compositePk: primaryKey({
      columns: [table.identifier, table.token],
      name: 'verification_token_pkey'
    })
  })
);

export const authUserRelations = relations(authUsers, ({ many }) => ({
  accounts: many(authAccounts),
  sessions: many(authSessions)
}));

export const authAccountRelations = relations(authAccounts, ({ one }) => ({
  user: one(authUsers, {
    fields: [authAccounts.userId],
    references: [authUsers.id]
  })
}));

export const authSessionRelations = relations(authSessions, ({ one }) => ({
  user: one(authUsers, {
    fields: [authSessions.userId],
    references: [authUsers.id]
  })
}));
