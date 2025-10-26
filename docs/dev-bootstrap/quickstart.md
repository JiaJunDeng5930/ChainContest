# Dev Bootstrap 快速入门

本文快速带你完成配置编写、校验、启动以及停止/重置流程。详细字段说明请参阅 `docs/dev-bootstrap/configuration.md`，生命周期说明见 `docs/dev-bootstrap/teardown.md`。

## 1. 安装与构建

```bash
pnpm install
pnpm --filter tools/dev-bootstrap build
```

> `pnpm dev-bootstrap <command>` 是在仓库根目录提供的脚手架别名。

## 2. 创建配置

1. 拷贝模板：
   ```bash
   cp dev-bootstrap.config.template.yaml dev-bootstrap.config.yaml
   ```
2. （可选）创建本地覆盖：
   ```bash
   cp dev-bootstrap.config.template.yaml dev-bootstrap.config.local.yaml
   ```
   保留需要覆盖的字段，例如端口或 profile 默认值。
3. 准备环境变量：复制样例并按需调整。
   ```bash
   cp dev-bootstrap.env.example dev-bootstrap.env
   ```
   `dev-bootstrap.env` 已被 `.gitignore` 忽略，不会提交到版本库。
4. 配置文件和 `.env` 均存放在仓库根目录，`dev-bootstrap.config.local.yaml` 已在 `.gitignore` 中忽略。

## 3. 校验配置

```bash
pnpm dev-bootstrap validate [--format json]
```

- 成功时输出服务/消息列表；
- 失败时逐项给出字段级提示，并在 JSON 模式下输出结构化错误。

## 4. 启动环境

```bash
pnpm dev-bootstrap start [--profile <name>] [--no-profile <name>] [--format both]
```

- 默认启用 `core` profile（Hardhat 本地链、PostgreSQL、Redis、API Server、Web UI）；`indexer` profile 包含事件索引和任务执行服务，可按需通过 `--profile indexer` 启用；
- `--profile` 可多次出现以启用额外 profile，`--no-profile` 可多次出现用于禁用默认 profile；
- 运行结束后，摘要会显示启用的 profile、生成的 Compose 文件位置以及每个服务的状态；
- 若配置了 `logging.ndjsonPath`，还会在对应路径生成 NDJSON 事件流。

> 默认 Hardhat 节点对宿主机暴露 `http://localhost:48545`，可用于部署合约与本地调试。

## 5. 停止与重置

```bash
pnpm dev-bootstrap stop [--remove-volumes]

pnpm dev-bootstrap reset [--mode preserve|selective|full] [--volume <name>]
```

- `stop` 默认仅停止容器，可选 `--remove-volumes` 一并清理卷；
- `reset` 根据 `--mode` 及 `--volume` 参数执行选择性或完整清理，不指定时回退到配置文件中的默认策略；
- 摘要会列出删除的卷数量，如选择性模式未命中任何卷会给出警告。

## 6. 杂项命令

- 查看帮助：`pnpm dev-bootstrap --help`
- 查看版本：`pnpm dev-bootstrap --version`

执行过程中如需更多调试信息，可通过 `logging.retainComposeLogs=true` 保留 Compose 原始日志，并在 `.dev-bootstrap/compose.log` 查看。
