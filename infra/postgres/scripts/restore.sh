#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

BACKUP_FILE=""
SKIP_SAFEGUARD="false"

print_usage() {
  cat <<'USAGE'
用法：
  restore.sh --backup <fileName or absolutePath> [--skip-safeguard]

说明：
  - 从指定的 .dump 备份文件恢复数据库内容。
  - 默认会在恢复前自动创建一次临时备份，失败时自动回滚。
  - 使用 --skip-safeguard 可跳过预备份（仅在确认已有其他回滚方案时使用）。
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backup)
        shift
        [[ $# -gt 0 ]] || audit_fatal "--backup 需要指定备份文件名或路径"
        BACKUP_FILE="$1"
        ;;
      --skip-safeguard)
        SKIP_SAFEGUARD="true"
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

resolve_backup_path() {
  local candidate="$1"
  if [[ -f "${candidate}" ]]; then
    printf '%s\n' "$(realpath "${candidate}")"
    return
  fi

  local from_backups="${POSTGRES_BACKUP_DIRECTORY}/${candidate}"
  if [[ -f "${from_backups}" ]]; then
    printf '%s\n' "$(realpath "${from_backups}")"
    return
  fi

  audit_fatal "找不到备份文件：${candidate}"
}

compose_args() {
  printf '%s\n' "--project-directory" "${INFRA_ROOT}" "-f" "${INFRA_ROOT}/docker-compose.yaml"
}

ensure_container_running() {
  if [[ -z "$(docker compose $(compose_args) ps -q postgres)" ]]; then
    audit_fatal "Postgres 容器未运行，无法执行恢复。"
  fi
}

create_safeguard_backup() {
  local tag timestamp
  timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  tag="pre-restore-${timestamp}"
  audit_info "创建预备份（用于回滚）：${tag}"
  bash "${SCRIPT_DIR}/backup.sh" --label "${tag}" || audit_fatal "预备份失败，终止恢复流程。"
  printf '%s\n' "${POSTGRES_BACKUP_DIRECTORY}/${tag}.dump"
}

restore_dump() {
  local dump_path="$1"
  audit_info "使用备份恢复：${dump_path}"

  docker compose \
    --project-directory "${INFRA_ROOT}" \
    -f "${INFRA_ROOT}/docker-compose.yaml" \
    exec -T postgres \
    env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
      pg_restore \
        --clean \
        --if-exists \
        --no-owner \
        --dbname="${POSTGRES_DATABASE_NAME}" \
        --username="${POSTGRES_SUPERUSER_NAME}" \
        "${dump_path/#${POSTGRES_BACKUP_DIRECTORY}/\/backups}"
}

run_validation() {
  local diagnostics_sql
  diagnostics_sql=$(
    cat <<'SQL'
WITH validation AS (
  SELECT
    COUNT(*) FILTER (WHERE schemaname NOT IN ('pg_catalog','information_schema')) AS user_tables,
    SUM(pg_relation_size(format('%I.%I', schemaname, tablename))) AS total_table_bytes
  FROM pg_catalog.pg_tables
)
SELECT json_build_object(
  'userTables', COALESCE(validation.user_tables, 0),
  'totalTableBytes', COALESCE(validation.total_table_bytes, 0),
  'checkedAt', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
)::text
FROM validation;
SQL
  )

  docker compose \
    --project-directory "${INFRA_ROOT}" \
    -f "${INFRA_ROOT}/docker-compose.yaml" \
    exec -T postgres \
    env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
      psql \
        --dbname="${POSTGRES_DATABASE_NAME}" \
        --username="${POSTGRES_SUPERUSER_NAME}" \
        --no-align \
        --tuples-only \
        --command "${diagnostics_sql}"
}

main() {
  parse_args "$@"
  [[ -n "${BACKUP_FILE}" ]] || audit_fatal "必须通过 --backup 指定备份文件。"

  load_env
  verify_dependencies
  prepare_runtime
  ensure_container_running

  local backup_path
  backup_path="$(resolve_backup_path "${BACKUP_FILE}")"

  if [[ "${backup_path}" != "${POSTGRES_BACKUP_DIRECTORY}"/* ]]; then
    audit_fatal "备份文件需位于 ${POSTGRES_BACKUP_DIRECTORY} 下，当前为：${backup_path}"
  fi

  local safeguard_path=""
  if [[ "${SKIP_SAFEGUARD}" != "true" ]]; then
    safeguard_path="$(create_safeguard_backup)"
  else
    audit_warn "已跳过预备份 safeguard，请确认具备其他回滚方案。"
  fi

  set +e
  restore_dump "${backup_path}"
  local restore_status=$?
  set -e

  if (( restore_status != 0 )); then
    if [[ -n "${safeguard_path}" && -f "${safeguard_path}" ]]; then
      audit_error "恢复失败，尝试使用预备份回滚。"
      set +e
      restore_dump "${safeguard_path}"
      local rollback_status=$?
      set -e
      if (( rollback_status != 0 )); then
        audit_fatal "回滚失败，数据库处于未知状态，请人工介入。"
      fi
    fi
    audit_fatal "恢复失败，请检查备份文件完整性或日志输出。"
  fi

  local validation_output
  if ! validation_output="$(run_validation)"; then
    if [[ -n "${safeguard_path}" && -f "${safeguard_path}" ]]; then
      audit_error "验证失败，开始回滚到预备份：${safeguard_path}"
      restore_dump "${safeguard_path}"
    fi
    audit_fatal "恢复后的验证查询失败，已回滚。"
  fi

  audit_info "恢复验证通过：${validation_output}"
  audit_info "备份 ${backup_path} 已成功恢复。"

  safe_exit 0
}

main "$@"
