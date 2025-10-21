# @chaincontest/indexer-event

The event indexer ingests on-chain contest activity into the ChainContest data plane. It provides continuous live ingestion, RPC failover, replay orchestration, reconciliation reporting, and operational endpoints.

## Prerequisites

- Node.js 20.12+
- pnpm 9+
- PostgreSQL instance compatible with `@chaincontest/db`
- Environment variables configured (see `.env.example`)

Install dependencies from the repository root:

```bash
pnpm install
```

## Running the service

```bash
pnpm --filter @chaincontest/indexer-event dev
```

The development entrypoint boots the HTTP server, loads the ingestion registry, and starts the live polling loop. Logs are emitted with pino using ISO timestamps and include ingestion bindings (`contestId`, `chainId`, `pipeline`).

To produce a production build:

```bash
pnpm --filter @chaincontest/indexer-event build
```

## Health and observability

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Liveness and dependency probe (`ok`, `degraded`, `error`). |
| `GET /metrics` | Prometheus metrics including lag (`indexer_event_ingestion_lag_blocks`), batch duration/size, RPC failures/switches. |
| `GET /v1/indexer/status` | Stream status (mode, lag, active RPC, error streak).

Metrics are labelled by `contestId`, `chainId`, and `pipeline` (`live` or `replay`). RPC failovers increment `indexer_event_rpc_failures_total` and `indexer_event_rpc_switch_total` with endpoint identifiers.

## Replay and reconciliation

Manual replays pause the live loop for the target stream, rewrite the specified block range, generate a reconciliation report, and dispatch an `indexer.reconcile` job to pg-boss.

```
curl -X POST http://localhost:4005/v1/indexer/replays \
  -H 'Content-Type: application/json' \
  -d '{
    "contestId": "cont-1",
    "chainId": 11155111,
    "fromBlock": "120000",
    "toBlock": "120200",
    "reason": "post-settlement audit",
    "actor": "ops@example.com"
  }'
```

Progress is visible through `/v1/indexer/status` (mode switches to `replay`) and `/metrics`. Milestone events (`settlement`, `reward`, `redemption`) enqueue `indexer.milestone` jobs via pg-boss for downstream processors.

## Testing and linting

```bash
pnpm --filter @chaincontest/indexer-event lint
pnpm --filter @chaincontest/indexer-event test
```

Vitest suites cover live ingestion, RPC failover, replay orchestration, and HTTP surface area.

## Key directories

- `src/config` – env parsing and validation
- `src/services` – infrastructure (DB, queue, RPC manager, health tracker, job dispatcher)
- `src/pipelines` – live and replay ingestion flows
- `src/server` – HTTP server and routes
- `tests/unit` – Vitest coverage for pipelines, services, and routes

For detailed setup and operational guidance, see `specs/011-apps-indexer-event/quickstart.md` and `docs/indexer-event/operations.md`.
