# @chaincontest/indexer-tasks

The indexer tasks service consumes asynchronous jobs emitted by the indexer pipelines and orchestrates downstream updates for contest milestones. It currently focuses on the `indexer.milestone` queue, applying strict idempotency, structured auditing, and Prometheus instrumentation so operations can rely on an at-least-once delivery model without duplicating business effects.

## Prerequisites
- Node.js 20.x and pnpm 9.x installed on your workstation or runtime host
- Access to PostgreSQL using the credentials expected by `@chaincontest/db`
- Access to the pg-boss database that streams `indexer.milestone` jobs
- Local copies of the shared validation registry JSON files referenced by `TASKS_VALIDATION_REGISTRY_PATH` and `TASKS_VALIDATION_OVERRIDES_PATH`
- Repository dependencies installed from the workspace root (`pnpm install`)

## Running the service
```bash
pnpm --filter @chaincontest/indexer-tasks dev
```

The development entrypoint loads configuration, initialises the database client, connects to pg-boss, registers the milestone worker, and starts the Fastify HTTP server on `INDEXER_TASKS_PORT` (default `3040`).

To create a production build and launch it via Node.js:

```bash
pnpm --filter @chaincontest/indexer-tasks build
pnpm --filter @chaincontest/indexer-tasks start
```

The build step emits transpiled output in `dist/`. `start` expects the same environment variables as `dev`.

## Environment configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | – | PostgreSQL connection string used by `@chaincontest/db` for milestone records. |
| `PG_BOSS_URL` | – | Connection string for the pg-boss job database. |
| `TASKS_VALIDATION_REGISTRY_PATH` | – | Absolute path to the validation registry JSON consumed by `@chaincontest/db`. |
| `TASKS_VALIDATION_OVERRIDES_PATH` | – | Absolute path to per-environment validation overrides JSON. |
| `INDEXER_TASKS_PORT` | `3040` | HTTP listener for `/healthz` and `/metrics`. |
| `INDEXER_TASKS_METRICS_PORT` | `9440` | Reserved for standalone metrics listeners (not yet used). |
| `INDEXER_TASKS_RPC_FAILURE_THRESHOLD` | `3` | Maximum retry attempts before a milestone escalates to `needs_attention`. |
| `INDEXER_TASKS_QUEUE_CONCURRENCY` | `1` | Worker concurrency per pg-boss queue consumer. |
| `INDEXER_TASKS_QUEUE_FETCH_INTERVAL_MS` | `1000` | Polling interval (milliseconds) for new jobs. |
| `INDEXER_TASKS_SHUTDOWN_TIMEOUT_MS` | `30000` | Graceful shutdown window before forcing exit. |
| `INDEXER_TASKS_LOG_LEVEL` | `info` | Overrides the log level (`LOG_LEVEL` and `NODE_ENV` provide fallbacks). |
| `INDEXER_TASKS_PRETTY_LOGS` | `true` in development | Enables `pino-pretty` transport for local readability. |
| `INDEXER_TASKS_VALIDATION_ENV_ID` | `NODE_ENV` | Identifier passed to the validation registry. |
| `INDEXER_TASKS_DISABLE_NOTIFICATIONS` | `false` | When set to `true`, suppresses notification side effects (reserved for future stories). |

Unset variables marked “–” are required and the service will fail fast if they are missing or malformed.

## Queues & workflow orchestration
- `indexer.milestone` jobs are processed serially per contest by leveraging pg-boss singleton keys and the service’s own idempotency guard (`contestId`, `chainId`, `milestone`, `txHash`, `logIndex`).
- Each job is wrapped in a `TaskJobEnvelope` for audit logging; payloads are cloned to preserve original task data for at least 90 days (per data policy).
- Failures emit structured logs, increment retry counters in Prometheus, and rely on pg-boss retry/backoff. Once attempts exceed `INDEXER_TASKS_RPC_FAILURE_THRESHOLD`, the milestone is marked `needs_attention` for manual follow-up.

## HTTP surface & metrics
| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Liveness probe that returns `{ status: 'ok', timestamp }` when the service loop is healthy. |
| `GET /metrics` | Prometheus exposition format with queue/job instrumentation and default process metrics. |

## Prometheus metrics
| Metric | Labels | Description |
|--------|--------|-------------|
| `indexer_tasks_job_duration_seconds` | `queue`, `outcome` | Histogram tracking job execution latency (seconds). |
| `indexer_tasks_jobs_total` | `queue`, `outcome` | Counter of processed jobs by outcome (`success`, `failure`, `deferred`, `skipped`). |
| `indexer_tasks_job_retries_total` | `queue`, `reason` | Counter for retry-triggering errors (e.g. `processor_error`). |
| `indexer_tasks_queue_depth` | `queue`, `state` | Gauge for pg-boss queue backlog by state (`pending`, `delayed`, `failed`, `active`). |
| `indexer_tasks_last_success_timestamp_seconds` | `queue` | Gauge capturing the unix timestamp of the last successful job. |

`collectDefaultMetrics` also publishes standard Node.js process metrics with the `indexer_tasks_` prefix (CPU, memory, event loop lag).

## Testing & linting
```bash
pnpm --filter @chaincontest/indexer-tasks lint
pnpm --filter @chaincontest/indexer-tasks test
```

Vitest covers the milestone queue consumer and idempotency utilities.

## Directory layout
- `src/bootstrap` – configuration, database, queue, and app lifecycle plumbing
- `src/queue` – job envelopes, payload parsers, and worker registrations
- `src/services` – milestone processor orchestration and idempotency helpers
- `src/http` – Fastify server bootstrap and core routes (`/healthz`, `/metrics`)
- `src/telemetry` – logger factory and Prometheus metrics helpers
- `tests` – unit and integration tests executed by Vitest

## Further reading
- `specs/012-apps-indexer-tasks/spec.md`
- `specs/012-apps-indexer-tasks/data-model.md`
- `specs/012-apps-indexer-tasks/research.md`
- `specs/012-apps-indexer-tasks/quickstart.md`
- `docs/indexer-tasks/operations.md`
