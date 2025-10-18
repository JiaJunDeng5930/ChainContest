# Quickstart — packages/db 模块

> 同步参考：`packages/db/README.md` 维护相同的概要步骤，确保两处内容保持一致。

## 1. 安装依赖
```bash
pnpm install
```
> Monorepo 已配置 workspace，新增 `packages/db` 会自动被识别。

## 2. 配置环境变量
在仓库根目录创建 `packages/db/.env.local`（或使用现有 secrets 管理）并设置：
```
DATABASE_URL=postgres://user:password@localhost:5432/chaincontest
POOL_MIN=2
POOL_MAX=10
```
> 连接字符串需指向可写的 PostgreSQL 实例，用于开发与测试。生产环境通过宿主服务注入。

## 3. 初始化数据库
```bash
pnpm --filter @chaincontest/db migrate:generate
pnpm --filter @chaincontest/db migrate:push
```
> 生成并应用 Drizzle schema，确保唯一约束、索引与检查生效。

## 4. 运行模块测试
```bash
pnpm --filter @chaincontest/db test
# 精准验证最新故事的契约
pnpm --filter @chaincontest/db test -- tests/contract/contestQueries.test.ts tests/contract/contestDomainWrites.test.ts tests/contract/ingestionProgress.test.ts
```
- 契约测试会覆盖七个接口的幂等、顺序与错误分类。
- 若需集成测试，可在 `packages/db/tests/contract` 中添加新旅程。

## 5. 在上层服务中使用
```ts
import { db } from '@chaincontest/db';

await db.init({
  databaseUrl: process.env.DATABASE_URL,
  metrics: captureDbMetrics,
  errorLogger: (error) => console.error('[db]', error.code, error.message)
});

const result = await db.lookupUserWallet({
  userId: 'user-123',
  walletAddress: 'unknown',
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
      cursorHeight: BigInt(status.cursorHeight ?? '0') + 1n
    }
  });
}
```
- 调用前必须确保 `packages/shared/schemas` 注册流程已执行（在 `db.init` 内完成）。
- 所有写入函数返回 `{ status: 'applied' | 'noop', cursor?: {...} }` 结构，并映射统一错误分类枚举。

## 6. 观察与运维
- 模块暴露 `registerMetricsHook`，可对接宿主的 Prometheus 或 StatsD 管线。
- 对于摄取任务，建议在作业启动前调用 `readIngestionStatus` 校验游标，再依次执行 `writeContestDomain`（业务写入）与 `writeIngestionEvent`（游标推进/事件登记），确保严格单调。

## 7. 回滚策略
- 任何写接口失败将自动回滚事务；如检测到数据偏差，可通过 `drizzle-kit introspect` + 快照对账恢复。
- 重大 schema 变更前需导出最新 `contest_snapshots` 与 `ingestion_events`，以确保链上重算能力。
