# Tasks: 合约接口文档自动化

**Input**: Design documents from `/specs/003-natspec-npm-hardhat/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: 未收到强制编写自动化测试的要求，如后续需要可在对应用户故事中补充。

**Organization**: 任务按用户故事分组，确保每个故事都能独立实现与验收。

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：通过 T020–T022 的本地 fail-closed 校验脚本与提交流程说明确保缺失 NatSpec 时阻断生成
- [ ] 链上真相：依托 T006–T016、T017–T018 保证文档仅来源于源码 NatSpec 并覆盖全部公共符号
- [ ] 去信任执行：T012–T021 分离模板、配置、脚本，保证生成流程确定性与显式边界
- [ ] 最小功能与权限：按 T003–T015 仅交付必要依赖与脚本，无额外包装层或外部服务
- [ ] 可解释与性能：T006、T019、T022 提供审阅指南与手工验证步骤（按用户要求不实现性能监控或 CI）

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 可并行执行（作用于不同文件、互不依赖）
- **[Story]**: 对应的用户故事（US1、US2、US3），或 Setup / Foundational / Polish
- 任务描述内包含需要修改的精确路径

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立基线资料与目录，为后续实现提供输入

- [X] T001 [Setup] 汇总 `contracts/src` 中全部公共、公有、外部函数、事件、错误，记录到 `specs/003-natspec-npm-hardhat/checklists/public-interfaces.md` 供覆盖追踪
- [X] T002 [P] [Setup] 新建 `contracts/docgen/templates/` 与 `contracts/scripts/docs/` 目录及各自的 `README.md`，说明目录用途与约束

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 引入必须的依赖与基础配置；完成前不可开始任何用户故事

- [ ] T003 [Foundational] 在 `contracts/package.json` 添加 `solidity-docgen`、`hardhat-output-validator`、`handlebars`、`ts-node` 等依赖并更新 `pnpm-lock.yaml`
- [ ] T004 [Foundational] 调整 `contracts/tsconfig.json`，将 `docgen` 与 `scripts/docs` 目录纳入 TypeScript 编译范围
- [ ] T005 [Foundational] 修改 `contracts/hardhat.config.ts`，注册 `solidity-docgen` 与 `hardhat-output-validator` 插件的基础配置（仅设定输出目录与校验规则占位符）

**Checkpoint**: 基础依赖与配置就绪，可进入用户故事实现

---

## Phase 3: User Story 1 - 开发者补充新合约接口 (Priority: P1) 🎯 MVP

**Goal**: 开发者在补充/修改公共接口时能编写中文 NatSpec，并一键生成人类可读文档

**Independent Test**: 任意在 `contracts/src` 新增的公共函数含中文 NatSpec，执行 `pnpm --filter contracts docs:generate` 后，`docs/contracts/<Contract>.md` 中出现对应条目且内容来自源码

### Implementation for User Story 1

- [ ] T006 [US1] 编写中文 NatSpec 规范文档 `docs/contracts/NatSpec写作规范.md`，明确必填标签（@notice/@dev/@param/@return/@custom:error/@custom:example）与语气要求
- [ ] T007 [P] [US1] 审核并补齐 `contracts/src/Contest.sol` 所有公共/外部函数、事件、错误的中文 NatSpec，符合 T006 规范
- [ ] T008 [P] [US1] 审核并补齐 `contracts/src/Vault.sol` 的中文 NatSpec，涵盖公共/外部接口、事件、错误
- [ ] T009 [P] [US1] 审核并补齐 `contracts/src/VaultFactory.sol` 的中文 NatSpec
- [ ] T010 [P] [US1] 审核并补齐 `contracts/src/PriceSource.sol` 的中文 NatSpec
- [ ] T011 [P] [US1] 检查 `contracts/src/libraries/*.sol` 内的库函数，如存在 public/external 可见性则补充中文 NatSpec 并在 `public-interfaces.md` 标记
- [ ] T012 [US1] 创建 `contracts/docgen/templates/partials/{function,event,error}.hbs`，渲染函数/事件/错误信息及调用示例占位
- [ ] T013 [US1] 新建 `contracts/docgen/index.hbs`（初版布局），包含文档头、合约简介、函数/事件/错误章节锚点
- [ ] T014 [US1] 实现 `contracts/docgen/config.ts`，配置模板目录、输出到 `docs/contracts`、启用确定性排序并注入提交哈希/生成时间
- [ ] T015 [US1] 创建 `contracts/scripts/docs/generate.ts`，调用 `solidity-docgen` 并在输出文件头写入版本信息与元数据
- [ ] T016 [US1] 更新 `contracts/package.json`，新增 `docs:generate` 脚本（使用 `ts-node` 执行 T015），并在脚本描述中引用 `docs/contracts/NatSpec写作规范.md`
- [ ] T017 [US1] 首次运行 `pnpm --filter contracts docs:generate`，将生成的 `docs/contracts/*.md` 与 `docs/contracts/index.md` 纳入版本控制

**Checkpoint**: 文档生成脚本与 NatSpec 覆盖建立，MVP 可独立演示

---

## Phase 4: User Story 2 - 审核者查阅合约说明 (Priority: P2)

**Goal**: 审核者可通过生成的中文文档快速了解各合约的接口用途、参数与错误场景

**Independent Test**: 在 `docs/contracts/index.md` 中定位到 `Contest.register`，章节内展示用途、参数、返回值、错误与调用示例，且语言为中文

### Implementation for User Story 2

- [ ] T018 [US2] 强化 `contracts/docgen/index.hbs`，为每个合约生成目录、摘要表与按章节分组的函数/事件/错误列表
- [ ] T019 [US2] 扩展 `contracts/scripts/docs/generate.ts`，生成/更新 `docs/contracts/index.md` 首页并确保链接正确指向各合约文档
- [ ] T020 [US2] 撰写 `docs/contracts/README.md`，面向审核者解释文档结构、术语表与如何校对链上行为

**Checkpoint**: 审核者能凭文档独立完成查阅任务

---

## Phase 5: User Story 3 - 流程集成与质量守护 (Priority: P3)

**Goal**: 提供手动检查机制阻止 NatSpec 缺失或文档过期，满足 fail-closed 要求（无需集成 CI 或性能监控）

**Independent Test**: 删除任意公共函数的 NatSpec 后执行 `pnpm --filter contracts docs:check`，脚本以非零退出并列出缺失条目；恢复注释后命令通过且 Git 工作区保持干净

### Implementation for User Story 3

- [ ] T021 [US3] 实现 `contracts/scripts/docs/check.ts`，串联 `hardhat-output-validator`、`solidity-docgen` 检查模式与 Git 工作区状态校验
- [ ] T022 [US3] 更新 `contracts/package.json`，新增 `docs:check` 脚本并确保在缺失 NatSpec、未提交文档或生成失败时返回非零码
- [ ] T023 [US3] 在 `docs/contracts/NatSpec写作规范.md` 增补“提交前自检”章节，指导开发者在本地运行 `docs:check` 并处理失败输出

**Checkpoint**: 手动质量守护流程完成，可在任意环境执行

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 统一文档体验与收尾工作

- [ ] T024 [Polish] 逐条审阅 `docs/contracts/*.md`，统一中文标点、标题层级与锚点命名，并在必要处补充交叉引用
- [ ] T025 [P] [Polish] 在 `specs/003-natspec-npm-hardhat/checklists/public-interfaces.md` 标记最终 NatSpec 覆盖状态与对应文档文件，供后续审计

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
- Foundational阶段（T003–T005）必须全部完成，用户故事才能启动
- 用户故事按优先级串行交付（P1 → P2 → P3），如有额外人手可在完成前置依赖后并行执行带 [P] 标记的任务
- Polish 阶段在所有目标用户故事完成后执行

### Task Dependencies (Selected)
- T006 依赖 T001、T003–T005 完成
- T012–T015 依赖 T002–T005
- T017 需在 T006–T016 完成且 `docs:generate` 正常运行后执行
- T018–T020 依赖 T017 输出的初版文档
- T021–T023 依赖 T017、T018–T020 和相关脚本基础
- T024–T025 依赖所有故事完成后的文档成果

---

## Parallel Opportunities

- Setup 阶段：T002 可与 T001 并行
- NatSpec 补写任务：T007–T011 可由不同成员并行处理各合约文件
- 文档审阅：T024 与 T025 可并行（面向不同文件）

### Parallel Example: User Story 1

- 并行执行：T007（Contest.sol）、T008（Vault.sol）、T009（VaultFactory.sol）、T010（PriceSource.sol）、T011（libraries）可同时进行
- 顺序执行：完成 NatSpec 补写后，再依次完成 T012 → T013 → T014 → T015 → T016 → T017

---

## Implementation Strategy

### MVP First (User Story 1)
1. 完成 Phase 1–2 基础工作
2. 交付 User Story 1（T006–T017），实现 NatSpec 全覆盖与文档生成脚本
3. 运行 `docs:generate` 产出文档并校对输出

### Incremental Delivery
1. MVP（US1）上线后，继续完成 US2（审阅友好文档）
2. 最后交付 US3，提供手动 fail-closed 校验流程
3. 所有故事完成后进入 Polish 阶段整理文档

### Suggested MVP Scope
- User Story 1 全量任务（T006–T017）即为最小可演示价值：NatSpec 规范 + 生成脚本 + 初版文档
