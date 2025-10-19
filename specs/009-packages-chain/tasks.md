# Task List: packages/chain 接口层

**Branch**: `009-packages-chain`  
**Spec**: [spec.md](./spec.md)  
**Plan**: [plan.md](./plan.md)

## Phase 1 – Setup
| ID | Task | Notes |
|----|------|-------|
| [X] T001 | 在 `packages/chain` 创建包骨架：`package.json`、`tsconfig.json`、`vitest.config.ts`、基础目录结构（`src/{gateway,adapters,policies,events,errors}`、`tests`），并接入 pnpm workspace | 确保脚本 `build`、`test`、`lint` 可用 |
| [X] T002 | 配置 `packages/chain` 的 eslint/TypeScript 基础设置与共享路径别名，对接 `packages/shared/schemas`、`viem` 依赖 | 沿用仓库现有 lint 规则，校验 `pnpm install` 正常 |

## Phase 2 – Foundational Infrastructure
| ID | Task | Notes |
|----|------|-------|
| [X] T003 | 在 `packages/chain/src/errors/contestChainError.ts` 定义 `ContestChainError` 枚举、错误对象与归类工具，统一映射底层异常 | 确保与 spec 中错误分类一致 |
| [X] T004 | 在 `packages/chain/src/policies/validationContext.ts` 集成 `packages/shared/schemas`，实现 validators 注册与输入校验助手 | 输出不可变校验结果对象 |
| [X] T005 | 在 `packages/chain/src/adapters/rpcClientFactory.ts` 实现 `rpcClientFactory`/`signerLocator` 接口约定，封装 viem client 创建、重试与网络配置 | 允许注入测试 client |
| [X] T006 | 在 `packages/chain/src/gateway/domainModels.ts` 定义领域对象构造器（LifecycleSnapshot、RegistrationPlan、RebalancePlan 等）并确保返回只读结构 | 复用 data-model.md 中字段与锚点要求 |
| [X] T007 | 在 `packages/chain/src/gateway/createContestChainGateway.ts` 实现工厂方法与公共接口骨架：生命周期、报名、换仓、结算、领奖、赎回、事件抓取占位 | 方法暂返回 `NOT_IMPLEMENTED` 占位错误，等待各故事实现 |

## Phase 3 – US1 报名执行计划与资格反馈 (Priority: P1)
**Story Goal**: 生成报名计划，输出资格判定、授权需求与报名交易描述。  
**Independent Test**: 使用 Hardhat/viem 本地链模拟参赛者调用 `planParticipantRegistration`，验证资格通过时返回单笔交易并可执行；余额或授权不足时得到明确拒绝。

| ID | Task | Notes |
|----|------|-------|
| [X] T008 | 在 `packages/chain/src/policies/registrationRules.ts` 实现报名资格检查（余额、授权、报名窗口、重复报名） | [P] 可并行 | 
| [X] T009 | 在 `packages/chain/src/gateway/contestChainGateway.ts` 实现 `describeContestLifecycle` 与 `planParticipantRegistration` 实际逻辑，整合规则检查、授权合成、交易描述 | 顺序执行（依赖 T008、T006） |
| [X] T010 | 在 `packages/chain/src/adapters/allowanceInspector.ts` 实现多资产授权检测与建议，提高默认吸收特例能力 | [P] 可与 T009 并行 | 
| [X] T011 | 在 `packages/chain/tests/registration-plan.test.ts` 编写 Vitest 旅程用例，覆盖资格通过、额度不足、窗口关闭场景 | 依据 quickstart 指南 |

**Checkpoint**: `planParticipantRegistration` 与生命周期快照返回正确，独立可演示。

## Phase 4 – US2 受限换仓与规则守护 (Priority: P2)
**Story Goal**: 基于规则生成换仓交易计划或拒绝列表。  
**Independent Test**: 在本地链构造合法/非法换仓请求，验证合法请求返回交易描述并成功执行，非法请求给出触发的规则。

| ID | Task | Notes |
|----|------|-------|
| [X] T012 | 在 `packages/chain/src/policies/rebalanceRules.ts` 实现资产白名单、额度、冷静期、价格时效检查 | [P] 可并行 |
| [X] T013 | 在 `packages/chain/src/adapters/tradeRoutePlanner.ts` 构建换仓路径与最小成交量、防滑设定（利用 viem/Uniswap 接口或占位抽象） | [P] 可并行 | 
| [X] T014 | 在 `packages/chain/src/gateway/contestChainGateway.ts` 扩展 `planPortfolioRebalance`，结合规则结果和路线，输出 RebalancePlan/拒绝原因 | 顺序执行（依赖 T012、T013） |
| [X] T015 | 在 `packages/chain/tests/rebalance-plan.test.ts` 编写旅程测试，覆盖合法路径、额度超限、冷静期未过 | 依赖 T014 |

**Checkpoint**: 换仓计划接口可独立演示并通过旅程测试。

## Phase 5 – US3 公开结算与资产释放 (Priority: P3)
**Story Goal**: 实现结算、领奖、本金赎回接口，确保幂等与状态校验。  
**Independent Test**: 在冻结后的比赛上调用结算并确认排行榜版本更新；模拟获胜与非获胜参赛者分别调用领奖、赎回，重复调用返回幂等状态。

| ID | Task | Notes |
|----|------|-------|
| [X] T016 | 在 `packages/chain/src/policies/settlementGuards.ts` 实现结算触发条件、领奖资格、本金赎回条件校验 | [P] 可并行 |
| [X] T017 | 在 `packages/chain/src/gateway/contestChainGateway.ts` 实现 `executeContestSettlement`，生成结算交易并返回 SettlementResult | 顺序执行（依赖 T016） |
| [X] T018 | 在 `packages/chain/src/gateway/contestChainGateway.ts` 实现 `executeRewardClaim` 与 `executePrincipalRedemption`，处理幂等与状态阻断 | 顺序执行（依赖 T016） |
| [X] T019 | 在 `packages/chain/tests/settlement-and-claims.test.ts` 编写旅程测试，覆盖首次执行、重复调用、资格不足三类路径 | |

**Checkpoint**: 结算与资产释放流程合规，输出幂等摘要。

## Phase 6 – US4 摄取事件与链下同步 (Priority: P3)
**Story Goal**: 提供事件抓取与游标推进能力，供摄取任务重建链上真相。  
**Independent Test**: 在指定区块范围调用 `pullContestEvents`，验证事件按顺序输出并包含 `nextCursor`，链重组时返回 `reorgDetected` 标记。

| ID | Task | Notes |
|----|------|-------|
| [X] T020 | 在 `packages/chain/src/events/contestEventDecoder.ts` 定义事件 ABI、解析逻辑与 reorg 检测 | |
| [X] T021 | 在 `packages/chain/src/gateway/contestChainGateway.ts` 完成 `pullContestEvents` 实现，整合 `getLogs`、游标与重组标记 | 顺序执行（依赖 T020） |
| [X] T022 | 在 `packages/chain/tests/event-pull.test.ts` 编写事件抓取测试，覆盖正常批次、空结果、重组标记 | |

**Checkpoint**: 事件抓取接口支持链下重放并通过测试。

## Phase 7 – Polish & Cross-Cutting
| ID | Task | Notes |
|----|------|-------|
| [X] T023 | 更新 `packages/chain/README.md` 与 `specs/009-packages-chain/quickstart.md`，补充最终用法与调试说明 | |
| [X] T024 | 校对 `contracts/gateway.openapi.yaml` 与实现一致性，确保字段命名、错误代码对齐，并生成变更日志草稿 | |

## Dependencies & Delivery Order
1. Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
2. 用户故事依赖：US1 完成后可交付 MVP；US2、US3、US4 可在 US1 基础上并行推进（其实现任务之间需遵守表中顺序）

## Parallel Execution Opportunities
- US1: `registrationRules.ts` (T008) 与 `allowanceInspector.ts` (T010) 可并行开发。
- US2: `rebalanceRules.ts` (T012) 与 `tradeRoutePlanner.ts` (T013) 可并行。
- US3: 结算/领奖实现（T017、T018）需顺序，但 `settlementGuards.ts` (T016) 可并行于其他故事。
- US4: 事件解码 (T020) 与测试 (T022) 可在 `pullContestEvents` 完成后快速衔接。

## Implementation Strategy
- **MVP**：完成 Phase 1–3，交付报名计划与生命周期快照，支撑前端最小可用流程。
- **Incremental Delivery**：
  1. 合并 US1（报名计划）上线。
  2. 在该基础上迭代 US2（换仓计划），保持与前端松耦合。
  3. 随后实现 US3（结算与资产释放）与 US4（事件抓取），逐步丰富运营与摄取能力。
- 每阶段结束执行 `pnpm --filter @chaincontest/chain test`，并根据任务清单完成原子化 commit。

## Task Counts
- 总任务数：24
- US1：4 项
- US2：4 项
- US3：4 项
- US4：3 项
- Setup & Foundational：7 项
- Polish：2 项
- 并行任务标记 `[P]`：4 项
