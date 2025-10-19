# Infrastructure Postgres Operations (Baseline)

## 前置条件
- 安装 Docker Engine ≥ 24.0，并启用 `docker compose` 插件。
- 本机具备 `bash 5`、`pg_isready`、`pg_dump`、`pg_restore` 命令（来自 Postgres 客户端工具）。
- 复制 `infra/postgres/env/sample.env` 至 `infra/postgres/env/.env.local`，并填入有效凭证与端口配置。
- 运行脚本的账户需具备创建本地目录与访问 Docker Socket 的权限。

## 目录布局
```
infra/postgres/
├── docker-compose.yaml      # 官方 postgres:16-alpine 服务定义
├── env/
│   ├── sample.env           # 变量模板（受控于版本管理）
│   └── .env.local           # 实际凭证（仅本地保存）
├── scripts/                 # 运维脚本入口，统一引用 _lib.sh
├── docs/                    # 运维手册与验收记录
├── logs/                    # 健康检查与脚本审计日志（运行时生成）
├── backups/                 # 逻辑备份输出目录（运行时生成）
└── snapshots/               # 测试快照资产（运行时生成）
```

## 安全优先栈
1. **最小权限**：脚本仅创建 Admin、应用、只读三个角色，所有凭证来自 `.env.local`，禁止硬编码。
2. **审计可追溯**：每个脚本通过 `_lib.sh` 写入 `logs/audit-*.log`，记录时间戳、操作人和关键参数。
3. **幂等保护**：关键操作（初始化、备份、恢复）在执行前校验当前状态，重复执行不会破坏已存在实例。
4. **资源隔离**：Compose 网络通过 `POSTGRES_NETWORK_NAME` 单独命名，默认不对外暴露额外端口。

## 回滚原则（Baseline）
- 若初始化失败，立即停止容器并删除新建的数据卷，再行启动前必须排查 `_lib.sh` 记录的失败原因。
- 备份流程遇到校验失败时，不得覆盖旧备份，需根据日志查明原因后重新执行。
- 恢复流程必须在执行前创建当前状态的备份，确保可回退；恢复后强制运行健康检查验证一致性。
- 快速重置脚本只允许在显式标记的测试环境运行，脚本将拒绝在生产环境被调用。

## 供应流程（US1）
1. 确认 `.env.local` 已配置容器名称、端口以及三个数据库角色的凭证。
2. 运行 `bash infra/postgres/scripts/init.sh`，脚本会依次执行依赖检查、镜像拉取、容器启动与健康检查。
3. 初始化成功后，检查以下文件确认状态：
   - `logs/bootstrap-*.log`：容器启动日志快照。
   - `logs/health-*.log`：健康检查详情，内含磁盘使用率与服务版本。
4. 使用 `bash infra/postgres/scripts/connection-info.sh --format text` 验证连接参数，并将输出附加到交付记录。

## 失败与回滚步骤
- **容器启动失败**：执行 `docker compose -f infra/postgres/docker-compose.yaml --project-directory infra/postgres down --volumes`，随后修正 `.env.local` 或权限问题，再次运行初始化脚本。
- **健康检查未通过**：保留失败日志，先运行 `docker compose ... logs postgres` 定位问题；如属配置错误，执行 `shutdown.sh`（完成后将在后续任务提供）并清理数据卷，再重新初始化。
- **凭证错误**：更新 `.env.local` 后执行 `docker compose ... exec postgres psql` 手动重置密码，同时记录动作至 `logs/audit-*.log`；修复后重新运行健康检查脚本以验证。

## 凭证分发与最小权限
- `.env.local` 仅保存于需要操作数据库的受信成员本机，并通过权限控制工具（例如 1Password 或 Vault）同步密钥。
- **管理员凭证**（`POSTGRES_SUPERUSER_NAME`）仅限运维与数据库管理员执行备份、恢复等高权限操作。
- **应用凭证**（`POSTGRES_APP_USER_NAME`）开放给 `/packages/db` 与相关服务，确保业务操作具备读写权限。
- **只读凭证**（`POSTGRES_READONLY_USER_NAME`）用于报告或紧急诊断，不得执行写操作。
- 凭证更新需在 `.env.local` 内同步，并立即触发 `health-check.sh` 验证连接；更新记录写入 `logs/audit-*.log`。

## 验收记录（2025-10-19）
- 已使用 `bash infra/postgres/scripts/init.sh` 完成初始化与健康检查，关键日志：
  - 启动日志：`infra/postgres/logs/bootstrap-20251019T053735Z.log`
  - 健康检查：`infra/postgres/logs/health-20251019T053735Z.log`
- 通过 `bash infra/postgres/scripts/connection-info.sh --format text` 验证连接，脚本输出确认容器在线且当前角色为 `postgres_admin`。
