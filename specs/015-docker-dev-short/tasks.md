# Tasks: Dockerized Development Bootstrap

**Input**: Design documents from `/specs/015-docker-dev-short/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included where they materially reduce regression risk for command workflows.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Constitutional Gates *(mandatory)*
- [ ] 安全优先栈：列出确保安全>正确性>可用性>成本的任务与降级/回滚步骤
- [ ] 链上真相：标记生成/消费链上事件的任务，并定义校验与重算流程
- [ ] 去信任执行：拆分任务以确保确定性、幂等与显式模块边界
- [ ] 最小功能与权限：限制范围在当前旅程所需最小功能与权限配置
- [ ] 可解释与性能：安排旅程级测试、审计资料生成与热路径优化/分批执行

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the `tools/dev-bootstrap` workspace package and baseline tooling.

- [X] T001 Add `tools/dev-bootstrap` package entry and workspace registration in `pnpm-workspace.yaml` and `tools/dev-bootstrap/package.json`
- [X] T002 Create TypeScript project scaffolding (`tools/dev-bootstrap/tsconfig.json`, `src/index.ts`) and configure build scripts in `package.json`
- [X] T003 [P] Scaffold CLI executable stub `tools/dev-bootstrap/bin/dev-bootstrap.ts` that forwards to compiled output
- [X] T004 [P] Extend repository lint/format configuration to include `tools/dev-bootstrap` (e.g., `.eslintrc.cjs`, `.prettierignore` updates)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared modules required by all user stories (configuration schema, error handling, reporting).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement configuration schema with Zod in `tools/dev-bootstrap/src/config/schema.ts`
- [X] T006 [P] Build configuration loader/merger (base + local overrides) in `tools/dev-bootstrap/src/config/loader.ts`
- [X] T007 [P] Create shared error and exit-code utilities in `tools/dev-bootstrap/src/orchestration/errors.ts`
- [X] T008 [P] Implement summary reporter scaffold in `tools/dev-bootstrap/src/reporters/summary.ts`

**Checkpoint**: Foundational modules ready—user story implementation can now begin.

---

## Phase 3: User Story 1 - Prepare Single Configuration File (Priority: P1) 🎯 MVP

**Goal**: Deliver editable configuration templates with validation command and actionable feedback.

**Independent Test**: Populate `dev-bootstrap.config.yaml` using the template, run `pnpm dev-bootstrap validate`, and observe successful validation output plus actionable errors when fields are missing.

### Implementation for User Story 1

- [X] T009 [US1] Author default configuration template `dev-bootstrap.config.template.yaml` and VCS-ignored override sample `dev-bootstrap.config.local.yaml`
- [X] T010 [P] [US1] Implement validate command handler in `tools/dev-bootstrap/src/commands/validate.ts`
- [X] T011 [P] [US1] Wire CLI to expose `validate` command in `tools/dev-bootstrap/src/cli.ts`
- [X] T012 [P] [US1] Implement validation message renderer with field-level guidance in `tools/dev-bootstrap/src/reporters/validation.ts`
- [X] T013 [US1] Document configuration fields and workflows in `docs/dev-bootstrap/configuration.md`
- [X] T014 [P] [US1] Add unit tests for schema validation edge cases in `tools/dev-bootstrap/tests/unit/config-schema.test.ts`

**Checkpoint**: Validation workflow operational; developers can configure and verify without running services.

---

## Phase 4: User Story 2 - One-Command Environment Startup (Priority: P1)

**Goal**: Provide a single command that performs prerequisite checks and launches all services with readiness reporting.

**Independent Test**: With a valid config, execute `pnpm dev-bootstrap start --profile indexer` and confirm prerequisites pass, services launch, and summary reports success statuses.

### Implementation for User Story 2

- [X] T015 [P] [US2] Implement pre-flight checks module for Docker versions/resources in `tools/dev-bootstrap/src/orchestration/preflight.ts`
- [X] T016 [P] [US2] Implement Compose project generator that materializes ephemeral YAML in `tools/dev-bootstrap/src/compose/generator.ts`
- [X] T017 [US2] Implement start orchestration flow invoking Docker Compose and tracking service states in `tools/dev-bootstrap/src/orchestration/start.ts`
- [X] T018 [US2] Wire CLI start command with profile flags in `tools/dev-bootstrap/src/commands/start.ts`
- [X] T019 [P] [US2] Extend runtime reporter for readiness/NDJSON output in `tools/dev-bootstrap/src/reporters/runtime.ts`
- [X] T020 [US2] Add integration smoke test using mocked Compose adapter in `tools/dev-bootstrap/tests/integration/start-command.test.ts`
- [X] T021 [US2] Document startup procedures and readiness expectations in `docs/dev-bootstrap/start.md`

**Checkpoint**: Developers can start environments with one command and review readiness summaries.

---

## Phase 5: User Story 3 - Controlled Shutdown & Reset (Priority: P2)

**Goal**: Enable single-command shutdown and optional reset that respects selective volume policies.

**Independent Test**: Run `pnpm dev-bootstrap stop` to confirm containers stop cleanly, then `pnpm dev-bootstrap reset --mode selective` to ensure configured volumes are removed while preserved ones remain.

### Implementation for User Story 3

- [X] T022 [P] [US3] Implement stop orchestration leveraging Docker Compose down in `tools/dev-bootstrap/src/orchestration/stop.ts`
- [X] T023 [P] [US3] Implement reset flow handling selective volume removal in `tools/dev-bootstrap/src/orchestration/reset.ts`
- [X] T024 [US3] Wire CLI stop/reset commands and shared flags in `tools/dev-bootstrap/src/commands/stop.ts` and `tools/dev-bootstrap/src/commands/reset.ts`
- [X] T025 [P] [US3] Augment summary reporter with teardown metrics and warnings in `tools/dev-bootstrap/src/reporters/summary.ts`
- [X] T026 [US3] Add integration test covering stop/reset flows in `tools/dev-bootstrap/tests/integration/reset-command.test.ts`
- [X] T027 [US3] Document teardown/reset workflows in `docs/dev-bootstrap/teardown.md`

**Checkpoint**: Full lifecycle (start → stop/reset) supported via CLI with clear reporting.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalize documentation, logging options, and onboarding materials affecting all user stories.

- [X] T028 Implement CLI help/version metadata in `tools/dev-bootstrap/src/cli.ts`
- [ ] T029 [P] Add NDJSON streaming logger and retention toggle handling in `tools/dev-bootstrap/src/reporters/log-stream.ts`
- [ ] T030 Refresh quickstart and README references for new CLI commands in `docs/dev-bootstrap/quickstart.md` and root `README.md`
- [ ] T031 Validate full happy-path using `quickstart.md` steps and capture supporting artifacts in `.dev-bootstrap/`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)** → required before Foundational.
- **Foundational (Phase 2)** → blocks all user stories; must complete first.
- **User Story Phases (3–5)** → each depends on Foundational; Stories 1 & 2 (P1) take precedence before Story 3 (P2).
- **Polish (Phase 6)** → depends on desired user stories’ completion.

### User Story Dependencies
- **US1**: Independent once foundational tasks complete.
- **US2**: Requires US1 outputs only for config access but can run in parallel once foundational ready (ensure schema loader finished).
- **US3**: Requires US2 start orchestration to exist; should begin after US2 core flow validated.

### Within-Story Order
- Commands wired only after supporting modules/tests complete.
- Documentation tasks last within each story after implementation validated.

## Parallel Opportunities
- Setup tasks T003–T004 can run alongside T001–T002 once package baseline created.
- Foundational tasks T006–T008 operate in parallel after schema definition (T005).
- In US1, tasks T010–T012 and T014 can proceed concurrently after loader available.
- In US2, tasks T015–T019 may execute in parallel once configuration modules exist.
- In US3, tasks T022–T025 parallelize with coordination on shared reporter updates.
- Integration tests (T020, T026) can run independently once orchestration modules compiled.

## Implementation Strategy

### MVP Scope (P1 Only)
1. Complete Phases 1 & 2.
2. Deliver Phase 3 (US1) to allow validated configuration editing.
3. Deliver Phase 4 (US2) to achieve one-command startup (MVP completion).

### Incremental Delivery
- **Increment 1**: Phases 1–3 → Validate configuration without running services.
- **Increment 2**: Phase 4 → Start command with readiness reporting.
- **Increment 3**: Phase 5 → Controlled shutdown/reset.
- **Increment 4**: Phase 6 → Polish, logging, onboarding docs.

### Independent Test Criteria
- **US1**: `pnpm dev-bootstrap validate` with template config passes/ fails appropriately.
- **US2**: `pnpm dev-bootstrap start` launches services, emits readiness summary, and generates NDJSON logs when enabled.
- **US3**: `pnpm dev-bootstrap stop` + `pnpm dev-bootstrap reset --mode selective` gracefully stop containers and honor volume policies.
