import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from 'drizzle-orm/node-postgres/migrator';

const createOrganizerContracts = sql`
  CREATE TABLE IF NOT EXISTS organizer_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    network_id integer NOT NULL,
    contract_type text NOT NULL,
    address text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organizer_contracts_network_positive CHECK (network_id > 0),
    CONSTRAINT organizer_contracts_address_format CHECK (address ~ '^0x[0-9a-fA-F]{40}$')
  );
`;

const dropOrganizerContracts = sql`DROP TABLE IF EXISTS organizer_contracts;`;

const createOrganizerIndexes = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS organizer_contracts_user_network_type_unique
    ON organizer_contracts (user_id, network_id, contract_type);
  CREATE INDEX IF NOT EXISTS organizer_contracts_user_network_idx
    ON organizer_contracts (user_id, network_id);
`;

const dropOrganizerIndexes = sql`
  DROP INDEX IF EXISTS organizer_contracts_user_network_type_unique;
  DROP INDEX IF EXISTS organizer_contracts_user_network_idx;
`;

const createCreationRequests = sql`
  CREATE TABLE IF NOT EXISTS contest_creation_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    network_id integer NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contest_creation_requests_network_positive CHECK (network_id > 0)
  );
`;

const dropCreationRequests = sql`DROP TABLE IF EXISTS contest_creation_requests;`;

const createCreationRequestIndexes = sql`
  CREATE INDEX IF NOT EXISTS contest_creation_requests_user_idx
    ON contest_creation_requests (user_id);
  CREATE INDEX IF NOT EXISTS contest_creation_requests_network_idx
    ON contest_creation_requests (network_id);
  CREATE INDEX IF NOT EXISTS contest_creation_requests_created_at_idx
    ON contest_creation_requests (created_at DESC, id DESC);
`;

const dropCreationRequestIndexes = sql`
  DROP INDEX IF EXISTS contest_creation_requests_user_idx;
  DROP INDEX IF EXISTS contest_creation_requests_network_idx;
  DROP INDEX IF EXISTS contest_creation_requests_created_at_idx;
`;

const createDeploymentArtifacts = sql`
  CREATE TABLE IF NOT EXISTS contest_deployment_artifacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES contest_creation_requests (id) ON DELETE CASCADE,
    contest_id uuid REFERENCES contests (id) ON DELETE SET NULL,
    network_id integer NOT NULL,
    registrar_address text,
    treasury_address text,
    settlement_address text,
    rewards_address text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contest_deployment_artifacts_network_positive CHECK (network_id > 0),
    CONSTRAINT contest_deployment_artifacts_registrar_format
      CHECK (registrar_address IS NULL OR registrar_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT contest_deployment_artifacts_treasury_format
      CHECK (treasury_address IS NULL OR treasury_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT contest_deployment_artifacts_settlement_format
      CHECK (settlement_address IS NULL OR settlement_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT contest_deployment_artifacts_rewards_format
      CHECK (rewards_address IS NULL OR rewards_address ~ '^0x[0-9a-fA-F]{40}$')
  );
`;

const dropDeploymentArtifacts = sql`DROP TABLE IF EXISTS contest_deployment_artifacts;`;

const createDeploymentIndexes = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS contest_deployment_artifacts_request_unique
    ON contest_deployment_artifacts (request_id);
  CREATE INDEX IF NOT EXISTS contest_deployment_artifacts_contest_idx
    ON contest_deployment_artifacts (contest_id);
  CREATE INDEX IF NOT EXISTS contest_deployment_artifacts_network_idx
    ON contest_deployment_artifacts (network_id);
`;

const dropDeploymentIndexes = sql`
  DROP INDEX IF EXISTS contest_deployment_artifacts_request_unique;
  DROP INDEX IF EXISTS contest_deployment_artifacts_contest_idx;
  DROP INDEX IF EXISTS contest_deployment_artifacts_network_idx;
`;

export const up: MigrationExecutor = async (db) => {
  await db.execute(createOrganizerContracts);
  await db.execute(createOrganizerIndexes);
  await db.execute(createCreationRequests);
  await db.execute(createCreationRequestIndexes);
  await db.execute(createDeploymentArtifacts);
  await db.execute(createDeploymentIndexes);
};

export const down: MigrationExecutor = async (db) => {
  await db.execute(dropDeploymentIndexes);
  await db.execute(dropDeploymentArtifacts);
  await db.execute(dropCreationRequestIndexes);
  await db.execute(dropCreationRequests);
  await db.execute(dropOrganizerIndexes);
  await db.execute(dropOrganizerContracts);
};

export default { up, down };
