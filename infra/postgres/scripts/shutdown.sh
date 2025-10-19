#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

compose_args() {
  printf '%s\n' "--project-directory" "${INFRA_ROOT}" "-f" "${INFRA_ROOT}/docker-compose.yaml"
}

container_id() {
  docker compose $(compose_args) ps -q postgres
}

ensure_container_running() {
  if [[ -z "$(container_id)" ]]; then
    audit_warn "容器当前未运行，无需停机。"
    safe_exit 0
  fi
}

create_incremental_backup() {
  local tag
  tag="shutdown-$(date -u +"%Y%m%dT%H%M%SZ")"
  audit_info "在停机前创建备份：${tag}"
  bash "${SCRIPT_DIR}/backup.sh" --label "${tag}" || audit_fatal "停机前备份失败，请手动检查状态。"
  printf '%s\n' "${POSTGRES_BACKUP_DIRECTORY}/${tag}.dump"
}

stop_container() {
  audit_info "执行 docker compose down --remove-orphans"
  docker compose $(compose_args) down --remove-orphans
}

verify_shutdown() {
  if [[ -n "$(container_id)" ]]; then
    audit_fatal "容器仍然存在，停机流程失败。"
  fi
  audit_info "停机验证通过，容器已停止。"
}

main() {
  load_env
  verify_dependencies
  prepare_runtime
  ensure_container_running

  local backup_path
  backup_path="$(create_incremental_backup)"
  audit_info "备份完成：${backup_path}"

  stop_container
  verify_shutdown

  safe_exit 0 "停机流程完成"
}

main "$@"
