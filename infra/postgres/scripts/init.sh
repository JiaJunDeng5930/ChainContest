#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/postgres/scripts/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

COMPOSE_ARGS=(
  --project-directory "${INFRA_ROOT}"
  -f "${INFRA_ROOT}/docker-compose.yaml"
)

container_running() {
  local container_id
  container_id="$(docker compose "${COMPOSE_ARGS[@]}" ps -q postgres 2>/dev/null || true)"
  [[ -n "${container_id}" ]]
}

pull_image() {
  audit_info "拉取镜像：${POSTGRES_IMAGE}"
  docker pull "${POSTGRES_IMAGE}" >/dev/null
  audit_info "镜像拉取完成"
}

start_container() {
  audit_info "启动 Postgres 容器"
  docker compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans
  audit_info "docker compose up 完成"
}

archive_bootstrap_logs() {
  local now
  now="$(date -u +%Y%m%dT%H%M%SZ)"
  local docker_logs_file="${LOG_DIRECTORY}/bootstrap-${now}.log"
  docker compose "${COMPOSE_ARGS[@]}" logs postgres > "${docker_logs_file}" || audit_warn "收集容器日志失败"
  audit_info "容器日志已写入 ${docker_logs_file}"
}

main() {
  load_env
  verify_dependencies
  prepare_runtime

  audit_info "开始执行 init 流程"

  if container_running; then
    audit_fatal "Postgres 容器已在运行。若需重新初始化，请先执行 shutdown.sh。"
  fi

  pull_image
  start_container
  archive_bootstrap_logs

  audit_info "触发健康检查"
  "${SCRIPT_DIR}/health-check.sh"

  audit_info "初始化完成，可通过 connection-info.sh 查看连接参数"
  safe_exit 0
}

main "$@"
