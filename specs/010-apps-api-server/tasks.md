---
description: "Task list template for feature implementation"
---

# Tasks: apps/api-server

**Input**: Design documents from `/specs/010-apps-api-server/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: 规格与计划明确列出 Vitest + Supertest 契约测试，因此各用户故事均包含对应测试任务，按 TDD 顺序先写测试再实现。

**Organization**: Tasks 按用户故事分组，保证每个故事都可独立交付与验证。

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：T001–T011、T014–T018、T028–T046 落实会话校验、错误回滚、限流与降级策略
- [ ] 链上真相：T021–T035 明确 `@chaincontest/chain` 作为唯一链上真相，输出区块高度与重算入口
- [ ] 去信任执行：T006–T011、T017、T028–T041 拆分确定性组件，确保幂等入口与显式边界
- [ ] 最小功能与权限：T001–T046 范围限定于 Web UI 所需端点与最小权限配置
- [ ] 可解释与性能：T012–T046 安排旅程级测试、结构化日志、慢请求记录与 quickstart 复核

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 可并行执行（不同文件、无依赖）
- **[Story]**: 任务归属用户故事（US1, US2, US3, US4）

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化 `apps/api-server` 工程结构与基础依赖

- [X] T001 [US1] 在 `apps/api-server/` 创建 Next.js Route Handlers 应用骨架，更新 `pnpm-workspace.yaml`、`package.json` 脚本与 `next.config.js`
- [X] T002 [US1] 安装并锁定核心依赖（Next.js、Auth.js、@siwe/kit、pino、pg-boss、@chaincontest/*），更新 `apps/api-server/package.json`
- [X] T003 [P] [US1] 建立目录结构（`app/api/`, `lib/`, `auth/`, `tests/`）与基础 `tsconfig.json`、ESLint/Prettier 继承配置

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事依赖的核心基础能力

**⚠️ CRITICAL**: 完成本阶段前不得开始任一用户故事

- [X] T004 [US1] 在 `apps/api-server/lib/config/env.ts` 实现环境变量加载与校验（包含 `DATABASE_URL`, `NEXTAUTH_SECRET`, 限流参数）
- [X] T005 [US1] 在 `apps/api-server/lib/db/client.ts` 配置 `@chaincontest/db` 连接池封装，暴露只读/事务接口
- [X] T006 [US1] 在 `apps/api-server/auth/options.ts` 配置 Auth.js SIWE provider + Postgres adapter（依赖 T004, T005）
- [X] T007 [US1] 在 `apps/api-server/lib/auth/session.ts` 构建会话上下文工具与 fail-closed 校验逻辑（依赖 T006）
- [X] T008 [P] [US1] 在 `apps/api-server/lib/http/errors.ts` 定义错误分类、HTTP 状态映射与审计记录钩子
- [X] T009 [P] [US1] 在 `apps/api-server/lib/observability/logger.ts` 集成 pino 日志与请求级 traceId
- [X] T010 [P] [US1] 在 `apps/api-server/lib/middleware/rateLimit.ts` 实现基于会话/IP 的轻量配额中间件
- [X] T011 [US2] 在 `apps/api-server/lib/health/dependencies.ts` 建立健康检查依赖探针（数据库、Auth.js、链 RPC）

**Checkpoint**: 基础设施就绪，可进入用户故事实现

---

## Phase 3: User Story 1 - 登录并建立会话 (Priority: P1) 🎯 MVP

**Goal**: 提供 SIWE 登录、会话建立与登出，受保护端点可验证会话

**Independent Test**: 通过 Supertest 走完整个 SIWE 流程，验证成功登录后可访问示例受保护资源，登出或过期后被拒绝

### Tests for User Story 1

- [X] T012 [P] [US1] 在 `apps/api-server/tests/api/auth.siwe-start.test.ts` 编写 Supertest 契约测试，验证 `/api/auth/siwe/start` 返回 nonce 与过期时间
- [X] T013 [P] [US1] 在 `apps/api-server/tests/api/auth.siwe-session.test.ts` 编写登录-登出流程测试，覆盖 `/api/auth/siwe/verify` 与 `/api/auth/logout`

### Implementation for User Story 1

- [X] T014 [US1] 实现 `app/api/auth/siwe/start/route.ts`，生成 nonce 并记录配额使用（依赖 T012）
- [X] T015 [US1] 实现 `app/api/auth/siwe/verify/route.ts`，校验签名、创建会话并设置 cookie（依赖 T013, T014）
- [X] T016 [US1] 实现 `app/api/auth/logout/route.ts`，销毁会话并清除 cookie（依赖 T015）
- [X] T017 [US1] 在 `apps/api-server/middleware.ts` 集成会话守卫与限流，确保受保护路径未登录即返回 401（依赖 T015, T010）
- [X] T018 [US1] 在 `apps/api-server/lib/auth/session.ts` 补充会话续期与异常回滚逻辑，并输出审计日志（依赖 T017）

**Checkpoint**: 用户可完成 SIWE 登录/登出，受保护端点正确拒绝未授权请求

---

## Phase 4: User Story 2 - 加载运行时配置与比赛数据 (Priority: P1)

**Goal**: 返回前端初始化所需运行时配置与比赛快照

**Independent Test**: 通过 Supertest 调用 `/api/runtime/config` 与 `/api/contests*`，验证字段完整与异常处理

### Tests for User Story 2

- [X] T019 [P] [US2] 在 `apps/api-server/tests/api/runtime-config.test.ts` 编写契约测试，覆盖 200/204/503 响应
- [X] T020 [P] [US2] 在 `apps/api-server/tests/api/contests.test.ts` 编写列表与详情接口测试，模拟缺失比赛与权限校验

### Implementation for User Story 2

- [X] T021 [US2] 在 `apps/api-server/lib/contests/repository.ts` 构建基于 `@chaincontest/db` 的比赛查询与映射工具（依赖 T005）
- [X] T022 [US2] 实现 `app/api/contests/route.ts`，返回比赛列表并应用分页/过滤（依赖 T020, T021, T017）
- [X] T023 [US2] 实现 `app/api/contests/[contestId]/route.ts`，返回比赛快照与可选排行榜（依赖 T020, T021）
- [X] T024 [US2] 实现 `app/api/runtime/config/route.ts`，合并环境覆盖与 DB 配置并处理缺失场景（依赖 T019, T004）

**Checkpoint**: Web UI 可加载运行时配置与比赛数据，错误场景获得明确分类提示

---

## Phase 5: User Story 3 - 生成链上操作计划 (Priority: P1)

**Goal**: 针对报名、换仓、结算、领奖、本金赎回生成链上计划

**Independent Test**: 通过 Supertest 调用各计划端点，验证 `status`、`requiredApprovals`、`derivedAt` 与阻断原因

### Tests for User Story 3

- [X] T025 [P] [US3] 在 `apps/api-server/tests/api/contest-registration-plan.test.ts` 编写测试，覆盖 ready/blocked 报名场景
- [X] T026 [P] [US3] 在 `apps/api-server/tests/api/contest-rebalance-plan.test.ts` 编写测试，覆盖合法与额度超限换仓
- [X] T027 [P] [US3] 在 `apps/api-server/tests/api/contest-postgame-plan.test.ts` 编写测试，覆盖结算/领奖/赎回的 applied/noop/blocked 分支

### Implementation for User Story 3

- [X] T028 [US3] 在 `apps/api-server/lib/contests/definitionBuilder.ts` 聚合比赛定义与参赛者资料，生成 `ContestDefinition`（依赖 T021）
- [X] T029 [US3] 在 `apps/api-server/lib/chain/gateway.ts` 封装 `@chaincontest/chain` 工厂、缓存与错误包装（依赖 T028）
- [X] T030 [US3] 实现 `app/api/contests/[contestId]/registration-plan/route.ts`，返回报名计划（依赖 T025, T029）
- [X] T031 [P] [US3] 实现 `app/api/contests/[contestId]/rebalance-plan/route.ts`，返回换仓计划（依赖 T026, T029）
- [X] T032 [P] [US3] 实现 `app/api/contests/[contestId]/settlement/route.ts`，返回结算结果（依赖 T027, T029）
- [X] T033 [P] [US3] 实现 `app/api/contests/[contestId]/reward-claim/route.ts`（依赖 T027, T029）
- [X] T034 [P] [US3] 实现 `app/api/contests/[contestId]/principal-redemption/route.ts`（依赖 T027, T029）
- [X] T035 [US3] 在 `apps/api-server/lib/http/responses.ts` 统一封装计划响应，追加 `derivedAt` 与审计字段（依赖 T030–T034）

**Checkpoint**: 所有链上计划端点可独立返回 deterministic 结果，与链网关契约一致

---

## Phase 6: User Story 4 - 管理站内钱包绑定与账号数据 (Priority: P2)

**Goal**: 提供钱包绑定列表、绑定、解绑能力并记录审计信息

**Independent Test**: 通过 Supertest 验证绑定成功、重复绑定冲突、解绑幂等

### Tests for User Story 4

- [ ] T036 [US4] 在 `apps/api-server/tests/api/wallet-bindings.test.ts` 编写绑定/解绑/冲突场景测试（依赖 T017）

### Implementation for User Story 4

- [ ] T037 [US4] 在 `apps/api-server/lib/wallets/repository.ts` 封装 `@chaincontest/db` 钱包绑定读写（依赖 T005）
- [ ] T038 [US4] 在 `app/api/wallets/route.ts` 实现 GET 处理，返回当前用户绑定列表（依赖 T036, T037）
- [ ] T039 [US4] 在 `app/api/wallets/route.ts` 实现 POST 处理，创建绑定并映射冲突错误（依赖 T036, T037）
- [ ] T040 [US4] 在 `app/api/wallets/[walletAddress]/route.ts` 实现 DELETE，执行解绑幂等逻辑（依赖 T036, T037）
- [ ] T041 [US4] 在 `apps/api-server/lib/wallets/actorContext.ts` 生成审计 `actorContext`（用户/会话/来源），供绑定写库使用（依赖 T037, T017）

**Checkpoint**: 用户可管理钱包绑定，冲突与审计逻辑按预期运行

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 横切改进与交付前收尾

- [ ] T042 [P] 更新 `specs/010-apps-api-server/quickstart.md`，补充新增环境变量与端点示例（依赖 T024–T041）
- [ ] T043 运行 quickstart 流程，记录测试账号流程与慢查询统计，输出至 `docs/development/local-testing.md` 附录
- [ ] T044 [P] 在 `apps/api-server/lib/observability/logger.ts` 增加慢请求告警与敏感字段脱敏（依赖 T009, T035）
- [ ] T045 加固 `apps/api-server/lib/middleware/rateLimit.ts` 限流策略，加入告警计数并验证在负载下的降级路径（依赖 T010, T043）
- [ ] T046 实现 `app/api/health/route.ts`，聚合依赖探针结果并返回结构化状态（依赖 T011, T035, T043）

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 – Setup** → 无前置，可立即开始
- **Phase 2 – Foundational** → 依赖 Phase 1；完成前阻塞所有用户故事
- **Phase 3 – US1** → 依赖 Phase 2；完成后形成 MVP
- **Phase 4 – US2** → 依赖 Phase 3（会话守卫已就绪）与 Phase 2
- **Phase 5 – US3** → 依赖 Phase 4（比赛数据）与 Phase 2
- **Phase 6 – US4** → 依赖 Phase 3（会话）与 Phase 2
- **Phase 7 – Polish** → 依赖前述所有阶段

### User Story Dependencies
- **US1**：无其他故事依赖，是 MVP 必备
- **US2**：依赖 US1 提供会话守卫，可并行交付但需在 US1 后验证
- **US3**：依赖 US2 的比赛数据与 US1 会话；链上计划基于两者
- **US4**：依赖 US1 会话，但与 US2/US3 在完成后可并行

### Within Each User Story
- 测试任务（T012–T013, T019–T020, T025–T027, T036）需在实现前完成并观察失败
- 模型/仓库 → 服务层 → 路由实现 → 响应封装
- 每个故事完成后执行 Checkpoint 验证，保持独立可交付

### Parallel Opportunities
- Phase 1 中 T003 可与其他成员并行完成目录与配置
- Phase 2 中 T008–T010 可并行，因为写入不同文件
- US3 中多条计划端点（T031–T034）在服务层准备好后可并行实现
- US4 中列表、绑定、解绑路由位于不同文件，可分给不同成员

---

## Parallel Example: User Story 3

```bash
# 并行执行 Supertest 契约
pnpm --filter apps/api-server test --run tests/api/contest-registration-plan.test.ts
pnpm --filter apps/api-server test --run tests/api/contest-rebalance-plan.test.ts
pnpm --filter apps/api-server test --run tests/api/contest-postgame-plan.test.ts

# 服务准备完成后并行开发端点
code apps/api-server/app/api/contests/[contestId]/rebalance-plan/route.ts &
code apps/api-server/app/api/contests/[contestId]/settlement/route.ts &
code apps/api-server/app/api/contests/[contestId]/reward-claim/route.ts &
code apps/api-server/app/api/contests/[contestId]/principal-redemption/route.ts &
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. 完成 Phase 1 + Phase 2 基础设施
2. 实现 Phase 3（US1）：SIWE 登录与会话守卫
3. 运行 US1 测试套件与手动验证受保护端点
4. 若需要迭代发布，可在此处交付最小可运行版本

### Incremental Delivery
1. MVP (US1) 完成并验证
2. 追加 US2（运行时配置/比赛数据）→ 验证前端初始化旅程
3. 追加 US3（链上计划）→ 验证报名/换仓/领奖功能
4. 追加 US4（钱包绑定）→ 补全账号治理能力
5. 最后处理 Phase 7 polish 任务，确保观测、安全与文档完善

### Parallel Team Strategy
1. 团队共同完成 Phase 1–2
2. US1 完成后：
   - 开发者 A：US2（配置/比赛数据）
   - 开发者 B：US3（链上计划）
   - 开发者 C：US4（钱包绑定）
3. 最终协作完成 Phase 7，集中处理观测、限流与文档

---

## Notes
- [P] 任务位于不同文件且无显式依赖，可并行执行
- 每个用户故事保持独立可测试，遵循“先测后实现”
- 完成任务后执行原子化 commit，保持仓库整洁
- 任意阶段可暂停并通过相应测试验证交付质量
