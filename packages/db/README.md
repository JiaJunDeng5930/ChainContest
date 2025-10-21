# @chaincontest/db

PostgreSQL 数据访问核心，负责实现七个对外接口（用户钱包绑定、比赛聚合读取、摄取写入等）并复用 `@chaincontest/shared-schemas` 的校验。

## Quickstart 摘要

> 完整上下文参见 `specs/007-implement-db-module/quickstart.md`，两份文档需保持同步。

1. 安装依赖：`pnpm install`
2. 配置环境变量：复制 `.env.sample` 为 `.env.local` 或通过宿主服务注入。
3. 生成并推送迁移：`pnpm --filter @chaincontest/db migrate:generate`、`pnpm --filter @chaincontest/db migrate:push`
4. 运行测试：`pnpm db:test` 或 `pnpm --filter @chaincontest/db test`
   - 聚合/摄取回归：`pnpm --filter @chaincontest/db test -- tests/contract/contestQueries.test.ts tests/contract/contestDomainWrites.test.ts tests/contract/ingestionProgress.test.ts`

## 环境变量

| 键名 | 说明 | 默认值 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串（含库名、用户、密码） | 无（必填） |
| `POOL_MIN` | 连接池最小连接数 | `2` |
| `POOL_MAX` | 连接池最大连接数 | `10` |

## 示例

```ts
import { db } from '@chaincontest/db';

await db.init({
  databaseUrl: process.env.DATABASE_URL!,
  validators: loadValidators(),
  metrics: captureDbMetrics,
  errorLogger: (error) => console.error('[db]', error.code, error.message)
});

const lookup = await db.lookupUserWallet({
  userId: 'user-123',
  walletAddress: 'unknown'
});

const contests = await db.queryContests({
  selector: { filter: { chainIds: [1], statuses: ['active'] } },
  includes: { participants: true, leaderboard: { mode: 'latest' }, rewards: true }
});

await db.writeContestDomain({
  action: 'register_participation',
  payload: {
    contestId: contests.items[0]?.contest.contestId!,
    walletAddress: '0xabc000000000000000000000000000000000000a',
    amountWei: '1000000000000000000',
    occurredAt: new Date().toISOString(),
    event: {
      chainId: 1,
      txHash: '0x' + 'f'.repeat(64),
      logIndex: 0
    }
  }
});

const status = await db.readIngestionStatus({ contestId: contests.items[0]?.contest.contestId! });
if (status.status === 'tracked') {
  await db.writeIngestionEvent({
    action: 'advance_cursor',
    payload: {
      contestId: status.contestId!,
      chainId: status.chainId!,
      contractAddress: status.contractAddress!,
      cursorHeight: BigInt(status.cursorHeight ?? '0') + 1n,
      cursorLogIndex: 0
    }
  });
}
```

- 初始化时会自动注册 `@chaincontest/shared-schemas` 校验，所有接口请求必须先通过验证。
- 所有写入函数返回 `{ status: 'applied' | 'noop', cursor?: {...} }` 并抛出统一的 `DbError` 分类，便于上层统一处理。

## Workspace 脚本

- `pnpm db:test`：运行模块契约与幂等测试
- `pnpm --filter @chaincontest/db migrate:generate`：基于 Drizzle schema 生成迁移
- `pnpm --filter @chaincontest/db migrate:push`：将迁移应用到目标数据库

## 观察与运维

- 注册自定义 metrics hook：`registerMetricsHook` 可对接 Prometheus / StatsD，捕获操作耗时与错误分类。
- 摄取任务建议在启动时调用 `readIngestionStatus` 校验游标，再按顺序执行 `writeContestDomain`（业务写入）与 `writeIngestionEvent`（游标推进/事件登记），以保证严格单调。

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
