# Dev Bootstrap 配置参考

本指南说明如何编写 `dev-bootstrap.config.yaml`（全局配置）与可选的 `dev-bootstrap.config.local.yaml`（个人覆盖文件），并给出各字段的业务含义与校验规则。配置由 CLI 在启动、停止或验证环境前解析，建议始终通过 `pnpm dev-bootstrap validate` 校验后再执行其他命令。

## 文件结构

| 文件 | 作用 | 版本控制 |
| ---- | ---- | -------- |
| `dev-bootstrap.config.template.yaml` | 模板文件，包含所有字段示例和默认值 | ✓ 已提交，可作为参考 |
| `dev-bootstrap.config.yaml` | 主配置，提交至仓库，描述团队统一环境 | ✓ |
| `dev-bootstrap.config.local.yaml` | 本地覆盖项，例如端口或日志偏好 | ✗（`.gitignore` 已排除） |
| `dev-bootstrap.env.example` | 样例环境变量，复制为 `dev-bootstrap.env` 使用 | ✓ |

创建配置的推荐步骤：

1. 从模板复制主配置：
   ```bash
   cp dev-bootstrap.config.template.yaml dev-bootstrap.config.yaml
   ```
2. 按需调整必填字段（如 `projectName`、`services`）。
3. 如需个人覆盖，复制一份：
   ```bash
   cp dev-bootstrap.config.template.yaml dev-bootstrap.config.local.yaml
   ```
   然后仅保留需要覆盖的字段。
4. 如果需要 `.env` 注入项，复制样例：
   ```bash
   cp dev-bootstrap.env.example dev-bootstrap.env
   ```
   按需调整变量后，CLI 会在启动时自动注入。
5. 运行校验：
   ```bash
   pnpm dev-bootstrap validate
   ```

## 顶层字段说明

| 字段 | 类型 | 说明 | 约束 |
| ---- | ---- | ---- | ---- |
| `version` | `string` | 配置架构版本 | 必须是 CLI 支持的语义化版本，例如 `0.1.0` |
| `projectName` | `string` | Compose 工程名及日志前缀 | 需满足 Docker 允许的名称规范 |
| `services` | `ServiceDefinition[]` | 受管服务列表 | 至少 1 个，`name` 唯一 |
| `profiles` | `ProfileToggle[]` | 可选服务分组 | `services` 中引用的 profile 必须在此声明 |
| `volumes` | `VolumeRule[]` | 卷持久化策略 | `name` 唯一，用于 reset 策略 |
| `envFiles` | `string[]` | 需要注入的 `.env` 文件路径 | 相对仓库根目录，需存在 |
| `prerequisites` | `PrerequisiteChecklist` | 启动前硬件/工具要求 | 数值必须大于 0 |
| `logging` | `LoggingPreferences` | CLI 输出与日志保留策略 | 若启用 JSON 或日志保留，必须设置 `ndjsonPath` |
| `resetPolicy` | `ResetPolicy` | 默认的 `reset` 行为 | `mode=selective` 时需声明 `selectiveVolumes` |

## ServiceDefinition

| 字段 | 类型 | 说明 | 约束 |
| ---- | ---- | ---- | ---- |
| `name` | `string` | Compose 服务名 | 与其他服务互斥 |
| `dockerfile` | `string` | Dockerfile 路径 | 与 `image` 互斥；存在时可同时配置 `context` |
| `context` | `string` | 构建上下文目录 | 仅在定义 `dockerfile` 时可用 |
| `image` | `string` | 预构建镜像 | 与 `dockerfile` 互斥 |
| `command` | `string \| string[]` | 运行命令覆盖 | 可选 |
| `ports` | `PortMapping[]` | 端口映射 | `host` 唯一，不得重复 |
| `environment` | `Record<string,string>` | 非敏感环境变量 | 建议用于本地账号或公共配置 |
| `dependsOn` | `string[]` | 启动依赖服务名 | 需引用现有服务 |
| `profiles` | `string[]` | 服务绑定的 profile | profile 必须在 `profiles` 中定义 |
| `healthcheck` | `HealthcheckDefinition` | 健康检查命令 | 可选，遵循 Compose 语法 |
| `volumes` | `string[]` | Compose 挂载信息 | 使用标准 `source:target[:mode]` 简写 |

### 端口、依赖与挂载
- `ports[*].host` 与 `protocol` 组合必须唯一，工具会在校验阶段报告冲突。
- `dependsOn` 用于 Compose 的依赖排序，不会自动创建循环；请避免环依赖。
- `volumes` 采用 Compose 字符串写法，建议仅在需要持久化数据或挂载配置文件时使用；来源卷必须出现在顶层 `volumes` 中。

## ProfileToggle

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `key` | `string` | CLI `--profile` 参数使用的标识符 |
| `description` | `string` | 该 profile 的用途说明 |
| `defaultEnabled` | `boolean` | 启动时是否默认启用 |
| `services` | `string[]` | 被此 profile 激活的服务列表 |

> 当 `defaultEnabled=false` 时，运行命令时可通过 `--profile <key>` 手动开启。

## VolumeRule 与 ResetPolicy

- `volumes[].preserveOnReset=true` 表示 `pnpm dev-bootstrap reset --mode selective` 时保留该卷。
- `resetPolicy.mode` 决定 `reset` 未显式指定模式时的行为：
  - `preserve`: 仅停止容器，不删除卷。
  - `selective`: 删除 `selectiveVolumes` 指定的卷。
  - `full`: 删除所有 Compose 卷（谨慎使用）。

## LoggingPreferences

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `format` | `"table" \| "json" \| "both"` | 汇总输出模式 |
| `ndjsonPath` | `string` | JSON/NDJSON 输出文件路径 |
| `retainComposeLogs` | `boolean` | 是否持久化原始 Compose 日志 |

当 `format` 包含 `json` 或启用 `retainComposeLogs` 时，`ndjsonPath` 为必填路径，通常建议指向仓库根下的 `.dev-bootstrap/logs.ndjson`。

## 校验与常见错误

- `pnpm dev-bootstrap validate`: 校验结构与交叉约束，输出带指导信息的错误列表。
- 常见错误示例：
  - **重复服务名**：确认 `services[].name` 唯一。
  - **未知 profile 引用**：先在 `profiles` 中声明再在服务里使用。
  - **端口冲突**：调整 `host` 端口或更新本地占用服务。
  - **缺失 `ndjsonPath`**：启用 JSON/日志保留时需同时配置路径。

## 推荐实践

- 使用 `dev-bootstrap.config.local.yaml` 覆盖与团队无关的设置（端口、日志路径等）。
- 不要在配置中写入生产或敏感凭据，使用 `.env` 文件配合 `envFiles` 注入。
- 变更配置后，先执行校验再提交，确保 CI 环境也能成功加载。
- 在 PR 中附上 `pnpm dev-bootstrap validate` 的运行结果截图或日志，有助于审核。

更多运维或启动细节参考 `docs/dev-bootstrap/quickstart.md`（待后续任务补充）。
