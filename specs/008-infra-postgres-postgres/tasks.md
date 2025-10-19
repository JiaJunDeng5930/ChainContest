# Tasks: Infrastructure Postgres Service

**Input**: Design documents from `/specs/008-infra-postgres-postgres/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 未显式要求自动化测试；以下任务以脚本执行与文档验证为主。

**Organization**: 任务按用户故事分组，保证每个故事可独立交付与验证。

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：T003, T005, T007, T009, T013, T015, T020, T023
- [ ] 链上真相：T004, T007, T014, T020, T022
- [ ] 去信任执行：T005, T007, T009, T014, T020
- [ ] 最小功能与权限：T003, T004, T009, T013, T015, T020
- [ ] 可解释与性能：T006, T010, T012, T017, T018, T021, T022, T024

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 `infra/postgres` 基础目录与忽略规则，便于后续脚本与数据存放。

- [X] T001 [SETUP] 创建目录骨架 `infra/postgres/{env,scripts,docs,logs,backups,snapshots}` 并添加 `.gitkeep`/README 提示，确保团队结构一致。
- [X] T002 [P] [SETUP] 更新根目录 `.gitignore`，忽略 `infra/postgres/logs/`、`infra/postgres/backups/`、`infra/postgres/env/.env.local` 等敏感或生成文件。

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 搭建所有故事共用的配置、Compose 与脚本底座；完成前禁止进入任何用户故事开发。

- [X] T003 [FOUND] 编写 `infra/postgres/env/sample.env`，定义 `POSTGRES_IMAGE=postgres:16-alpine`、端口、卷路径与凭证占位，并附安全提示。
- [X] T004 [FOUND] 创建 `infra/postgres/docker-compose.yaml`，声明官方 Postgres 服务、持久卷映射、网络隔离及基础 healthcheck 占位。
- [X] T005 [FOUND] 实现共享库 `infra/postgres/scripts/_lib.sh`，封装 env 加载、依赖检查（docker、pg_isready、pg_dump）、审计日志输出与安全退出策略。
- [X] T006 [P] [FOUND] 撰写 `infra/postgres/docs/operations.md` 基线章节，记录前置条件、目录布局、安全优先栈与回滚原则。

**Checkpoint**: Foundational 完成 → 可以进入用户故事开发。

---

## Phase 3: User Story 1 - Provision shared database service (Priority: P1) 🎯 MVP

**Goal**: 开发者可在 10 分钟内通过脚本完成数据库初始化并获取健康状态与连接信息。

**Independent Test**: 在干净环境执行 `scripts/init.sh`，随后运行 `scripts/health-check.sh`，确认容器运行、日志生成且 `/packages/db` 可成功连接。

### Implementation & Validation

- [X] T007 [US1] 开发 `infra/postgres/scripts/health-check.sh`，调用 `_lib.sh` 执行 `pg_isready`、诊断 SQL 与磁盘余量计算，将结果写入 `logs/health-*.log`。
- [X] T008 [P] [US1] 开发 `infra/postgres/scripts/connection-info.sh`，解析 env 并执行只读 SQL 验证，将连接摘要输出为纯文本/JSON。
- [X] T009 [US1] 开发 `infra/postgres/scripts/init.sh`，自动创建数据卷权限、拉取 `postgres:16-alpine`、执行 `docker compose up -d` 并串联健康检查与日志归档。
- [X] T010 [P] [US1] 更新 `specs/008-infra-postgres-postgres/quickstart.md`，补充初始化、健康检查与连接验证的命令示例及预期输出片段。
- [X] T011 [P] [US1] 扩写 `infra/postgres/docs/operations.md`，记录供应流程步骤、失败回滚策略与凭证分发指引。
- [X] T012 [US1] 在本地执行 `init.sh` + `health-check.sh`，将结果链接写入 `docs/operations.md` 的验收章节，满足验收场景。

**Checkpoint**: US1 可独立演示，形成最小可行产品。

---

## Phase 4: User Story 2 - 管理数据库生命周期 (Priority: P2)

**Goal**: 运维可安全执行备份、停机、重启与恢复，保障数据完整与协作节奏。

**Independent Test**: 使用脚本完成一次备份、停机、重启及从指定备份恢复，15 分钟内恢复服务并通过健康检查。

### Implementation & Validation

- [X] T013 [US2] 实现 `infra/postgres/scripts/backup.sh`，封装 `pg_dump` 逻辑备份、校验 checksum、应用保留策略并写入 `backups/metadata.json`。
- [ ] T014 [US2] 实现 `infra/postgres/scripts/restore.sh`，加载指定备份，执行核心表校验 SQL，并在失败时自动回滚。
- [ ] T015 [US2] 实现 `infra/postgres/scripts/shutdown.sh`，触发增量备份、优雅停止容器、验证资源释放并记录操作日志。
- [ ] T016 [P] [US2] 实现 `infra/postgres/scripts/start.sh`，读取现有卷配置重新启动实例并执行快速健康检查。
- [ ] T017 [P] [US2] 更新 `infra/postgres/docs/operations.md`，补充备份保留策略、停机/恢复 SOP 与告警响应步骤。
- [ ] T018 [US2] 执行备份→停机→重启→恢复全流程，附带健康检查截图/日志至 `docs/operations.md`，满足验收要求。

**Checkpoint**: US1 + US2 独立可用，生命周期管理可复现。

---

## Phase 5: User Story 3 - 支撑自动化验证 (Priority: P3)

**Goal**: CI 团队可在 5 分钟内重置数据库至标准快照并跑通自动化验证。

**Independent Test**: 在 CI 或本地模拟环境运行 `scripts/reset-test.sh`，5 分钟内清理数据并导入标准快照，随后运行 `/packages/db` 集成验证脚本成功。

### Implementation & Validation

- [ ] T019 [US3] 生成标准快照资产 `infra/postgres/snapshots/standard.sql` 及 `metadata.json`，记录生成时间、适用 schema 与校验摘要。
- [ ] T020 [US3] 实现 `infra/postgres/scripts/reset-test.sh`，封装只在测试标志下执行的清理、快照导入与健康检查，并防止生产环境误用。
- [ ] T021 [P] [US3] 更新 `quickstart.md` 与 `docs/operations.md` 的 CI 章节，描述快照维护、参数化运行与回滚策略。
- [ ] T022 [US3] 在测试实例运行 `reset-test.sh`，记录执行耗时与自动化验证结果，更新文档验收部分。

**Checkpoint**: 三个用户故事均可独立测试，支撑自动化验证。

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 审计脚本质量、性能与文档一致性，确保整体交付可靠。

- [ ] T023 [POLISH] 全量执行 `shellcheck`/静态扫描，修复脚本中的安全或性能隐患，并在 `docs/operations.md` 记录审计结论。
- [ ] T024 [P] [POLISH] 按 `quickstart.md` 步骤重新走通全流程（init→backup→reset），校正文档偏差并记录剩余风险。

---

## Dependencies & Execution Order

1. **Phase 1 → Phase 2**：Setup 完成后进入 Foundational。
2. **Phase 2 → Phase 3/4/5**：Foundational 任务全部完成后，任意用户故事方可启动。
3. **User Story 顺序**：US1 (P1) → US2 (P2) → US3 (P3)；US2/US3 可在 Foundational 完成后与 US1 并行，但上线顺序需按优先级验收。
4. **Polish**：所有目标故事完成后执行。

### Story Completion Graph
- Setup → Foundational → US1 → US2 → US3 → Polish
- 若团队人手充足：US2 与 US3 可在 US1 实施期间同步推进，但必须确保 Foundational 已完成且各自验收独立。

### Parallel Execution Examples
- **Setup**：T002 可在 T001 进行时并行。
- **US1**：在 T007 完成后，T008、T010、T011 可并行推进。
- **US2**：T016 与 T017 可与 T015 并行，由不同成员分别负责脚本与文档。
- **US3**：T021 可在 T019 生成快照后并行更新文档。
- **Polish**：T024 可与 T023 并行执行文档校验与脚本审计。

## Implementation Strategy

1. **MVP 交付**：完成 Setup、Foundational、US1（T001-T012）。此时即可支撑开发者初始化数据库。
2. **增量扩展**：在 MVP 稳定后，按优先级实现 US2（T013-T018）强化生命周期管理，再实现 US3（T019-T022）支持 CI 快速重置。
3. **质量收尾**：最后执行 Polish（T023-T024）确保脚本合规、文档一致与性能目标达成。

## Task Metrics
- **总任务数**：24
- **每个用户故事任务数**：US1 = 6，US2 = 6，US3 = 4
- **并行机会**：Setup 1 项、US1 3 项、US2 2 项、US3 1 项、Polish 1 项。
- **独立验收标准**：
  - US1：T012 验证脚本在 10 分钟内完成部署与健康检查。
  - US2：T018 验证备份→停机→重启→恢复流程。
  - US3：T022 验证 5 分钟内快照重置并通过自动化校验。
- **建议 MVP 范围**：完成 US1（T001-T012）。
