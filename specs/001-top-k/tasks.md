# Tasks: 链上托管交易比赛 Top-K

**Input**: Design documents from `/specs/001-top-k/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 用户故事明确要求可复现旅程与链上事件验证，因此各故事均安排测试任务并遵循“先写测试再实现”顺序。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：T004, T005, T019, T027, T029, T035 列出安全校验、冻结与应急流程
- [ ] 链上真相：T011, T019, T020, T027, T028, T029, T024, T030 负责事件与重算视图
- [ ] 去信任执行：T006, T007, T011, T020, T027, T028 保持确定性与显式边界
- [ ] 最小功能与权限：T004, T011, T019, T027, T029 收紧入口与权限
- [ ] 可解释与性能：T009, T010, T017, T018, T025, T026, T034 提供旅程测试与 gas 报告

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立合约与前端基础工程、依赖与工作流

- [X] T001 [Setup] 初始化 `contracts/` Hardhat 工程（`package.json`, `hardhat.config.ts`, `tsconfig.json`, `pnpm-workspace.yaml`）并配置 Sepolia/本地网络
- [X] T002 [P] [Setup] 初始化 `frontend/` Vite + React + TypeScript 工程（`frontend/package.json`, `vite.config.ts`, `src/main.tsx`）并接入 Ethers.js 与 Wagmi/EIP-1193 适配
- [X] T003 [P] [Setup] 配置共享工具链：在仓库根新增 `.eslint.cjs`, `.prettierrc`, `pnpm-lock.yaml`，并在 `contracts/` 与 `frontend/` 添加 Vitest/Playwright/Hardhat 脚本命令

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事共用的核心结构，未完成前禁止进入任一故事实现

- [X] T004 [Foundation] 在 `contracts/Contest.sol` 定义状态枚举、配置结构体、时间线字段、权限修饰符与事件占位符，并实现受限的 `initialize` 构造逻辑
- [X] T005 [P] [Foundation] 在 `contracts/Vault.sol` 定义托管余额存储、所有者/Contest 限制修饰符、USDC/WETH 接口引用与基本事件占位符
- [X] T006 [P] [Foundation] 在 `contracts/VaultFactory.sol` 集成 OpenZeppelin `Clones`，实现 `setImplementation`、`predictVaultAddress` 与 Contest 专用的克隆入口骨架
- [X] T007 [P] [Foundation] 在 `contracts/PriceSource.sol` 集成 Uniswap v3 TWAP 依赖、配置读取窗口/池地址、暴露 `getTwapPrice()` 接口骨架及错误码
- [X] T008 [Foundation] 在 `frontend/src/lib/config.ts` 实现 RPC 主备与合约地址加载（含 500ms 超时切换逻辑），并导出供全局状态使用

**Checkpoint**: 基础合约结构与前端配置完成，可开始各用户故事

---

## Phase 3: User Story 1 - 安全报名与本金托管 (Priority: P1) 🎯 MVP

**Goal**: 参赛者完成报名、部署个人 Vault 并锁定本金，链上事件可追溯且禁止重复报名

**Independent Test**: 通过 Hardhat 测试验证报名创建 Vault/锁定本金/事件；通过 Playwright 测试验证前端旅程与拒绝重复报名

### Tests for User Story 1

- [X] T009 [US1] 编写 Hardhat 测试 `contracts/test/contest.register.spec.ts` 覆盖成功报名、重复报名拒绝、本金不足回滚
- [X] T010 [P] [US1] 编写 Playwright 场景 `frontend/tests/e2e/register.spec.ts` 覆盖授权+报名+事件校验流程

### Implementation for User Story 1

- [X] T011 [US1] 在 `contracts/Contest.sol` 实现 `register()`：校验状态/报名窗口、本金匹配、记录参赛者/奖池、发射 `ContestRegistered`
- [X] T012 [P] [US1] 在 `contracts/Vault.sol` 实现 `initialize(address owner, address contest)` 与 USDC 存款逻辑，限制赛期内禁止 `withdraw`
- [X] T013 [P] [US1] 在 `contracts/VaultFactory.sol` 实现 `deployVault(address participant)`，并在 `Contest.register` 中接入、记录 `vaultId` 映射
- [X] T014 [US1] 在 `frontend/src/lib/contest/register.ts` 编写真正调用流程：授权 USDC、调用 `register`、监听确认
- [X] T015 [P] [US1] 在 `frontend/src/components/RegisterCard.tsx` 构建报名 UI，处理授权状态与错误提示
- [X] T016 [US1] 在 `frontend/src/app/state/contestStore.ts` 订阅 `ContestRegistered` 事件，更新报名列表与参赛状态缓存

**Checkpoint**: 用户可独立完成报名旅程，链上事件与前端状态一致

---

## Phase 4: User Story 2 - 规则约束下的换仓 (Priority: P2)

**Goal**: 参赛者在 LIVE 阶段执行受限 swap，强制白名单池、TWAP ± ε、额度限制，并在违规时回滚

**Independent Test**: Hardhat 测试验证合法 swap 成功、违规 swap revert；Playwright 测试验证前端合法/非法操作反馈

### Tests for User Story 2

- [X] T017 [US2] 编写 Hardhat 测试 `contracts/test/vault.swap.spec.ts` 覆盖合法 swap、TWAP 超界/状态非法的拒绝场景
- [X] T018 [P] [US2] 编写 Playwright 场景 `frontend/tests/e2e/swap.spec.ts` 覆盖 LIVE 阶段合法交易与违规提示

### Implementation for User Story 2

- [X] T019 [US2] 在 `contracts/PriceSource.sol` 实现 TWAP 读取、±0.5% 容忍度校验与缓存结构，发射 `PriceUpdated` 事件
- [X] T020 [P] [US2] 在 `contracts/Vault.sol` 实现 `swapExact()`：校验 Contest 状态、调用 `PriceSource` 校验、与 Uniswap v3 池交互并发射 `VaultSwapped`
- [X] T021 [US2] 在 `contracts/Contest.sol` 实现 LIVE 阶段进入逻辑（时间驱动）、提供仅授权 Vault 方可调用的 swap 入口检查
- [X] T022 [P] [US2] 在 `frontend/src/lib/contest/swap.ts` 编写 swap 事务封装（含价格校验、gas 预算提示）
- [ ] T023 [P] [US2] 在 `frontend/src/components/VaultSwapPanel.tsx` 实现 UI，展示池价/容忍度、输入输出估算与错误提示
- [ ] T024 [US2] 在 `frontend/src/app/state/vaultPositions.ts` 根据 `VaultSwapped` 事件维护 Vault 头寸与 ROI 预估

**Checkpoint**: 换仓旅程可独立验证，违规请求 fail-closed

---

## Phase 5: User Story 3 - 公开结算与奖池自助领取 (Priority: P3)

**Goal**: 任意用户可冻结比赛、结算 NAV/ROI、维护 Top-K、封榜并触发自助领奖/退出，过程幂等可复算

**Independent Test**: Hardhat 测试覆盖 freeze/settle/updateLeaders/claim/exit；Playwright 测试覆盖前端触发与榜单展示

### Tests for User Story 3

- [ ] T025 [US3] 编写 Hardhat 测试 `contracts/test/contest.settle.spec.ts` 覆盖冻结、结算、Top-K 更新、重复调用幂等、领奖/退出
- [ ] T026 [P] [US3] 编写 Playwright 场景 `frontend/tests/e2e/settle-claim.spec.ts` 覆盖任意用户触发结算、查看榜单、领奖与退出

### Implementation for User Story 3

- [ ] T027 [US3] 在 `contracts/Contest.sol` 实现 `freeze()` 与 `settle(address participant)`：按 Δ TWAP 估值写入 score，并发射 `ContestFrozen`/`VaultSettled`
- [ ] T028 [P] [US3] 在 `contracts/Contest.sol` 实现 Top-K 最小堆结构与 `updateLeaders()`，批量处理 ≤16 条并发射 `LeadersUpdated`
- [ ] T029 [US3] 在 `contracts/Contest.sol` 实现 `seal()`, `claim()`, `claimFor()`, `exit()`，分配奖池/返还余额，发射 `RewardClaimed` 与 `VaultExited`
- [ ] T030 [P] [US3] 在 `frontend/src/components/Leaderboard.tsx` 展示 Top-K 榜单、排名变更与奖池份额
- [ ] T031 [P] [US3] 在 `frontend/src/components/AdminActions.tsx` 提供冻结/结算/封榜按钮（任何用户可见），含重试与失败提示
- [ ] T032 [US3] 在 `frontend/src/lib/contest/payout.ts` 实现领奖与退出交易封装，处理重复调用幂等响应

**Checkpoint**: 结算与领奖旅程可独立执行，榜单公开、领奖自助

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 文档、性能与安全加固

- [ ] T033 [Polish] 更新 `specs/001-top-k/quickstart.md` 补充实际部署地址、测试命令与常见故障排查
- [ ] T034 [P] [Polish] 添加 `contracts/scripts/report-gas.ts` 与 Hardhat gas reporter 配置，输出 swap/settle/updateLeaders gas 指标
- [ ] T035 [Polish] 在 `docs/security/contest.md` 编写安全审计清单：失败降级流程、事件重放校验、权限移交步骤

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
- 用户故事依赖：US1 (Phase 3) → US2 (Phase 4) → US3 (Phase 5)
- 任务依赖关系（主要链）：
  - T001 → T004 → T011
  - T002 → T014 → T015
  - T005/T006/T007 → T012/T013/T020/T027
  - T019 → T020 → T024
  - T027 → T028 → T029 → T030/T031/T032
- 只有在完成 Phase 2 基础任务（T004–T008）后，用户故事任务才可开始
- Phase 6 任务需在所有目标用户故事完成后执行

## Parallel Execution Examples

- **Setup**: 在完成 T001 后，可并行执行 T002 与 T003
- **US1**: 在 T009 启动后，可并行执行前端 Playwright 测试准备 T010 与后续前端实现 T015 需等待测试完成；实现在不同文件的 T012 与 T013 可并行
- **US2**: T019 完成后，T020 与 T022/T023/T024 可并行；Playwright 测试 T018 可与合约实现解耦持续迭代
- **US3**: T027 完成后，T028、T030、T031、T032 可并行推进；Hardhat 测试 T025 与前端测试 T026 可独立执行

## Implementation Strategy

### MVP Scope
完成 Phase 1–3（至 T016）即可交付最小可行产品：报名上链、资金托管与事件可追溯。

### Incremental Delivery
1. 完成 Phase 1–2：打好基础
2. 完成 US1（Phase 3）：交付 MVP 并验证旅程
3. 追加 US2（Phase 4）：解锁规则化换仓
4. 追加 US3（Phase 5）：实现公开结算与领奖
5. 收尾 Phase 6：文档、性能、安全

### Team Parallelization
在完成 Phase 2 后：
- 开发者 A 专注 US1/报名链路
- 开发者 B 并行推进 US2/换仓逻辑
- 开发者 C 聚焦 US3/结算与领奖（需等待前述基础完成）
