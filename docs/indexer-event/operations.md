# Indexer Event Operations Guide

## Runtime checklist
- **Process**: `pnpm --filter @chaincontest/indexer-event dev|start`
- **Ports**: HTTP exposes `INDEXER_EVENT_PORT` (default 4005)
- **Dependencies**: PostgreSQL (`DATABASE_URL`), pg-boss (`PG_BOSS_URL`), RPC endpoints (`INDEXER_EVENT_RPCS`)

## Health endpoints
- `GET /healthz` – returns `ok`, `degraded`, or `error` with reasons (database, queue, RPC streaks)
- `GET /v1/indexer/status` – per-stream snapshot (`mode`, `lag`, `errorStreak`, `activeRpc`, `nextScheduledAt`)

## Metrics (Prometheus)
| Metric | Labels | Description |
|--------|--------|-------------|
| `indexer_event_ingestion_lag_blocks` | `contestId`, `chainId` | Current block lag for live ingestion |
| `indexer_event_ingestion_batch_duration_ms` | `contestId`, `chainId`, `pipeline` | Processing latency for live/replay batches |
| `indexer_event_ingestion_batch_size` | `contestId`, `chainId`, `pipeline` | Events processed per batch |
| `indexer_event_rpc_failures_total` | `chainId`, `endpointId`, `reason` | RPC failure counter with failure reason |
| `indexer_event_rpc_switch_total` | `chainId`, `fromEndpointId`, `toEndpointId` | Automatic RPC failover occurrences |

Scrape `/metrics` every 15s. Alert if:
- `indexer_event_ingestion_lag_blocks > 120` for 3 consecutive scrapes
- `rate(indexer_event_rpc_failures_total[5m]) > 5`
- `healthz` response is not `ok` for >2 minutes

## Logging
- Structured via pino with ISO timestamps.
- Ingestion logs contain `contestId`, `chainId`, `pipeline`, batch size, duration, cursor, and `rpcEndpointId`.
- RPC manager warnings include cooldown expiry and degraded chains.

## Replay workflow
1. Trigger replay via `POST /v1/indexer/replays` (include `contestId`, `chainId`, `fromBlock`, `toBlock`, `reason`, optional `actor`).
2. Health tracker switches stream to `paused` then `replay`; live loop skips while replay runs.
3. Replay pipeline rewrites events, updates cursors, records reconciliation discrepancies, and dispatches `indexer.reconcile` job to pg-boss.
4. Upon completion the stream returns to `live` mode; review `/metrics` and `/v1/indexer/status` to confirm lag resets.

## Queue integrations (pg-boss)
- **`indexer.replay`** – archival record of replay requests (dispatched on trigger).
- **`indexer.reconcile`** – reconciliation reports for downstream review.
- **`indexer.milestone`** – emitted on settlement/reward/redemption milestones during live ingestion.

Review jobs with `SELECT * FROM boss.job WHERE name LIKE 'indexer.%';` or CLI. Failures are logged; replay failures revert stream to `live` and require manual retrigger.

## Incident response
- **RPC failures**: check `indexer_event_rpc_failures_total` label detail, verify fallback endpoints, update `INDEXER_EVENT_RPCS` if necessary.
- **Database errors**: inspect pino error log (`database operation failed`); ensure validation registry path is valid.
- **Replay stuck**: verify `/v1/indexer/status` mode; if stuck in `paused`, restart service or retrigger replay.
- **Metrics stale**: ensure scraping configuration and that service is running; restart if `/metrics` returns 503.

## Maintenance tasks
- Rotate registry sources if `INDEXER_EVENT_REGISTRY_PATH` changes (service will reload on next refresh interval).
- Periodically run `pnpm --filter @chaincontest/indexer-event lint` and `pnpm --filter @chaincontest/indexer-event test` to keep baseline green.
- Document newly introduced milestones or reconciliation discrepancy types in this guide.
