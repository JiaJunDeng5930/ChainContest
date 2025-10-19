ALTER TABLE wallet_bindings
  ADD COLUMN IF NOT EXISTS unbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unbound_by TEXT;

-- Replace the previous unique constraint with a partial index that only applies to active bindings.
DROP INDEX IF EXISTS wallet_bindings_wallet_unique;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_bindings_wallet_active_unique
  ON wallet_bindings (wallet_address)
  WHERE unbound_at IS NULL;

ALTER TABLE wallet_bindings
  DROP CONSTRAINT IF EXISTS wallet_bindings_unbound_after_bound;

ALTER TABLE wallet_bindings
  ADD CONSTRAINT wallet_bindings_unbound_after_bound
  CHECK (unbound_at IS NULL OR unbound_at >= bound_at);
