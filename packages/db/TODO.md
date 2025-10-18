# packages/db TODOs

- [ ] commit TODO: Setup scaffolding ready for atomic commit
  - 包含文件：`pnpm-workspace.yaml`、根 `package.json`、`packages/db` scaffolding（package.json、tsconfig、vitest、drizzle、README、.env.sample、src/index.ts）
  - 验证：`pnpm install`、`pnpm db:test`（待实现测试时启用）
- [ ] commit TODO: Foundational utilities ready for commit
  - 依赖任务：T006、T007、T008、T009
  - 包含文件：`src/adapters/connection.ts`、`src/instrumentation/metrics.ts`、`src/bootstrap/register-validators.ts`、`tests/fixtures/*`、`tests/setup/vitest.setup.ts`、`vitest.config.ts`
  - 验证：`pnpm db:test`（需提供本地 PostgreSQL `DATABASE_URL`）
- [ ] commit TODO: US1 lookup ready for commit
  - 依赖任务：T011、T012、T013、T014
  - 包含文件：`src/schema/user-bindings.ts`、`src/repositories/userWalletLookup.ts`、`src/index.ts`、`tests/contract/userWalletLookup.test.ts`、`migrations/0001_user_bindings.sql`
  - 验证：`pnpm db:test -- --runInBand tests/contract/userWalletLookup.test.ts`
