#!/usr/bin/env bash
# shellcheck shell=bash
# shellcheck source=infra/postgres/scripts/_lib.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

LABEL=""

print_usage() {
  cat <<'USAGE'
用法：
  backup.sh [--label NAME]

说明：
  - 生成逻辑备份（pg_dump custom 格式），输出文件位于 backups/ 目录。
  - 使用 --label 为备份文件添加额外标识（仅限字母、数字、连字符与下划线）。
USAGE
}

sanitize_label() {
  local input="$1"
  if [[ "${input}" =~ ^[A-Za-z0-9_-]+$ ]]; then
    printf '%s' "${input}"
  else
    audit_fatal "非法的标签：${input}，仅允许字母、数字、连字符与下划线。"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --label)
        shift
        [[ $# -gt 0 ]] || audit_fatal "--label 需要值"
        LABEL="$(sanitize_label "$1")"
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

compose_ps() {
  docker compose \
    --project-directory "${INFRA_ROOT}" \
    -f "${INFRA_ROOT}/docker-compose.yaml" \
    ps -q postgres
}

ensure_container_running() {
  if [[ -z "$(compose_ps)" ]]; then
    audit_fatal "Postgres 容器未运行，无法执行备份。请先运行 init.sh 或 start.sh。"
  fi
}

perform_backup() {
  local basename="$1"
  local snapshot_time="$2"
  local container_target="/backups/${basename}.dump"
  local host_target="${POSTGRES_BACKUP_DIRECTORY}/${basename}.dump"

  audit_info "执行逻辑备份：${host_target}"

  docker compose \
    --project-directory "${INFRA_ROOT}" \
    -f "${INFRA_ROOT}/docker-compose.yaml" \
    exec -T postgres \
    env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
      pg_dump \
        --format=custom \
        --file="${container_target}" \
        --dbname="${POSTGRES_DATABASE_NAME}" \
        --username="${POSTGRES_SUPERUSER_NAME}"

  [[ -f "${host_target}" ]] || audit_fatal "备份文件未生成：${host_target}"

  local checksum
  checksum="$(sha256sum "${host_target}" | awk '{print $1}')"
  local size_bytes
  size_bytes="$(stat -c %s "${host_target}")"

  audit_info "备份完成：大小=${size_bytes} 字节，checksum=${checksum}"

  update_metadata "${basename}.dump" "${snapshot_time}" "${size_bytes}" "${checksum}"
}

update_metadata() {
  local file_name="$1"
  local snapshot_time="$2"
  local size_bytes="$3"
  local checksum="$4"

  BACKUP_DIR="${POSTGRES_BACKUP_DIRECTORY}" \
  BACKUP_FILE="${file_name}" \
  BACKUP_TIME="${snapshot_time}" \
  BACKUP_SIZE="${size_bytes}" \
  BACKUP_CHECKSUM="${checksum}" \
  BACKUP_LABEL="${LABEL}" \
  python3 - <<'PY'
import json
import os
import sys
from datetime import datetime

backup_dir = os.environ["BACKUP_DIR"]
metadata_path = os.path.join(backup_dir, "metadata.json")
entry = {
    "fileName": os.environ["BACKUP_FILE"],
    "format": "custom",
    "sizeBytes": int(os.environ["BACKUP_SIZE"]),
    "checksumSha256": os.environ["BACKUP_CHECKSUM"],
    "snapshotTime": os.environ["BACKUP_TIME"],
    "label": os.environ.get("BACKUP_LABEL") or None,
}

if os.path.exists(metadata_path):
    with open(metadata_path, "r", encoding="utf-8") as handle:
        try:
            data = json.load(handle)
            if not isinstance(data, list):
                raise ValueError("metadata.json must contain a list")
        except json.JSONDecodeError:
            raise SystemExit("metadata.json 无法解析，请手动修复后重试。")
else:
    data = []

# 清理已不存在的备份
filtered = []
for item in data:
    candidate = item.get("fileName")
    if not candidate:
        continue
    if os.path.exists(os.path.join(backup_dir, candidate)):
        filtered.append(item)

filtered.append(entry)
filtered.sort(key=lambda item: item.get("snapshotTime") or "", reverse=True)

with open(metadata_path, "w", encoding="utf-8") as handle:
    json.dump(filtered, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
PY
}

apply_retention() {
  local retention_count="${BACKUP_RETENTION_COUNT:-0}"
  local retention_days="${BACKUP_RETENTION_DAYS:-0}"

  if ! [[ "${retention_count}" =~ ^[0-9]+$ ]]; then
    audit_warn "BACKUP_RETENTION_COUNT=${retention_count} 非整数，跳过数量保留策略。"
    retention_count=0
  fi
  if ! [[ "${retention_days}" =~ ^[0-9]+$ ]]; then
    audit_warn "BACKUP_RETENTION_DAYS=${retention_days} 非整数，跳过天数保留策略。"
    retention_days=0
  fi

  mapfile -t backups < <(ls -1t "${POSTGRES_BACKUP_DIRECTORY}"/*.dump 2>/dev/null || true)

  if (( retention_count > 0 )) && (( ${#backups[@]} > retention_count )); then
    for (( i=retention_count; i<${#backups[@]}; i++ )); do
      local victim="${backups[i]}"
      audit_warn "超出保留数量，删除旧备份：${victim}"
      rm -f "${victim}"
    done
  fi

  if (( retention_days > 0 )); then
    local threshold
    threshold="$(date -u -d "-${retention_days} days" +%s)"
    for backup_file in "${POSTGRES_BACKUP_DIRECTORY}"/*.dump; do
      [[ -f "${backup_file}" ]] || continue
      local mtime
      mtime="$(stat -c %Y "${backup_file}")"
      if (( mtime < threshold )); then
        audit_warn "备份超过 ${retention_days} 天，删除：${backup_file}"
        rm -f "${backup_file}"
      fi
    done
  fi
}

main() {
  parse_args "$@"
  load_env
  verify_dependencies
  prepare_runtime
  ensure_container_running

  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local basename
  basename="$(date -u +"%Y%m%dT%H%M%SZ")"
  if [[ -n "${LABEL}" ]]; then
    basename="${basename}-${LABEL}"
  fi

  perform_backup "${basename}" "${timestamp}"
  apply_retention

  safe_exit 0 "备份完成：${POSTGRES_BACKUP_DIRECTORY}/${basename}.dump"
}

main "$@"
