#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

SNAPSHOT_ID="standard"

print_usage() {
  cat <<'USAGE'
用法：
  reset-test.sh [--snapshot standard]

说明：
  - 仅在测试/CI 环境运行。脚本会清空当前数据库并导入指定快照。
  - 必须在 `.env.local` 将 `ALLOW_TEST_RESET` 设为 `true`，并确保 `RESET_ENVIRONMENT_NAME` 非生产标识。
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --snapshot)
        shift
        [[ $# -gt 0 ]] || audit_fatal "--snapshot 需要指定快照 ID"
        SNAPSHOT_ID="$1"
        ;;
      --help|-h)
        print_usage
        safe_exit 0
        ;;
      *)
        audit_fatal "未知参数：$1"
        ;;
    esac
    shift
  done
}

compose_args() {
  printf '%s\n' "--project-directory" "${INFRA_ROOT}" "-f" "${INFRA_ROOT}/docker-compose.yaml"
}

container_id() {
  docker compose $(compose_args) ps -q postgres
}

ensure_container_online() {
  if [[ -z "$(container_id)" ]]; then
    audit_warn "Postgres 容器未运行，自动尝试启动。"
    docker compose $(compose_args) up -d --remove-orphans
    sleep 2
  fi
}

guard_environment() {
  local allow_reset="${ALLOW_TEST_RESET:-false}"
  local env_name="${RESET_ENVIRONMENT_NAME:-unknown}"

  case "${allow_reset}" in
    true|TRUE|1|yes|YES) ;; 
    *)
      audit_fatal "当前环境未开启测试重置（ALLOW_TEST_RESET=${allow_reset}）。请在 .env.local 启用后再运行。"
      ;;
  esac

  if [[ "${env_name}" =~ ^(prod|production|live)$ ]]; then
    audit_fatal "禁止在生产环境执行 reset-test（RESET_ENVIRONMENT_NAME=${env_name}）。"
  fi
}

snapshot_path() {
  local candidate="${POSTGRES_SNAPSHOT_DIRECTORY}/${SNAPSHOT_ID}.sql"
  [[ -f "${candidate}" ]] || audit_fatal "找不到快照文件：${candidate}"
  printf '%s\n' "${candidate}"
}

exec_psql() {
  local sql="$1"
  docker compose $(compose_args) exec -T postgres \
    env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
    psql \
      --dbname="${POSTGRES_DATABASE_NAME}" \
      --username="${POSTGRES_SUPERUSER_NAME}" \
      --tuples-only \
      --no-align \
      --set "ON_ERROR_STOP=1" \
      --command "${sql}"
}

apply_snapshot() {
  local snapshot_file="$1"
  docker compose $(compose_args) exec -T postgres \
    env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
    psql \
      --dbname="${POSTGRES_DATABASE_NAME}" \
      --username="${POSTGRES_SUPERUSER_NAME}" \
      --set "ON_ERROR_STOP=1" \
      --file "/snapshots/$(basename "${snapshot_file}")"
}

main() {
  parse_args "$@"
  load_env
  verify_dependencies
  prepare_runtime
  guard_environment
  ensure_container_online

  local snapshot_file
  snapshot_file="$(snapshot_path)"

  local timestamp
  timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  local reset_log="${LOG_DIRECTORY}/reset-${timestamp}.log"

  audit_info "开始测试环境重置，使用快照：${snapshot_file}"

  exec_psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" | sed 's/^/terminated_pid=/' >> "${reset_log}"

  exec_psql "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${POSTGRES_SUPERUSER_NAME};" >> "${reset_log}"

  apply_snapshot "${snapshot_file}" >> "${reset_log}"

  exec_psql "ANALYZE;" >> "${reset_log}"

  audit_info "快照导入完成，执行健康检查"
  bash "${SCRIPT_DIR}/health-check.sh"

  audit_info "测试环境重置成功，日志：${reset_log}"
  safe_exit 0
}

main "$@"
