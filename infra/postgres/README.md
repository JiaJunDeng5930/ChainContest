# Infrastructure Postgres Workspace

This directory hosts the Postgres infrastructure assets scoped by `specs/008-infra-postgres-postgres`.

- `env/` keeps environment templates and local overrides (never commit secrets).
- `scripts/` will contain operational Bash scripts.
- `docs/` documents the operational procedures delivered by this feature.
- `logs/`, `backups/`, `snapshots/` store runtime artifacts and remain gitignored via `.gitkeep` placeholders.

