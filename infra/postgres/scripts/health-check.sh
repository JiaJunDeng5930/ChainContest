#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/postgres/scripts/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

main() {
  load_env
  verify_dependencies
  prepare_runtime

  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local health_log_file="${LOG_DIRECTORY}/health-${timestamp}.log"

  audit_info "开始健康检查，输出文件：${health_log_file}"

  local pg_isready_output
  local pg_isready_status
  local pg_isready_start
  local pg_isready_end
  pg_isready_start="$(date -u +%s%3N)"
  if pg_isready_output="$(
    PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
      pg_isready \
        --host="${POSTGRES_HOST}" \
        --port="${POSTGRES_PORT}" \
        --username="${POSTGRES_SUPERUSER_NAME}" \
        --dbname="${POSTGRES_DATABASE_NAME}" 2>&1
  )"; then
    pg_isready_status="online"
  else
    pg_isready_status="offline"
  fi
  pg_isready_end="$(date -u +%s%3N)"
  local latency_ms=$((pg_isready_end - pg_isready_start))

  [[ "${pg_isready_status}" == "online" ]] || audit_fatal "pg_isready 检查失败：${pg_isready_output}"

  audit_info "pg_isready 返回在线状态（${latency_ms}ms）"

  local compose_args=(
    --project-directory "${INFRA_ROOT}"
    -f "${INFRA_ROOT}/docker-compose.yaml"
  )

  local diagnostics_sql
  diagnostics_sql=$(
    cat <<'SQL'
SELECT json_build_object(
  'database', current_database(),
  'activeUser', current_user,
  'isReadOnly', pg_is_in_recovery(),
  'serverVersion', current_setting('server_version'),
  'startedAt', to_char(pg_postmaster_start_time(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'observedAt', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'defaultSearchPath', current_setting('search_path'),
  'dataChecksum', current_setting('data_checksums', true)
)::text;
SQL
  )

  local diagnostics_json
  diagnostics_json="$(
    docker compose "${compose_args[@]}" exec -T postgres \
      env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
      psql \
        --dbname="${POSTGRES_DATABASE_NAME}" \
        --username="${POSTGRES_SUPERUSER_NAME}" \
        --tuples-only \
        --no-align \
        --set "ON_ERROR_STOP=1" \
        --command "${diagnostics_sql}"
  )"

  audit_info "诊断 SQL 执行成功"

  local disk_usage_table
  disk_usage_table="$(
    df -Pk \
      "${POSTGRES_DATA_DIRECTORY}" \
      "${POSTGRES_BACKUP_DIRECTORY}" \
      "${POSTGRES_LOG_DIRECTORY}" \
      | awk 'NR==1 {next} {printf "%s,%s,%s,%s,%s\n",$6,$2,$3,$4,$5}'
  )"

  if [[ -z "${disk_usage_table}" ]]; then
    audit_warn "磁盘占用信息为空，请确认路径配置正确"
  fi

  {
    echo "timestamp=${timestamp}"
    echo "status=${pg_isready_status}"
    echo "latency_ms=${latency_ms}"
    echo "pg_isready_output=${pg_isready_output}"
    echo "diagnostics_json=${diagnostics_json}"
    echo "disk_usage_csv_header=mount,kilobytes,total_used,total_available,percent_used"
    echo "disk_usage_csv_payload=${disk_usage_table}"
  } > "${health_log_file}"

  audit_info "健康检查完成"
  safe_exit 0 "健康检查写入 ${health_log_file}"
}

main "$@"
