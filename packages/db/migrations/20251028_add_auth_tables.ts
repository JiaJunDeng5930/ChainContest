import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from 'drizzle-orm/node-postgres/migrator';

const dropLegacyTables = sql`
  DROP TABLE IF EXISTS verification_tokens;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS accounts;
  DROP TABLE IF EXISTS users;
`;

const createUsers = sql`
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text,
    email text UNIQUE,
    "emailVerified" timestamptz,
    image text
  );
`;

const dropUsers = sql`DROP TABLE IF EXISTS users;`;

const createAccounts = sql`
  CREATE TABLE IF NOT EXISTS accounts (
    id bigserial PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    access_token text,
    expires_at bigint,
    refresh_token text,
    id_token text,
    scope text,
    session_state text,
    token_type text,
    CONSTRAINT accounts_provider_providerAccountId_unique UNIQUE (provider, "providerAccountId")
  );

  CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts ("userId");
`;

const dropAccounts = sql`
  DROP INDEX IF EXISTS accounts_user_idx;
  DROP TABLE IF EXISTS accounts;
`;

const createSessions = sql`
  CREATE TABLE IF NOT EXISTS sessions (
    id bigserial PRIMARY KEY,
    "sessionToken" text NOT NULL UNIQUE,
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires timestamptz NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions ("userId");
`;

const dropSessions = sql`
  DROP INDEX IF EXISTS sessions_user_idx;
  DROP TABLE IF EXISTS sessions;
`;

const createVerificationTokens = sql`
  CREATE TABLE IF NOT EXISTS verification_token (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamptz NOT NULL,
    CONSTRAINT verification_token_pkey PRIMARY KEY (identifier, token)
  );
`;

const dropVerificationTokens = sql`DROP TABLE IF EXISTS verification_token;`;

export const up: MigrationExecutor = async (db) => {
  await db.execute(dropLegacyTables);
  await db.execute(createUsers);
  await db.execute(createAccounts);
  await db.execute(createSessions);
  await db.execute(createVerificationTokens);
};

export const down: MigrationExecutor = async (db) => {
  await db.execute(dropVerificationTokens);
  await db.execute(dropSessions);
  await db.execute(dropAccounts);
  await db.execute(dropUsers);
};

export default { up, down };
