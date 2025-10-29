import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from 'drizzle-orm/node-postgres/migrator';

const createOrganizerComponents = sql`
  CREATE TABLE IF NOT EXISTS organizer_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    wallet_address text,
    network_id integer NOT NULL,
    component_type text NOT NULL,
    contract_address text NOT NULL,
    config_hash text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    transaction_hash text,
    status text NOT NULL DEFAULT 'pending',
    failure_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organizer_components_network_positive CHECK (network_id > 0),
    CONSTRAINT organizer_components_component_type CHECK (component_type IN ('vault_implementation', 'price_source')),
    CONSTRAINT organizer_components_contract_format CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT organizer_components_wallet_format CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    CONSTRAINT organizer_components_transaction_format CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    CONSTRAINT organizer_components_status CHECK (status IN ('pending', 'confirmed', 'failed'))
  );
`;

const createOrganizerComponentIndexes = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS organizer_components_user_network_type_hash_unique
    ON organizer_components (user_id, network_id, component_type, config_hash);
  CREATE UNIQUE INDEX IF NOT EXISTS organizer_components_network_contract_unique
    ON organizer_components (network_id, contract_address);
  CREATE INDEX IF NOT EXISTS organizer_components_pending_idx
    ON organizer_components (network_id)
    WHERE status = 'pending';
`;

const migrateOrganizerContracts = sql`
  INSERT INTO organizer_components (id, user_id, network_id, component_type, contract_address, config_hash, config, status, created_at, updated_at)
  SELECT
    id,
    user_id,
    network_id,
    contract_type,
    address,
    md5(metadata::text),
    metadata,
    'confirmed',
    created_at,
    updated_at
  FROM organizer_contracts
  ON CONFLICT DO NOTHING;
`;

const dropOrganizerContractsTable = sql`DROP TABLE IF EXISTS organizer_contracts;`;

const dropOrganizerComponentIndexes = sql`
  DROP INDEX IF EXISTS organizer_components_pending_idx;
  DROP INDEX IF EXISTS organizer_components_network_contract_unique;
  DROP INDEX IF EXISTS organizer_components_user_network_type_hash_unique;
`;

const dropOrganizerComponents = sql`DROP TABLE IF EXISTS organizer_components;`;

const createContestCreationAugments = sql`
  ALTER TABLE contest_creation_requests
    ADD COLUMN IF NOT EXISTS vault_component_id uuid REFERENCES organizer_components (id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS price_source_component_id uuid REFERENCES organizer_components (id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
    ADD COLUMN IF NOT EXISTS failure_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS transaction_hash text,
    ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
    ADD CONSTRAINT contest_creation_requests_status_check CHECK (status IN ('accepted', 'deploying', 'confirmed', 'failed')),
    ADD CONSTRAINT contest_creation_requests_transaction_format CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-fA-F]{64}$');
`;

const dropContestCreationConstraints = sql`
  ALTER TABLE contest_creation_requests DROP CONSTRAINT IF EXISTS contest_creation_requests_status_check;
  ALTER TABLE contest_creation_requests DROP CONSTRAINT IF EXISTS contest_creation_requests_transaction_format;
`;

const dropContestCreationColumns = sql`
  ALTER TABLE contest_creation_requests
    DROP COLUMN IF EXISTS confirmed_at,
    DROP COLUMN IF EXISTS transaction_hash,
    DROP COLUMN IF EXISTS failure_reason,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS price_source_component_id,
    DROP COLUMN IF EXISTS vault_component_id;
`;

const createContestCreationIndexes = sql`
  CREATE INDEX IF NOT EXISTS contest_creation_requests_status_idx
    ON contest_creation_requests (status);
  CREATE INDEX IF NOT EXISTS contest_creation_requests_components_idx
    ON contest_creation_requests (vault_component_id, price_source_component_id);
`;

const dropContestCreationIndexes = sql`
  DROP INDEX IF EXISTS contest_creation_requests_components_idx;
  DROP INDEX IF EXISTS contest_creation_requests_status_idx;
`;

const createDeploymentArtifactAugments = sql`
  ALTER TABLE contest_deployment_artifacts
    ADD COLUMN IF NOT EXISTS contest_address text,
    ADD COLUMN IF NOT EXISTS vault_factory_address text,
    ADD COLUMN IF NOT EXISTS transaction_hash text,
    ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
    ADD CONSTRAINT contest_deployment_artifacts_contest_address_format
      CHECK (contest_address IS NULL OR contest_address ~ '^0x[0-9a-fA-F]{40}$'),
    ADD CONSTRAINT contest_deployment_artifacts_vault_factory_format
      CHECK (vault_factory_address IS NULL OR vault_factory_address ~ '^0x[0-9a-fA-F]{40}$'),
    ADD CONSTRAINT contest_deployment_artifacts_tx_hash_format
      CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-fA-F]{64}$');
`;

const dropDeploymentArtifactConstraints = sql`
  ALTER TABLE contest_deployment_artifacts DROP CONSTRAINT IF EXISTS contest_deployment_artifacts_tx_hash_format;
  ALTER TABLE contest_deployment_artifacts DROP CONSTRAINT IF EXISTS contest_deployment_artifacts_vault_factory_format;
  ALTER TABLE contest_deployment_artifacts DROP CONSTRAINT IF EXISTS contest_deployment_artifacts_contest_address_format;
`;

const dropDeploymentArtifactColumns = sql`
  ALTER TABLE contest_deployment_artifacts
    DROP COLUMN IF EXISTS confirmed_at,
    DROP COLUMN IF EXISTS transaction_hash,
    DROP COLUMN IF EXISTS vault_factory_address,
    DROP COLUMN IF EXISTS contest_address;
`;

const createDeploymentArtifactIndexes = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS contest_deployment_artifacts_network_contest_unique
    ON contest_deployment_artifacts (network_id, contest_address)
    WHERE contest_address IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS contest_deployment_artifacts_network_vault_factory_unique
    ON contest_deployment_artifacts (network_id, vault_factory_address)
    WHERE vault_factory_address IS NOT NULL;
`;

const dropDeploymentArtifactIndexes = sql`
  DROP INDEX IF EXISTS contest_deployment_artifacts_network_vault_factory_unique;
  DROP INDEX IF EXISTS contest_deployment_artifacts_network_contest_unique;
`;

const recreateOrganizerContracts = sql`
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

const recreateOrganizerContractIndexes = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS organizer_contracts_user_network_type_unique
    ON organizer_contracts (user_id, network_id, contract_type);
  CREATE INDEX IF NOT EXISTS organizer_contracts_user_network_idx
    ON organizer_contracts (user_id, network_id);
`;

const migrateOrganizerComponentsBack = sql`
  INSERT INTO organizer_contracts (id, user_id, network_id, contract_type, address, metadata, created_at, updated_at)
  SELECT
    id,
    user_id,
    network_id,
    component_type,
    contract_address,
    config,
    created_at,
    updated_at
  FROM organizer_components
  ON CONFLICT DO NOTHING;
`;

export const up: MigrationExecutor = async (db) => {
  await db.execute(createOrganizerComponents);
  await db.execute(createOrganizerComponentIndexes);
  await db.execute(migrateOrganizerContracts);
  await db.execute(dropOrganizerContractsTable);

  await db.execute(createContestCreationAugments);
  await db.execute(createContestCreationIndexes);

  await db.execute(createDeploymentArtifactAugments);
  await db.execute(createDeploymentArtifactIndexes);
};

export const down: MigrationExecutor = async (db) => {
  await db.execute(dropDeploymentArtifactIndexes);
  await db.execute(dropDeploymentArtifactConstraints);
  await db.execute(dropDeploymentArtifactColumns);

  await db.execute(dropContestCreationIndexes);
  await db.execute(dropContestCreationConstraints);
  await db.execute(dropContestCreationColumns);

  await db.execute(recreateOrganizerContracts);
  await db.execute(recreateOrganizerContractIndexes);
  await db.execute(migrateOrganizerComponentsBack);

  await db.execute(dropOrganizerComponentIndexes);
  await db.execute(dropOrganizerComponents);
};

export default { up, down };
