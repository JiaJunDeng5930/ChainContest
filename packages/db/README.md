# @chaincontest/db

PostgreSQL 数据访问核心，负责实现七个对外接口（用户钱包绑定、比赛聚合读取、摄取写入等）并复用 `@chaincontest/shared-schemas` 的校验。

## Quickstart 摘要

> 完整上下文参见 `specs/007-implement-db-module/quickstart.md`，两份文档需保持同步。

1. 安装依赖：`pnpm install`
2. 配置环境变量：复制 `.env.sample` 为 `.env.local` 或通过宿主服务注入。
3. 生成并推送迁移：`pnpm --filter @chaincontest/db migrate:generate`、`pnpm --filter @chaincontest/db migrate:push`
4. 运行测试：`pnpm db:test` 或 `pnpm --filter @chaincontest/db test`

## 环境变量

| 键名 | 说明 | 默认值 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串（含库名、用户、密码） | 无（必填） |
| `POOL_MIN` | 连接池最小连接数 | `2` |
| `POOL_MAX` | 连接池最大连接数 | `10` |

## Workspace 脚本

- `pnpm db:test`：运行模块契约与幂等测试
- `pnpm --filter @chaincontest/db migrate:generate`：基于 Drizzle schema 生成迁移
- `pnpm --filter @chaincontest/db migrate:push`：将迁移应用到目标数据库

## 目录结构

```
packages/db/
├── src/                # adapters / schema / repositories / index（对外接口）
├── tests/              # contract、fixtures、setup
├── migrations/         # Drizzle 自动生成的 SQL
├── drizzle.config.ts   # Drizzle 配置
├── tsconfig.json       # TypeScript 编译配置
└── vitest.config.ts    # 测试配置
```
