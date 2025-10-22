# Indexer Tasks Operations Guide

## Runtime checklist
- **Process**: `pnpm --filter @chaincontest/indexer-tasks dev|start`
- **Ports**: HTTP listens on `INDEXER_TASKS_PORT` (default `3040`) for `/healthz` and `/metrics`
- **Dependencies**: PostgreSQL (`DATABASE_URL`), pg-boss (`PG_BOSS_URL`), validation registry JSON (`TASKS_VALIDATION_REGISTRY_PATH`, `TASKS_VALIDATION_OVERRIDES_PATH`)
- **Config files**: Keep validation JSON artifacts colocated with deploy manifests and update `INDEXER_TASKS_VALIDATION_ENV_ID` when pointing to alternate environments

## Health endpoints
- `GET /healthz` → `{ status: 'ok', timestamp }` when queue, database, and HTTP server are ready. Non-200 responses signal the service failed to boot or is shutting down.
- `GET /metrics` → Prometheus exposition with task job counters, histograms, queue backlog gauges, and Node.js runtime metrics prefixed with `indexer_tasks_`.

## Metrics (Prometheus)
| Metric | Labels | Description |
|--------|--------|-------------|
| `indexer_tasks_job_duration_seconds` | `queue`, `outcome` | Histogram for job latency in seconds (buckets 50ms → 5m). |
| `indexer_tasks_jobs_total` | `queue`, `outcome` | Counter for processed jobs by outcome (`success`, `failure`, `deferred`, `skipped`). |
| `indexer_tasks_job_retries_total` | `queue`, `reason` | Counter for retries triggered by error classifications. |
| `indexer_tasks_queue_depth` | `queue`, `state` | Gauge of pg-boss backlog by state (`pending`, `delayed`, `failed`, `active`). |
| `indexer_tasks_last_success_timestamp_seconds` | `queue` | Gauge recording the unix timestamp of the latest successful job. |

Default Node.js metrics (`process_cpu_seconds_total`, event loop lag, heap usage, etc.) are also published with the `indexer_tasks_` prefix.

## Alerting guidelines
- **Latency**: `histogram_quantile(0.95, rate(indexer_tasks_job_duration_seconds_bucket[5m])) > 60` for the `indexer.milestone` queue indicates milestone SLA breach.
- **Failures**: `increase(indexer_tasks_jobs_total{queue="indexer.milestone",outcome="failure"}[5m]) > 0` should trigger investigation; correlate with logs.
- **Retries**: `increase(indexer_tasks_job_retries_total[10m]) > 10` highlights repeated transient errors (monitor for `processor_error`).
- **Backlog**: `indexer_tasks_queue_depth{queue="indexer.milestone",state="pending"} > 50` or any `state="failed" > 0` for more than 3 consecutive scrapes.
- **Silence**: `time() - indexer_tasks_last_success_timestamp_seconds{queue="indexer.milestone"} > 300` surfaces stale pipelines.

## Logging
- Structured logs via pino include `service=apps-indexer-tasks`, `environment`, queue metadata (`jobId`, `contestId`, `chainId`, `milestone`).
- Sensitive fields (`payload.token`, credentials, database URLs) are redacted automatically (`remove: true`).
- Duplicate milestones emit `duplicate milestone job skipped` at warn level; genuine failures emit `milestone job failed` with serialized error context.

## Queue operations
- Inspect backlog counts directly in pg-boss:
  ```sql
  SELECT name, state, count(*)
  FROM boss.job
  WHERE name = 'indexer.milestone'
  GROUP BY 1, 2
  ORDER BY 1, 2;
  ```
- Retry a specific job after addressing root cause:
  ```sql
  SELECT boss.retry_job('job-id-here');
  ```
- Force completion (use sparingly) by moving a job to done without execution:
  ```sql
  SELECT boss.complete_job('job-id-here', jsonb_build_object('operator', 'ops@example.com', 'reason', 'manual override'));
  ```
- Pause consumption by scaling replicas to zero or revoking worker credentials; resume by restoring the service. The worker honours `SIGINT`/`SIGTERM` and drains according to `INDEXER_TASKS_SHUTDOWN_TIMEOUT_MS`.

## Milestone record verification
- Query recent milestone executions to confirm status transitions:
  ```sql
  SELECT contest_id,
         chain_id,
         milestone,
         status,
         attempts,
         completed_at,
         updated_at
  FROM milestone_execution_records
  ORDER BY updated_at DESC
  LIMIT 50;
  ```
- Investigate stalled items (status `needs_attention`) and coordinate manual remediation before retrying jobs.

## Manual smoke test
Inject a sample milestone job into pg-boss (requires `PG_BOSS_URL` in the environment):
```bash
PG_BOSS_URL=postgres://... pnpm exec tsx <<'TS'
import PgBoss from 'pg-boss';

const boss = new PgBoss(process.env.PG_BOSS_URL!);
await boss.start();
await boss.send('indexer.milestone', {
  contestId: 'contest-demo',
  chainId: 11155111,
  milestone: 'settled',
  sourceTxHash: '0x' + '1'.repeat(64),
  sourceLogIndex: 0,
  sourceBlockNumber: '12345',
  payload: { dryRun: true }
});
await boss.stop();
TS
```
Watch the service logs for `milestone job handled` and verify metrics increments.

## Incident response
- **Database bootstrap failures**: Confirm validation registry files exist at the configured paths; errors appear as `failed to initialise database connection`.
- **Queue disconnects**: pg-boss errors emit `pg-boss emitted an error`. Validate credentials and database availability before restarting.
- **Duplicate tasks flooding**: Expect warn-level logs for skipped duplicates. Investigate upstream dedupe keys; adjust singleton key configuration if necessary.
- **Sustained retries**: Correlate retry counters with `milestone_execution_records.last_error` payloads. Escalate to application owners when `needs_attention` entries grow.

## Rollback strategy
1. Stop the service (`systemctl stop indexer-tasks` or send `SIGTERM`).
2. Deploy the previous artefact or revert the release branch.
3. Start the service; outstanding pg-boss jobs remain pending and will be processed by the restored version. No manual queue flush is required.
4. After rollback, verify fresh jobs progress (monitor metrics and milestone execution records).

## Maintenance tasks
- Refresh validation registry artefacts whenever shared schemas change; restart the service to reload.
- Run `pnpm --filter @chaincontest/indexer-tasks lint` and `pnpm --filter @chaincontest/indexer-tasks test` before promoting releases.
- Document new queue types or HTTP surfaces in both this guide and `apps/indexer/tasks/README.md` as additional user stories land.
