# Dev Bootstrap 启动指引

本文档说明如何使用 `dev-bootstrap` CLI 运行一键启动流程、解读预检输出以及排查常见问题。

## 1. 快速启动

1. 确保已准备好经过校验的 `dev-bootstrap.config.yaml`。
2. 在仓库根目录执行：
   ```bash
   pnpm dev-bootstrap start
   ```
3. 命令执行流程：
   - **预检**：检查 Docker Engine、Compose 版本，验证 CPU/内存阈值及端口占用情况。
   - **生成 Compose**：在 `.dev-bootstrap/docker-compose.generated.yaml` 写入临时配置。
   - **启动服务**：执行 `docker compose up --detach --remove-orphans`，并输出服务就绪状态。
   - **汇总报告**：终端显示成功/失败结果，若配置启用 `logging.ndjsonPath`，会在对应路径生成 NDJSON 事件流。

## 2. Profiles 控制

- 默认启用 `profiles[].defaultEnabled = true` 的分组。
- 临时启用额外 profile：
  ```bash
  pnpm dev-bootstrap start --profile indexer
  ```
- 禁用默认 profile：
  ```bash
  pnpm dev-bootstrap start --no-profile core
  ```
  （CLI 会在后续任务中提供 `--no-profile` 选项，当前仅需在配置层调整 `defaultEnabled`。）

## 3. 输出解读

- **预检通过**：终端提示“预检已通过”，若包含警告会标记⚠️并列出原因。
- **服务状态**：每个服务显示 `running`/`starting`/`failed` 等状态；若健康检查启用，会在详情中展示 `health:` 描述。
- **NDJSON 事件**（可选）：文件内的每一行都是 JSON，对应事件类型 `preflight`、`service-status`、`readiness` 等，可在 CI 或脚本中消费。

## 4. 常见问题

| 场景 | 处理建议 |
| ---- | -------- |
| 预检失败：Docker 版本不足 | 升级 Docker Desktop 或安装最新 Docker Engine/Compose v2 |
| 预检失败：端口占用 | 根据提示关闭冲突进程，或更新配置中的 `services[].ports[]` |
| 某服务 `failed` | 使用 `docker compose logs <service>` 查看容器日志，修正镜像/命令配置 |
| NDJSON 文件未生成 | 检查配置 `logging.ndjsonPath` 是否填写，以及命令是否有写入权限 |

## 5. 停止与清理

启动成功后，可使用以下命令管理生命周期：

```bash
pnpm dev-bootstrap stop     # 停止所有容器（后续任务实现）
pnpm dev-bootstrap reset    # 根据 resetPolicy 选择性清理卷（后续任务实现）
```

在修改配置后，建议重新执行 `pnpm dev-bootstrap validate` 确认无误，再运行 `start` 命令。
