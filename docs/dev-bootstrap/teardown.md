# Dev Bootstrap 停止与重置指南

## 1. 停止环境

- 命令：
  ```bash
  pnpm dev-bootstrap stop
  ```
- 行为：执行 `docker compose down --remove-orphans`，默认保留数据卷。
- 可选项：增加 `--remove-volumes` 可一并删除 Compose 创建的卷。
- 输出解读：
  - 表格列出全部服务并标记为 `stopped`。
  - `Metrics` 区域展示 `serviceCount` 以及是否删除卷。

## 2. 重置环境

- 命令：
  ```bash
  # 使用配置中的默认模式
  pnpm dev-bootstrap reset

  # 指定模式
  pnpm dev-bootstrap reset --mode selective --volume chaincontest-postgres
  ```
- 模式说明：
  | 模式 | 描述 |
  | ---- | ---- |
  | `preserve` | 仅停止容器，保留所有卷 |
  | `selective` | 停止容器，并按配置或命令行参数选择性删除卷 |
  | `full` | 停止容器并删除全部 Compose 卷（谨慎使用） |
- 选择性重置策略：
  - 优先使用命令行 `--volume <name>`（可多次传入）。
  - 若未指定，则使用配置 `resetPolicy.selectiveVolumes`。
  - `SummaryReporter` 会给出删除结果，若未匹配任何卷将提示警告。

## 3. NDJSON 事件

若在配置 `logging.ndjsonPath`，停止/重置同样会写入事件流：

| 事件类型 | 说明 |
| -------- | ---- |
| `service-status` | 停止后服务状态快照 |
| `readiness` | 重置过程中剩余待清理服务/卷 |
| `summary` | 命令结果、模式和删除数量 |

## 4. 常见问题

- *提示卷不存在*：检查卷名是否与 `volumes[].name` 一致，或确认配置/命令行是否拼写正确。
- *删除卷失败*：可能有其他容器仍在使用，需先停止相关容器或手动执行 `docker volume rm`。
- *绑定路径未删除*：只有 `volumes[].path` 指定的目录会尝试使用 `rm -rf` 删除；若路径超出仓库，需确认是否有写权限。

## 5. 建议流程

1. 修改配置或测试数据前，执行 `pnpm dev-bootstrap stop` 确保环境干净。
2. 如需彻底清理，执行 `pnpm dev-bootstrap reset --mode full`（会删除全部卷）。
3. 再次启动前，可使用 `pnpm dev-bootstrap validate` 复查配置。
