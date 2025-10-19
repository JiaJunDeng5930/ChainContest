#!/usr/bin/env bash
# shellcheck shell=bash
# shellcheck source=infra/postgres/scripts/_lib.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

container_id() {
  docker compose --project-directory "${INFRA_ROOT}" -f "${INFRA_ROOT}/docker-compose.yaml" ps -q postgres
}

ensure_not_running() {
  if [[ -n "$(container_id)" ]]; then
    audit_warn "Postgres 容器已经在运行，无需重复启动。"
    safe_exit 0
  fi
}

start_container() {
  audit_info "启动 Postgres 容器"
  docker compose --project-directory "${INFRA_ROOT}" -f "${INFRA_ROOT}/docker-compose.yaml" up -d --remove-orphans
}

main() {
  load_env
  verify_dependencies
  prepare_runtime
  ensure_not_running

  start_container
  audit_info "容器已启动，执行快速健康检查"
  bash "${SCRIPT_DIR}/health-check.sh"

  safe_exit 0 "启动流程完成"
}

main "$@"
