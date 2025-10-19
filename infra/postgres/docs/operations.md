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
