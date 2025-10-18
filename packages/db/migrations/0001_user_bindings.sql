CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_identity_status AS ENUM ('active', 'suspended', 'blocked');
CREATE TYPE wallet_binding_source AS ENUM ('manual', 'auto_inferred', 'imported');

CREATE TABLE user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  status user_identity_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT
);

CREATE UNIQUE INDEX user_identities_external_id_idx ON user_identities (external_id);

CREATE TABLE wallet_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_identities (id) ON DELETE RESTRICT,
  wallet_address TEXT NOT NULL,
  wallet_address_checksum TEXT NOT NULL,
  source wallet_binding_source NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT wallet_bindings_wallet_format CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);

CREATE UNIQUE INDEX wallet_bindings_wallet_unique ON wallet_bindings (wallet_address);
CREATE INDEX wallet_bindings_user_idx ON wallet_bindings (user_id);
CREATE INDEX wallet_bindings_wallet_idx ON wallet_bindings (wallet_address);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_identities_set_updated_at
BEFORE UPDATE ON user_identities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER wallet_bindings_set_updated_at
BEFORE UPDATE ON wallet_bindings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
