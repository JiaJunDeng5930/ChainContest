#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/postgres/scripts/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

FORMAT="text"

print_usage() {
  cat <<'USAGE'
用法：
  connection-info.sh [--format text|json]

说明：
  - 默认输出可读格式。
  - 使用 --format json 输出单条 JSON 记录，可用于脚本自动化。
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --format)
        shift
        [[ $# -gt 0 ]] || audit_fatal "--format 需要指定 text 或 json"
        case "$1" in
          text|json)
            FORMAT="$1"
            ;;
          *)
            audit_fatal "未知格式：$1"
            ;;
        esac
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

compose_exec_psql() {
  local sql="$1"
  docker compose \
    --project-directory "${INFRA_ROOT}" \
    -f "${INFRA_ROOT}/docker-compose.yaml" \
    exec -T postgres \
    env PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" \
    psql \
      --dbname="${POSTGRES_DATABASE_NAME}" \
      --username="${POSTGRES_SUPERUSER_NAME}" \
      --tuples-only \
      --no-align \
      --set "ON_ERROR_STOP=1" \
      --command "${sql}"
}

main() {
  parse_args "$@"
  load_env
  verify_dependencies
  prepare_runtime

  audit_info "开始查询连接信息（格式：${FORMAT}）"

  local validation_result
  validation_result="$(compose_exec_psql "SELECT 'connection_ok' AS status, NOW() AS observed_at;")" || {
    audit_fatal "连接验证失败，请检查容器状态与凭证。"
  }

  local info_json
  info_json="$(
    compose_exec_psql "
      SELECT json_build_object(
        'timestamp', to_char(NOW(), 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
        'host', '${POSTGRES_HOST}',
        'port', ${POSTGRES_PORT},
        'database', current_database(),
        'activeUser', current_user,
        'serverVersion', current_setting('server_version'),
        'schemaVersion', current_schema(),
        'networkName', '${POSTGRES_NETWORK_NAME}',
        'composeFile', '${INFRA_ROOT}/docker-compose.yaml',
        'roles', json_build_object(
          'superuser', '${POSTGRES_SUPERUSER_NAME}',
          'application', '${POSTGRES_APP_USER_NAME}',
          'readonly', '${POSTGRES_READONLY_USER_NAME}'
        ),
        'envFile', '${INFRA_ROOT}/env/.env.local',
        'status', 'connection_ok'
      )::text;
    "
  )"

  case "${FORMAT}" in
    text)
      cat <<EOF
Connection status  : ${validation_result%%|*}
Observed at        : ${validation_result##*|}
Host               : ${POSTGRES_HOST}
Port               : ${POSTGRES_PORT}
Database           : ${POSTGRES_DATABASE_NAME}
Active Role        : ${POSTGRES_SUPERUSER_NAME}
Server Version     : $(compose_exec_psql "SELECT current_setting('server_version');")
Network            : ${POSTGRES_NETWORK_NAME}
Env File           : ${INFRA_ROOT}/env/.env.local
Compose Definition : ${INFRA_ROOT}/docker-compose.yaml
Application Role   : ${POSTGRES_APP_USER_NAME}
Readonly Role      : ${POSTGRES_READONLY_USER_NAME}
EOF
      ;;
    json)
      echo "${info_json}"
      ;;
  esac

  audit_info "连接信息输出完成"
  safe_exit 0
}

main "$@"
