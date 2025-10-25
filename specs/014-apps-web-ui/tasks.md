# Tasks: Apps/Web-UI 核心功能

**Input**: 设计文档位于 `/specs/014-apps-web-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 每个用户故事提供至少一条端到端验证任务；实现过程中可视需求补充更多测试。

**Organization**: 任务按照优先级用户故事分组，确保每个旅程均可独立交付与验证。

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：完成 T030–T033 以确保所有链上操作均遵循“计划→确认→执行”并在失败时提供降级反馈
- [ ] 链上真相：完成 T009、T018、T020、T032 确保所有视图依赖链上快照并展示区块锚点/刷新入口
- [ ] 去信任执行：完成 T005、T008、T029、T033 构建显式输入输出与幂等执行边界
- [ ] 最小功能与权限：完成 T001–T011、T017、T025 限定最小可行范围并在入口禁用未满足条件的操作
- [ ] 可解释与性能：完成 T016、T022、T027、T036、T037–T040 交付旅程级测试、监控与性能记录

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 `apps/web-ui` 与 `packages/shared/i18n` 的基础工程结构与依赖。

- [X] T001 创建 `apps/web-ui` Next.js 14 工程骨架与 `package.json`
- [X] T002 更新 `pnpm-workspace.yaml` 与根 `package.json` 以包含新应用与共享包
- [X] T003 配置 Tailwind/PostCSS 与全局样式 (`apps/web-ui/tailwind.config.ts`, `postcss.config.js`, `src/styles/globals.css`)
- [X] T004 初始化 `packages/shared/i18n` 包（`package.json`, `tsconfig.json`, `src/index.ts`, `messages/` 目录）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 构建所有用户故事共享的基础设施。

- [X] T005 组合全局 Provider（QueryClient、wagmi、RainbowKit、next-intl）于 `apps/web-ui/src/app/providers.tsx`
- [X] T006 填充共享文案与常量骨架 (`packages/shared/i18n/messages/{locale}.json`, `src/constants.ts`)
- [X] T007 创建全局布局与导航骨架 (`apps/web-ui/src/app/layout.tsx`, `src/components/LayoutShell.tsx`)
- [X] T008 实现 API 请求工具与 TanStack Query 默认配置 (`apps/web-ui/src/lib/api/client.ts`)
- [X] T009 构建运行时配置 Query 与 204 降级提示 (`apps/web-ui/src/features/runtime/hooks/useRuntimeConfig.ts`)
- [X] T010 实现统一错误呈现 Hook 与组件 (`apps/web-ui/src/lib/errors/useErrorPresenter.ts`, `src/components/ErrorBanner.tsx`)
- [X] T011 集成网络/会话守卫逻辑 (`apps/web-ui/src/features/network/NetworkGate.tsx`) 并挂载至布局

**Checkpoint**: 完成以上任务后方可开始用户故事实现。

---

## Phase 3: User Story 1 - 连接钱包并建立会话 (Priority: P1) 🎯 MVP

**Goal**: 支持用户在受支持网络上完成 SIWE 登录/登出并查看当前会话信息。

**Independent Test**: 运行 `pnpm --filter apps/web-ui test:e2e -- auth.spec.ts`，验证连接→签名→展示地址→退出流程。

- [X] T012 [US1] 实现 SIWE Start/Verify/Logout API 封装 (`apps/web-ui/src/features/auth/api/siwe.ts`)
- [X] T013 [US1] 构建会话状态查询 Hook (`apps/web-ui/src/features/auth/hooks/useSession.ts`)
- [X] T014 [P] [US1] 开发钱包连接/登出组件 (`apps/web-ui/src/features/auth/components/WalletConnectButton.tsx`)
- [X] T015 [US1] 将会话信息与守卫集成进头部导航 (`apps/web-ui/src/components/Header.tsx`)
- [X] T016 [US1] 编写 Playwright E2E 用例覆盖登录/登出 (`apps/web-ui/tests/e2e/auth.spec.ts`)

**Checkpoint**: User Story 1 可独立演示，作为最小可行版本。

---

## Phase 4: User Story 2 - 浏览比赛与详情 (Priority: P2)

**Goal**: 登录用户可筛选浏览比赛列表并查看详情、排行榜与区块锚点。

**Independent Test**: 运行 `pnpm --filter apps/web-ui test:e2e -- contests-list.spec.ts` 验证列表筛选→详情浏览旅程。

- [X] T017 [US2] 实现比赛列表与详情 API 封装 (`apps/web-ui/src/features/contests/api/contests.ts`)
- [X] T018 [US2] 创建列表页面入口与查询参数映射 (`apps/web-ui/src/app/(authenticated)/contests/page.tsx`)
- [ ] T019 [P] [US2] 构建列表 UI 与空/加载态 (`apps/web-ui/src/features/contests/components/ContestList.tsx`)
- [ ] T020 [US2] 实现比赛详情页面呈现奖池、容量、排行榜、区块信息 (`apps/web-ui/src/app/(authenticated)/contests/[contestId]/page.tsx`)
- [ ] T021 [US2] 实现分页与刷新控件 (`apps/web-ui/src/features/contests/components/ContestPagination.tsx`)
- [ ] T022 [US2] 编写 Playwright 用例覆盖列表→详情 (`apps/web-ui/tests/e2e/contests-list.spec.ts`)

---

## Phase 5: User Story 3 - 创建并管理我的比赛 (Priority: P3)

**Goal**: 主办方可创建比赛并在“我创建的比赛”中查看部署状态。

**Independent Test**: 运行 `pnpm --filter apps/web-ui test:e2e -- contest-create.spec.ts` 验证创建流程与结果展示。

- [ ] T023 [US3] 实现比赛创建 API 封装 (`apps/web-ui/src/features/contests/api/createContest.ts`)
- [ ] T024 [US3] 构建创建比赛表单（React Hook Form + Zod）(`apps/web-ui/src/features/contests/components/CreateContestForm.tsx`)
- [ ] T025 [P] [US3] 添加创建入口页面与路由 (`apps/web-ui/src/app/(authenticated)/contests/create/page.tsx`)
- [ ] T026 [US3] 实现“我创建的比赛”列表组件与分页 (`apps/web-ui/src/features/contests/components/MyCreatedContests.tsx`)
- [ ] T027 [US3] 编写 Playwright 用例覆盖创建流程 (`apps/web-ui/tests/e2e/contest-create.spec.ts`)

---

## Phase 6: User Story 4 - 参赛报名、赛后结算与领奖 (Priority: P4)

**Goal**: 参赛者可生成报名计划、执行报名、赛后结算/赎回/再平衡，并在个人页面查阅领奖记录与最近交互摘要。

**Independent Test**: 运行 `pnpm --filter apps/web-ui test:e2e -- contest-participation.spec.ts` 覆盖报名→结算/领奖旅程。

- [ ] T028 [US4] 封装报名与领奖计划/执行 API (`apps/web-ui/src/features/participation/api/registration.ts`)
- [ ] T029 [US4] 封装结算、本金赎回、再平衡计划/执行 API (`apps/web-ui/src/features/participation/api/postgame.ts`)
- [ ] T030 [US4] 构建报名流程面板（计划展示、授权提示、执行按钮）(`apps/web-ui/src/features/participation/components/RegistrationPanel.tsx`)
- [ ] T031 [US4] 构建领奖流程面板及失败信息呈现 (`apps/web-ui/src/features/participation/components/RewardClaimPanel.tsx`)
- [ ] T032 [US4] 构建赛后操作面板呈现结算/赎回/再平衡计划 (`apps/web-ui/src/features/participation/components/PostgamePanel.tsx`)
- [ ] T033 [US4] 将报名、领奖、赛后面板集成进比赛详情，依据阶段与网络做前置否决 (`apps/web-ui/src/app/(authenticated)/contests/[contestId]/page.tsx`)
- [ ] T034 [P] [US4] 实现“我参加的比赛”页面展示报名与领奖历史 (`apps/web-ui/src/app/(authenticated)/profile/participation/page.tsx`)
- [ ] T035 [US4] 实现最近一次链上交互摘要 Hook 与 UI (`apps/web-ui/src/features/participation/hooks/useLastInteractionSummary.ts`，`src/features/participation/components/InteractionSummary.tsx`)
- [ ] T036 [US4] 编写 Playwright 用例覆盖报名、领奖、赛后操作与摘要展示 (`apps/web-ui/tests/e2e/contest-participation.spec.ts`)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 文档、监控、性能与可访问性收尾，满足宪法与成功标准。

- [ ] T037 更新 `specs/014-apps-web-ui/quickstart.md` 补充运行步骤、环境变量与测试指引
- [ ] T038 实现前端关键事件日志/监控封装 (`apps/web-ui/src/lib/telemetry.ts`) 并在链上交互中调用
- [ ] T039 记录性能与可访问性检查结果（Lighthouse/Playwright 指标）于 `docs/reports/web-ui-readiness.md`
- [ ] T040 记录并校验登录、报名、领奖流程耗时（脚本输出对比 SC-001～SC-003）`apps/web-ui/tests/perf/user-flows.perf.ts`

---

## Dependencies & Execution Order

1. **Phase 1 → Phase 2**：完成基础工程与包管理后，方可配置 Provider、国际化与守卫。
2. **Phase 2 → User Stories**：所有用户故事依赖 Provider、运行时配置、错误处理与守卫基础设施。
3. **User Stories 顺序**：US1（P1）→ US2（P2）→ US3（P3）→ US4（P4）。US2-4 依赖 US1 的会话能力与前置守卫。
4. **Playwright 测试**：T016、T022、T027、T036 在对应故事功能稳定后执行。
5. **Polish 阶段**：待目标用户故事完成后统一处理。

### Parallel Opportunities
- T014 可与 T015 并行开发（分别负责组件与集成）。
- T019 与 T021 可在 T017 完成后并行处理 UI 与控件。
- T025 与 T026 可在 API 封装完成后并行推进路由与列表。
- T030–T032 可由不同成员分别负责报名、领奖、赛后面板；T034 与 T035 可并行实现列表与摘要。
- 全部 Playwright 用例（T016、T022、T027、T036）在对应功能稳定后可并行编写与执行。

## Implementation Strategy

1. **MVP（US1）**：完成 Phase 1–2 后立即实现 User Story 1，并通过 T016 验证登录闭环，可快速演示。
2. **增量交付**：依序交付 US2、US3、US4，每完成一条旅程即运行相应 E2E 测试并可选择性上线。
3. **并行策略**：一名工程师专注 US1，另一名在基础完成后并行 US2/US3，第三名主攻 US4 面板与摘要组件。
4. **收尾**：Polish 阶段统一整理文档、监控与性能数据（含 T040 性能校验），确保符合宪法及成功标准。
