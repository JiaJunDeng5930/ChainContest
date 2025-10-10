# Tasks: 开发者合约调试前端重建

**Input**: Design documents from `/specs/002-bug-localhost-port/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: 未在规格中要求预先编写测试，本清单不包含独立测试任务；各故事的验收通过其独立测试标准验证。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：T006, T012, T018, T023 确保链上写操作前置校验、失败回滚与阻断策略
- [ ] 链上真相：T009, T012, T015 保证以链上回执/事件为唯一真相并可重放
- [ ] 去信任执行：T006, T012, T015 拆分输入/校验/提交/回执流程，保持幂等与显式边界
- [ ] 最小功能与权限：T001, T002, T014 限定仅暴露合约原生接口与最小依赖
- [ ] 可解释与性能：T016, T017, T025 提供可审计日志与导出，同时保持秒级反馈

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, Setup, Foundation, Polish)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化前端重建所需的基础结构与依赖

- [X] T001 [Setup] 清理 React 旧结构，移除 `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/app/`, `frontend/src/components/`，并创建新的入口 `frontend/src/main.ts` 与样式目录 `frontend/src/styles/`
- [X] T002 [P] [Setup] 更新 `frontend/package.json`，移除 React 相关依赖，引入 `ethers` 与必要的 `htmx`，同步 `pnpm-lock.yaml`
- [X] T003 [Setup] 调整 `frontend/vite.config.ts`，改用 `frontend/src/main.ts` 作为入口并读取 `VITE_DEV_PORT` 配置
- [X] T004 [P] [Setup] 新建 `frontend/.env.example`，列出 `VITE_RPC_URL`, `VITE_CHAIN_ID`, `VITE_DEV_PORT`, `VITE_CONTRACTS_PATH`, `VITE_DEFAULT_ACCOUNT` 等键

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 构建所有用户故事共享的核心服务与页面骨架  
**⚠️ CRITICAL**: 完成前不得开始任何用户故事实现

- [X] T005 [Foundation] 实现配置加载与校验模块 `frontend/src/services/config.ts`，从 `import.meta.env` 与 `/api/runtime/config` 汇总配置并验证字段完整性
- [X] T006 [P] [Foundation] 编写 RPC 提供者工厂 `frontend/src/services/provider.ts`，调用 `eth_accounts`/`personal_listAccounts` 验证节点解锁账户，失败时抛出阻断错误
- [X] T007 [Foundation] 定义领域类型与状态模型 `frontend/src/lib/types.ts`，覆盖 EnvironmentConfig、ContractDescriptor、ContractFunction、CallRequest、LogEntry、ErrorDetail
- [X] T008 [Foundation] 搭建基础 HTML 框架，在 `frontend/public/index.html` 中创建合约列表、函数表单、状态栏、日志面板容器

**Checkpoint**: Foundation ready - 可开始用户故事实现

---

## Phase 3: User Story 1 - 直接操作全部合约接口 (Priority: P1) 🎯 MVP

**Goal**: 开发者可浏览所有目标合约接口并对读写函数进行调用  
**Independent Test**: 使用有效 ABI 配置启动，选择任意读/写函数执行并获得链上结果或明确错误，同时会话历史可查看

### Implementation for User Story 1

- [X] T009 [P] [US1] 实现 ABI 注册中心 `frontend/src/services/abiRegistry.ts`，按 `ContractDescriptor` 拉取并缓存 ABI
- [X] T010 [P] [US1] 构建合约与函数列表视图 `frontend/src/views/contractList.ts`，支持按合约/函数分组与搜索
- [X] T011 [US1] 实现函数表单渲染 `frontend/src/views/functionForm.ts`，根据 ABI 自动生成输入控件与类型提示
- [X] T012 [US1] 编写调用执行管线 `frontend/src/services/callExecutor.ts`，分别处理读函数即时响应与写函数队列、确认及回执
- [ ] T013 [P] [US1] 创建会话历史模块 `frontend/src/views/callHistory.ts`，记录每次调用摘要并支持筛选复制
- [ ] T014 [US1] 在 `frontend/src/main.ts` 中整合合约选择、表单提交与历史更新流程，确保 UI 与执行服务联动

**Checkpoint**: User Story 1 可独立运行并交付 MVP

---

## Phase 4: User Story 2 - 追踪实时状态与多层级日志 (Priority: P2)

**Goal**: 为每次调用提供实时状态流转与多级日志视图，并支持过滤  
**Independent Test**: 触发成功与失败的写操作，观察状态面板与日志按 timeline 更新，切换日志级别仍保持一致

### Implementation for User Story 2

- [ ] T015 [P] [US2] 建立状态跟踪服务 `frontend/src/services/statusTracker.ts`，维护 CallRequest 状态机并广播更新
- [ ] T016 [P] [US2] 实现日志流水线 `frontend/src/services/logPipeline.ts`，统一生成 debug/info/warn/error 级日志
- [ ] T017 [US2] 构建日志面板 UI `frontend/src/views/logPanel.ts`，支持按级别过滤与时间排序
- [ ] T018 [US2] 在 `frontend/src/views/functionForm.ts` 与 `frontend/src/views/callHistory.ts` 中集成状态徽标与实时更新
- [ ] T019 [US2] 实现错误信息展示组件 `frontend/src/views/errorOverlay.ts`，包含修复建议与阻断提示

**Checkpoint**: User Story 1 + 2 均可独立验证

---

## Phase 5: User Story 3 - 配置化本地启动 (Priority: P3)

**Goal**: 通过配置文件指定 RPC 与端口，启动时进行健康检查并反馈连接状态  
**Independent Test**: 修改 `.env` 的 RPC 与端口后重新启动，应用在指定端口加载并显示连接成功；配置缺失时阻断启动并提示

### Implementation for User Story 3

- [ ] T020 [P] [US3] 编写启动握手流程 `frontend/src/services/startup.ts`，串联配置加载、RPC 连通性检测与阻断逻辑
- [ ] T021 [US3] 新建端口占用检测脚本 `frontend/scripts/ensurePortAvailable.ts`，在 dev 命令前运行并提示冲突处理
- [ ] T022 [P] [US3] 构建连接状态横幅 `frontend/src/views/connectionBanner.ts`，展示当前 RPC、链 ID 与节点评估结果
- [ ] T023 [US3] 在 `frontend/src/main.ts` 中处理配置错误分支，阻断 UI 初始化并呈现修复指南

**Checkpoint**: 全部用户故事可独立运行并覆盖多环境配置

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 完成跨故事的收尾与可审计交付

- [ ] T024 [Polish] 更新 `frontend/README.md` 与 `specs/002-bug-localhost-port/quickstart.md`，同步最新启动与使用指引
- [ ] T025 [P] [Polish] 实现日志与调用历史导出功能 `frontend/src/services/exporter.ts`，支持 JSON 下载
- [ ] T026 [Polish] 依据 Quickstart 执行全旅程手动验收并记录结论于 `docs/reports/002-bug-localhost-port.md`

---

## Dependencies & Execution Order

- **Phase 顺序**: Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6  
- **User Story 依赖**:
  - US1 依赖 Phase 2 基础完成，可独立交付
  - US2 依赖 US1 中的调用与历史管线 (T012, T013), 但实现后可与 US1 并行运行
  - US3 依赖 US1/US2 的共享服务 (T005–T018) 以提供启动前验证

---

## Parallel Execution Examples

- **Phase 1**: T002 与 T004 可并行处理依赖更新与环境模板
- **Phase 3 (US1)**: T009、T010、T013 可并行开发（不同文件）；完成后再开展 T011、T012、T014
- **Phase 4 (US2)**: T015 与 T016 可并行，完成后接 T017–T019
- **Phase 5 (US3)**: T020 与 T022 可并行，T021 完成后再集成到启动流程
- **Phase 6**: T024 与 T025 可并行，T026 在所有实现完成后执行

---

## Implementation Strategy

### MVP First (User Story 1 Only)
1. 完成 Phase 1–2 基础搭建  
2. 实现 Phase 3 (US1) 并根据独立测试标准验证  
3. 在确认链上调用与历史记录可靠后可作为 MVP 演示

### Incremental Delivery
1. MVP (US1) 交付后，继续实现 US2 的日志与状态跟踪  
2. 最后交付 US3 的配置化启动与端口管理  
3. 每次迭代完成后都可单独验收并部署到内部调试环境

### Parallel Team Strategy
1. 团队协作完成 Phase 1–2  
2. 完成基础后：
   - 开发者 A 聚焦 US1 的调用交互 (T009–T014)  
   - 开发者 B 负责 US2 的状态与日志 (T015–T019)  
   - 开发者 C 处理 US3 的启动体验 (T020–T023)  
3. 通过 Phase 6 的收尾工作统一输出文档与验收记录
