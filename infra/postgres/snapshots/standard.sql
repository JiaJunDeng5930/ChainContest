-- Standard snapshot for ChainContest local/CI test environments
-- Generated: 2025-10-19T06:05:00Z
-- Purpose: Provides a minimal baseline schema to guarantee deterministic resets.
\set ON_ERROR_STOP on

BEGIN;

-- Ensure required extensions exist (add more as schema evolves)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Establish a placeholder table to validate connectivity. Replace/update when real schema evolves.
CREATE TABLE IF NOT EXISTS reset_control (
  control_id serial PRIMARY KEY,
  noted_at timestamptz NOT NULL DEFAULT NOW(),
  note text NOT NULL DEFAULT 'baseline'
);

INSERT INTO reset_control (note)
VALUES ('baseline snapshot loaded at ' || NOW())
ON CONFLICT DO NOTHING;

COMMIT;
