# Infra/Postgres Quickstart

## 前提条件
1. 已安装 Docker Engine 24.x 及以上版本，支持 Linux x86_64。
2. 本地已安装 `bash`、`docker compose`、`pg_dump`/`pg_restore`（随官方镜像提供）。
3. 复制 `infra/postgres/env/sample.env` 为 `infra/postgres/env/.env.local`，按需调整端口与凭证。
4. 确认宿主机目录 `infra/postgres/data`、`infra/postgres/backups`、`infra/postgres/logs` 具备读写权限。

## 初始化数据库
1. 运行初始化脚本：
   ```bash
   bash infra/postgres/scripts/init.sh
   ```
   正常情况下，终端会输出类似以下审计记录，并在 `logs/` 目录生成健康检查与启动日志：
   ```
   2025-10-19T08:12:34Z [INFO] 开始执行 init 流程
   2025-10-19T08:12:42Z [INFO] docker compose up 完成
   2025-10-19T08:12:55Z [INFO] 健康检查完成
   ```
2. 脚本会自动拉取镜像、校验依赖并触发健康检查。完成后在 `infra/postgres/logs/health-*.log` 中可查看详细结果。
3. 根据健康检查提示，将连接字符串配置到 `/packages/db` 或相关服务。

## 常用操作
- **健康检查**：执行 `bash infra/postgres/scripts/health-check.sh`，脚本会生成 `logs/health-*.log`，内容示例：
  ```
  timestamp=20251019T081255Z
  status=online
  latency_ms=28
  ```
- **查询连接信息**：执行 `bash infra/postgres/scripts/connection-info.sh --format text`，终端示例输出：
  ```
  Connection status  : connection_ok
  Host               : localhost
  Port               : 5432
  Active Role        : postgres_admin
  ```
- **查询连接信息（JSON）**：如需在自动化脚本中消费，执行 `bash infra/postgres/scripts/connection-info.sh --format json`，返回单条 JSON 文档。
- **触发备份**：执行 `scripts/backup.sh [--label <name>]`，备份文件保存在 `backups/`，并生成校验和。
- **恢复到既有备份**：执行 `scripts/restore.sh --backup <file>`，脚本会在恢复后运行验证 SQL。
- **安全停机**：执行 `scripts/shutdown.sh`，确保在停止容器前生成增量备份。
- **重启实例**：执行 `scripts/start.sh`，重新附加卷并验证状态。
- **测试环境快速重置**：执行 `scripts/reset-test.sh [--snapshot <id>]`，在 5 分钟内恢复标准快照。

## 备份与恢复策略
1. 默认保留最近 7 份备份，可通过 `BACKUP_RETENTION_COUNT` 环境变量调整。
2. 每次备份会生成 `metadata.json`，记录 `checksum`、`size`、`snapshotTime` 等信息。
3. 恢复脚本会在执行前提示目标实例/环境，需确认后继续，以避免误操作。

## 故障排查
- 如端口被占用，脚本会输出冲突提示，可在 `.env.local` 调整 `POSTGRES_PORT`。
- 若容器启动失败，检查 `logs/postgres-*.log` 内的错误信息，并确认数据卷权限。
- 备份磁盘不足时，脚本会停止操作并列出可清理的过期备份。
- 健康检查连续失败时，应立即执行停机与恢复流程，并通知运维负责人。

## 下一步
- 将健康检查脚本接入 CI 以实现自动验证。
- 按季度演练备份与恢复，记录耗时指标并优化瓶颈。
