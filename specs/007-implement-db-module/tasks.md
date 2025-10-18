# Tasks: packages/db 模块接口定义

**Input**: Design documents from `/specs/007-implement-db-module/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: 各用户故事包含必要的契约/幂等测试以满足规格中的成功标准。

**Organization**: 任务按用户故事分组，确保每个故事都可独立实现与验证。部分任务标记 `[P]` 表示在依赖满足后可并行执行（不同文件，不共享上下文）。

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：T006、T007、T012、T017、T022、T027、T032（事务回滚、错误分类、降级路径）
- [ ] 链上真相：T021、T022、T024、T026、T027、T029（链上事件存储与重算支持）
- [ ] 去信任执行：T005、T006、T008、T012、T017、T022、T027（幂等键、显式输入输出）
- [ ] 最小功能与权限：T001、T002、T011、T016、T021、T026（仅交付所需函数与最小权限）
- [ ] 可解释与性能：T004、T009、T014、T019、T024、T029、T031、T032（测试指引、监控、热路径优化与文档）

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化 `packages/db` 子包结构与工作区集成。

- [X] T001 [SETUP] 更新 `pnpm-workspace.yaml` 与根 `package.json`，注册 `packages/db` 工作区与脚本入口。
- [X] T002 [SETUP] 在 `packages/db/` 创建 `package.json`、`tsconfig.json`、`vitest.config.ts`、`drizzle.config.ts` 以及空目录 `src/`, `src/adapters/`, `src/repositories/`, `src/schema/`, `tests/`.
- [X] T003 [SETUP] 添加 `packages/db/.env.sample` 与 `packages/db/README.md`，描述连接配置、脚本及快速启动步骤。
- [X] T004 [SETUP] 将计划中的 Quickstart 摘要写入 `packages/db/README.md` 并在 `docs/` 或 `quickstart.md` 互相引用。
- [X] T005 [SETUP] 在 `packages/db/TODO.md` 添加“commit TODO: Setup scaffolding ready for atomic commit”条目，提示完成以上任务后执行原子化提交。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 构建所有用户故事共享的运行时、指标与校验框架。⚠️ 完成前任何用户故事不可开始。

- [X] T006 [FOUND] 在 `packages/db/src/adapters/connection.ts` 实现基于 `pg` 的连接池、Drizzle 初始化与事务包装，支持 `READ COMMITTED` 隔离。
- [X] T007 [FOUND] 在 `packages/db/src/instrumentation/metrics.ts` 定义指标 hook、错误分类枚举与失败即回滚的降级策略。
- [X] T008 [FOUND] 在 `packages/db/src/bootstrap/register-validators.ts` 集成 `packages/shared/schemas` 的校验注册，确保七个接口入参 fail-closed。
- [X] T009 [FOUND] 配置 `packages/db/tests/setup/vitest.setup.ts` 与 `packages/db/tests/fixtures/`，提供临时数据库、迁移回滚与幂等测试工具。
- [X] T010 [FOUND] 更新 `packages/db/TODO.md`，追加“commit TODO: Foundational utilities ready for commit”条目并标记依赖任务。

**Checkpoint**: 基础设施就绪，可启动用户故事开发。

---

## Phase 3: User Story 1 - 身份解析保持唯一 (Priority: P1) 🎯 MVP

**Goal**: 提供接口①，实现基于用户或钱包的绑定关系读取，确保组合约束。

**Independent Test**: 使用 `lookupUserWallet` 函数模拟“仅凭钱包”与“仅凭用户”请求，验证返回绑定列表与错误分类符合规格。

### Implementation & Tests

- [X] T011 [US1] 在 `packages/db/src/schema/user-bindings.ts` 定义 `user_identities`、`wallet_bindings` 的 Drizzle schema、唯一约束与索引，并生成迁移脚本。
- [X] T012 [US1] 在 `packages/db/src/repositories/userWalletLookup.ts` 实现读取逻辑（含地址归一、结果映射、未绑定处理）。
- [X] T013 [US1] 在 `packages/db/src/index.ts` 暴露 `lookupUserWallet` 函数，调用校验注册与仓储层，统一错误分类。
- [X] T014 [P] [US1] 在 `packages/db/tests/contract/userWalletLookup.test.ts` 编写契约与幂等测试场景，覆盖“未知用户/钱包”组合与未绑定返回。
- [ ] T015 [US1] 在 `packages/db/TODO.md` 添加“commit TODO: US1 lookup ready for commit”记录，指向应包含的文件与验证步骤。

**Checkpoint**: User Story 1 可独立演示与测试，通过上述测试后可视为 MVP。

---

## Phase 4: User Story 2 - 钱包绑定治理 (Priority: P2)

**Goal**: 提供接口②，支持 `bind`/`unbind` 操作的幂等与冲突控制。

**Independent Test**: 通过 `mutateUserWallet` 对同一钱包重复执行 `bind`/`unbind`，验证幂等、冲突拒绝与审计字段更新。

### Implementation & Tests

- [ ] T016 [US2] 扩展 `packages/db/src/schema/user-bindings.ts`，加入触发器/约束以记录 `bound_at`、`created_by` 等审计字段，并确保唯一索引覆盖冲突场景。
- [ ] T017 [US2] 在 `packages/db/src/repositories/userWalletMutations.ts` 编写事务逻辑：执行 `bind`/`unbind`、处理幂等键与冲突映射。
- [ ] T018 [US2] 在 `packages/db/src/index.ts` 暴露 `mutateUserWallet`，封装输入校验、事务执行与分类化返回。
- [ ] T019 [P] [US2] 在 `packages/db/tests/contract/userWalletMutations.test.ts` 编写重复绑定、跨用户冲突与无效解绑的测试。
- [ ] T020 [US2] 更新 `packages/db/TODO.md`，追加“commit TODO: US2 mutations ready for commit”条目，列出需一起提交的文件与验证命令。

**Checkpoint**: User Stories 1 & 2 均可独立运行，绑定治理功能可回放幂等校验。

---

## Phase 5: User Story 3 - 比赛视图聚合 (Priority: P2)

**Goal**: 构建接口③与接口⑤，支持比赛多视图聚合、筛选、分页及用户视角聚合。

**Independent Test**: 使用 `queryContests` 和 `queryUserContests` 组合不同选择器、分页与子视图开关，核对返回的比赛详情、排行榜与奖励记录。

### Implementation & Tests

- [ ] T021 [US3] 在 `packages/db/src/schema/contest-domain.ts` 定义 `contests`、`contest_snapshots`、`participants`、`leaderboard_versions`、`reward_claims` 表结构、检查与索引，并生成迁移。
- [ ] T022 [US3] 在 `packages/db/src/repositories/contestQueries.ts` 实现过滤、分页、子视图聚合与排序逻辑，含游标编码。
- [ ] T023 [US3] 在 `packages/db/src/index.ts` 暴露 `queryContests` 与 `queryUserContests`，整合校验与响应映射。
- [ ] T024 [P] [US3] 在 `packages/db/tests/contract/contestQueries.test.ts` 编写多选择器、分页、关键字模糊与不受支持链标识的测试。
- [ ] T025 [US3] 更新 `packages/db/TODO.md`，记录“commit TODO: US3 contest views ready for commit”，列出依赖迁移与测试。

**Checkpoint**: User Stories 1–3 完成，可交付完整的读取与聚合能力。

---

## Phase 6: User Story 4 - 摄取进度与事件回放 (Priority: P3)

**Goal**: 实现接口④、接口⑥、接口⑦的写入与进度读取，保证事件幂等与游标单调。

**Independent Test**: 通过 `writeContestDomain` 重放同一事件、尝试倒序游标，再用 `readIngestionStatus` 与 `writeIngestionEvent` 核对状态与拒绝逻辑。

### Implementation & Tests

- [ ] T026 [US4] 在 `packages/db/src/schema/ingestion.ts` 定义 `ingestion_cursors`、`ingestion_events` 结构与唯一约束，支持链标识+地址查询。
- [ ] T027 [US4] 在 `packages/db/src/repositories/contestDomainWrites.ts` 实现 `track`、`ingest_snapshot`、`register_participation`、`write_leaders_version`、`seal`、`append_reward_claim` 的事务处理与幂等键检查。
- [ ] T028 [US4] 在 `packages/db/src/index.ts` 暴露 `writeContestDomain`、`readIngestionStatus`、`writeIngestionEvent`，处理顺序错误返回与游标更新。
- [ ] T029 [P] [US4] 在 `packages/db/tests/contract/contestDomainWrites.test.ts` 与 `packages/db/tests/contract/ingestionProgress.test.ts` 编写事件重复、游标递增、未跟踪比赛返回的测试。
- [ ] T030 [US4] 更新 `packages/db/TODO.md`，添加“commit TODO: US4 ingestion ready for commit”，确保列出所需回归测试与迁移。

**Checkpoint**: 四个用户故事全部完成，可独立回放链上事件并对外提供完整接口。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 文档、观测与最终对齐。

- [ ] T031 [POLISH] 将最终快速启动、迁移与测试指南同步到 `specs/007-implement-db-module/quickstart.md` 与 `packages/db/README.md`。
- [ ] T032 [POLISH] 在 `packages/db/src/instrumentation/metrics.ts` 与 `packages/db/src/index.ts` 补充监控 hook 示例、统一错误日志，并更新 `docs/architecture.md`（如存在）。
- [ ] T033 [POLISH] 在 `packages/db/TODO.md` 添加“commit TODO: Release polish ready for final commit”，汇总需一起提交的收尾变更与验证命令。

---

## Dependencies & Execution Order

- **Phase 顺序**: Setup → Foundational → US1 → US2 → US3 → US4 → Polish。
- **User Stories**:
  - US1 (P1) 无其他用户故事依赖，完成后形成 MVP。
  - US2 (P2) 依赖 US1 的 schema 与导出函数，但实现完成后可独立验证绑定治理。
  - US3 (P2) 依赖 Foundational + US1 的基础工具，可与 US2 并行只要 schema 合并冲突处理完毕。
  - US4 (P3) 依赖 Foundational 与 US3 的比赛实体（事件写入需引用比赛表），完成后解锁全量链上摄取。
- **Cross-Phase**: Polish 待所有已选用户故事完成后执行。

---

## Parallel Execution Examples

### User Story 1
- 并行示例：在完成 T011 后，可同时推进 `[P]` 测试任务 T014 与文档补充（若有）。

### User Story 2
- 并行示例：T017 完成后，测试任务 T019 可与 T018（接口导出）并行编写，确保快速反馈。

### User Story 3
- 并行示例：T022 完成基础查询后，T024 `[P]` 测试可与 T023 的接口层实现并行推进。

### User Story 4
- 并行示例：在 T027 事务逻辑确定后，T029 `[P]` 测试可与 T028 接口导出同步进行，覆盖游标与事件回放。

---

## Implementation Strategy

### MVP First
1. 完成 Phase 1–2，建立稳定基础。
2. 按顺序完成 US1（T011–T015），通过契约测试与快速启动验证，即可交付 MVP。

### Incremental Delivery
1. MVP（US1）上线后，可单独部署或合并到主分支。
2. US2 增强绑定治理，完成后再次独立验证再合入。
3. US3 提供聚合读取功能，可与 US2 并行推进。
4. US4 最后引入摄取写入，确保在前述功能稳定后再扩展范围。

### Parallel Team Strategy
1. 团队协作完成 Setup + Foundational。
2. 分配成员：A 负责 US1→US2，B 负责 US3，C 负责 US4；通过 `[P]` 任务并行推进测试与实现。
3. 每个阶段结束后执行对应的 commit TODO，保持原子化提交与可追溯性。
