#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${INFRA_ROOT}/.." && pwd)"
LOG_DIRECTORY="${INFRA_ROOT}/logs"
AUDIT_LOG_FILE="${LOG_DIRECTORY}/audit-$(date -u +%Y%m%d).log"

ensure_directory() {
  local target_dir="$1"
  [[ -z "${target_dir:-}" ]] && {
    echo "ensure_directory requires a target directory path" >&2
    exit 1
  }
  mkdir -p "${target_dir}"
  if ! chmod 700 "${target_dir}" >/dev/null 2>&1; then
    audit_warn "无法调整目录权限：${target_dir}，请确认当前用户具备写权限。"
  fi
}

audit_log() {
  local level="$1"
  shift
  local message="$*"
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local entry="${timestamp} [${level}] ${message}"

  ensure_directory "${LOG_DIRECTORY}"
  echo "${entry}" >> "${AUDIT_LOG_FILE}"
  echo "${entry}" >&2
}

audit_info() {
  audit_log "INFO" "$*"
}

audit_warn() {
  audit_log "WARN" "$*"
}

audit_error() {
  audit_log "ERROR" "$*"
}

audit_fatal() {
  audit_error "$*"
  exit 1
}

require_command() {
  local binary_name="$1"
  command -v "${binary_name}" >/dev/null 2>&1 || audit_fatal "缺少依赖：${binary_name} 未安装或不在 PATH 中。"
}

require_docker_compose() {
  if ! docker compose version >/dev/null 2>&1; then
    audit_fatal "缺少依赖：docker compose 插件不可用，请安装 Docker Engine 24.x 及以上版本。"
  fi
}

load_env() {
  local sample_env="${INFRA_ROOT}/env/sample.env"
  local local_env="${INFRA_ROOT}/env/.env.local"

  [[ -r "${sample_env}" ]] || audit_fatal "缺少环境模板：${sample_env}"
  [[ -r "${local_env}" ]] || audit_fatal "缺少本地敏感配置：${local_env}。请复制 sample.env 并补全凭证。"

  audit_info "加载环境变量：${local_env}"
  # shellcheck disable=SC1090
  set -a
  source "${sample_env}"
  # shellcheck disable=SC1090
  source "${local_env}"
  set +a
}

verify_dependencies() {
  audit_info "执行依赖检查"
  require_command "docker"
  require_docker_compose
  require_command "pg_isready"
  require_command "pg_dump"
  require_command "pg_restore"
  audit_info "依赖检查通过"
}

prepare_runtime() {
  ensure_directory "${LOG_DIRECTORY}"
  ensure_directory "${INFRA_ROOT}/backups"
  ensure_directory "${INFRA_ROOT}/snapshots"
  ensure_directory "${INFRA_ROOT}/data"
}

safe_exit() {
  local code="$1"
  local message="${2:-}"
  if [[ "${code}" -eq 0 ]]; then
    [[ -n "${message}" ]] && audit_info "${message}"
  else
    [[ -n "${message}" ]] && audit_error "${message}"
  fi
  exit "${code}"
}
