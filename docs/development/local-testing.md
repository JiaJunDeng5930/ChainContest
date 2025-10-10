# 本地 Hardhat 测试网络搭建指南

> 本文面向新入职工程师、前端同事与测试团队，描述如何在 45 分钟内完成本地链路部署、前端联调与测试矩阵执行。

## 读者角色与前置条件

本指南面向三类核心角色，所有内容默认在隔离的本地环境执行，不需连接任何生产资源。阅读前请确认已具备下列前置条件。

### 角色画像

| 角色 | 主要目标 | 必备前置 | 移交产出 |
| --- | --- | --- | --- |
| 新成员（new-developer） | 在 45 分钟内完成依赖安装、启动 Hardhat 节点并部署演示合约 | Git 访问权限、具备基础 Node.js / pnpm 使用经验 | 可用的本地链节点、记录下来的账户与私钥 |
| 前端同事（frontend-engineer） | 配置运行时、联通本地链并验证页面数据 | 新成员交付的 `frontend/public/api/runtime/config`、浏览器访问能力 | 已更新的前端 `.env.local`、确认通过的联通截图或记录 |
| 测试人员（qa-engineer） | 执行并记录测试矩阵结果、归档故障排查步骤 | 新成员与前端同事完成的链路与 runtime 配置 | 测试执行日志、失败用例的恢复建议 |

### 支持平台

- macOS 13+（Apple Silicon 与 Intel）
- Ubuntu 22.04 LTS 或其他兼容 Linux 发行版
- Windows 11 + WSL2（Ubuntu 子系统）

若使用 Windows，请在 WSL 内执行所有命令；本文不建议在原生 PowerShell 中运行 Hardhat。

### 工具链版本矩阵

| 工具 | 推荐版本 | 备注 |
| --- | --- | --- |
| Node.js | 20.x LTS | 使用 `fnm` 或 `nvm` 安装，确保 `node -v` 输出以 `v20` 开头 |
| pnpm | 9.x | 可通过 `corepack enable` 后运行 `corepack prepare pnpm@9 --activate` |
| Hardhat CLI | 2.26.x（随 `@bc/contracts` 安装） | 通过 `pnpm --filter @bc/contracts node --version` 验证 |
| Git | 2.42+ | 需具备读取仓库与切换分支权限 |
| 可选：Docker | 24.x | 仅在需要额外服务时使用，本文流程不强制 |

### 凭证准备提醒

- 禁止复用生产或测试网私钥；统一使用 Hardhat 节点生成的隔离账户。
- 建议在仓库根目录创建 `.env.local`（不纳入版本控制），用于保存 RPC 地址、Chain ID、默认账户等信息。
- 在共享输出时，仅披露地址与公有数据；如需共享私钥，请通过安全渠道并在使用后立即更换。

## 环境准备与依赖安装

1. **确认工具链版本**
   - 运行 `node -v`，确认输出以 `v20` 开头；若不是，请使用 `fnm install 20` 或 `nvm install 20` 后重新打开终端。
   - 启用 Corepack：`corepack enable && corepack prepare pnpm@9 --activate`。执行 `pnpm -v` 应返回 9.x。
   - Windows 用户请在 WSL 内执行上述命令并通过 `which node` 验证路径位于 `/usr/bin/` 或 `~/.nvm/`。
2. **安装仓库依赖**
   - 在仓库根目录运行 `pnpm install`，确保 workspace 中 `contracts/` 与 `frontend/` 包的依赖同步安装。
   - 如果网络较慢，可设置 `PNPM_HOME` 指向本地缓存目录，避免重复下载。
3. **准备本地配置文件**
   - 在仓库根目录复制 `.env.example`（若存在）或新建 `.env.local`，写入下列最小字段：
     ```dotenv
     RPC_URL=http://127.0.0.1:8545
     CHAIN_ID=31337
     DEFAULT_ACCOUNT=0x...
     ```
     该文件用于汇总链路信息，后续章节会将其映射到前端所需的 `VITE_` 变量。
4. **预留网络端口**
   - Hardhat 节点默认占用 `8545`（RPC）与 `8546`（WebSocket）。执行 `lsof -i :8545` 或 `ss -ltnp | grep 8545` 确认无占用进程。
   - 前端 Vite 开发服务器默认使用 `4100` 端口；如与其他服务冲突，可提前在 `.env.local` 中调整 `VITE_DEV_PORT`。
5. **准备凭证存储**
   - 建议在 `~/.config/bc-hardhat/` 或团队约定目录创建加密存储，用于临时保存脚本输出的私钥。任何共享凭证需在演练后立即轮换。

## 安全策略与幂等原则

1. **凭证隔离**：所有示例仅依赖 Hardhat 自动生成的 20 个本地区块链账户。禁止导入主网或测试网私钥；若需共享签名能力，请使用 `register-setup.ts` 输出的新助记词并在完成演示后销毁。
2. **链状态重置**：当链状态不可预期或测试需要回滚时，立即停止 Hardhat 节点终端并重新执行 `pnpm --filter @bc/contracts node`。该命令默认在内存中保存状态，重启后将恢复到创世区块。若需强制清理构建产物，可先运行 `pnpm --filter @bc/contracts hardhat clean`。
3. **部署幂等性**：所有部署脚本均通过 Hardhat 提供的 `--network localhost` 连接。重复执行 `register-setup.ts` 将覆盖合约地址；请在每次执行后同步更新 runtime 配置，确保前端读取到最新地址。
4. **清理与降级路径**：完成演练后，运行 `pnpm --filter @bc/contracts hardhat clean` 并删除本地 `.env.local` 中的敏感临时凭证。若遇到脚本异常，可按照“失败判定与恢复”章节，手动删除 `frontend/public/api/runtime/config` 中的临时输出并重走部署流程。
5. **日志审计**：保留所有终端输出与测试日志 7 天，以供审计和故障回溯；禁止在公共频道分享含私钥或密钥片段的日志。

## 启动 Hardhat 节点

1. **构建并启动**
   ```bash
   pnpm install
   pnpm --filter @bc/contracts node
   ```
   - 第一条命令确保 `contracts/` 包依赖最新。
   - 第二条命令将启动 Hardhat 内置网络（默认 127.0.0.1:8545），进程会持续前台运行，请保持该终端开启。
2. **预期日志**：Hardhat 会在启动后输出账户与私钥清单，示例：
   ```text
   Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
   Accounts
   ========
   (0) 0xf39F...2266 (10000 ETH)
       Private Key: 0x59c6...
   (1) 0x7099...CF1B (10000 ETH)
       Private Key: 0x8b3a...
   ```
   如未显示账户，请确认 `contracts/hardhat.config.ts` 正常加载，无额外插件报错。
3. **健康检查**：在新的终端发送 JSON-RPC 请求，应返回当前区块高度。
   ```bash
   curl -s -X POST http://127.0.0.1:8545      -H 'Content-Type: application/json'      -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
   ```
   返回示例：`{"jsonrpc":"2.0","id":1,"result":"0x0"}`。
4. **账户校验**：执行 `pnpm --filter @bc/contracts hardhat accounts` 可再次列出账户，确保脚本依赖的 signer 可用。
5. **终止节点**：按 `Ctrl+C` 停止。由于 Hardhat 使用内存链，每次重新启动都会回到创世状态；若需要保留链状态，请勿频繁重启。

## 部署脚本与前端同步

1. **打开新的终端**：保持 Hardhat 节点运行，在另一个终端切换到仓库根目录。
2. **执行部署脚本**：
   ```bash
   pnpm --filter @bc/contracts hardhat run scripts/e2e/register-setup.ts --network localhost
   ```
   - 若首次执行，会编译合约并自动部署 Contest、Vault、Mock 资产等组件。
   - 运行成功后终端会输出一段格式化 JSON。
3. **输出字段说明**：
   ```json
   {
     "contest": "0x...",
     "priceSource": "0x...",
     "vaultImplementation": "0x...",
     "vaultFactory": "0x...",
     "entryAsset": "0x...",
     "quoteAsset": "0x...",
     "entryAmount": "1000000",
     "timelines": {
       "registeringEnds": "1690000000",
       "liveEnds": "1690003600",
       "claimEnds": "1690010800"
     },
     "deployer": {
       "address": "0xf39F...",
       "privateKey": "0x59c6..."
     },
     "participant": {
       "address": "0x7099...",
       "privateKey": "0x8b3a..."
     }
   }
   ```
   - `entryAmount` 单位为最小计量单位（示例为 6 位小数的 USDC）。
   - `timelines` 对应注册、比赛、领取阶段的 UNIX 时间戳；前端将据此计算倒计时。
   - `deployer`、`participant` 提供默认签名账户，请谨慎保存。
4. **同步到前端运行时**：
   - 打开 `frontend/public/api/runtime/config`，根据上一步输出更新 `address`、`defaultAccount`、`contracts` 列表等字段。
   - 推荐将完整 JSON 保存为 `runtime/config` 的内容，同时在 `.env.local` 中同步 `VITE_RPC_URL`、`VITE_CHAIN_ID`、`VITE_DEFAULT_ACCOUNT`。
5. **记录凭证**：将输出中的私钥安全存储，仅在本地调试期间使用，并在演练结束后按照“安全策略与幂等原则”中的清理步骤删除。

## 前端运行时配置

Hardhat 部署脚本输出的 JSON 需要按照 `specs/004-hardhat/contracts/runtime-config.openapi.yaml` 的契约写入静态文件 `frontend/public/api/runtime/config`。推荐流程如下：

1. **字段映射**
   | RuntimeConfig 字段 | 来源 | 说明 |
   | --- | --- | --- |
   | `rpcUrl` | 固定值 `http://127.0.0.1:8545`（或自定义 RPC） | 前端通过该地址请求本地 Hardhat 节点 |
   | `chainId` | Hardhat 默认 `31337` | 若自定义 Chain ID，请同步更新 `.env.local` 中的 `VITE_CHAIN_ID` |
   | `devPort` | `.env.local` 中的 `VITE_DEV_PORT`（默认 4100） | 必须与前端启动端口一致，以便文档引用 |
   | `defaultAccount` | 部署脚本输出的 `deployer.address` | 供前端默认 signer 使用，可为空 |
   | `contracts[]` | 根据输出填入每个合约的 `id/name/address/abiPath` | `abiPath` 在 `frontend/public/abi/` 目录下，保持现有命名 |
2. **生成示例 JSON**：将部署脚本输出与静态字段合并，可使用 `jq`：
   ```bash
   pnpm exec jq      --arg rpc "http://127.0.0.1:8545"      --argjson chain 31337      --argjson port 4100      '. + {rpcUrl: $rpc, chainId: $chain, devPort: $port}'      register-output.json > frontend/public/api/runtime/config
   ```
   若未安装 `jq`，可直接复制脚本输出并手动补充缺失字段。
3. **最小示例**：
   ```json
   {
     "rpcUrl": "http://127.0.0.1:8545",
     "chainId": 31337,
     "devPort": 4100,
     "defaultAccount": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
     "contracts": [
       {
         "id": "contest",
         "name": "Contest",
         "address": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
         "abiPath": "/abi/Contest.json",
         "tags": ["core", "entry"]
       }
     ]
   }
   ```
   - 所有地址必须为 0x 开头的 40 位十六进制字符串。
   - `contracts` 可包含多个条目；请确保与 `register-setup.ts` 输出一致。
4. **合法性检查**：执行 `pnpm --filter frontend lint:config`（若存在脚本）或 `node -e "JSON.parse(require('fs').readFileSync('frontend/public/api/runtime/config','utf8'))"` 验证 JSON 格式正确。
5. **共享规范**：将最终配置文件归档到项目内部文档或共享盘，命名建议为 `runtime-config-YYYYMMDD.json`，方便他人复用。

## 启动前端站点

1. **配置环境变量**：复制 `frontend/.env.example` 为 `.env.local`（如文件不存在则手动创建），并填写：
   ```dotenv
   VITE_RPC_URL=http://127.0.0.1:8545
   VITE_CHAIN_ID=31337
   VITE_DEV_PORT=4100
   VITE_CONTRACTS_PATH=./contracts/targets.json
   VITE_DEFAULT_ACCOUNT=<部署脚本输出的 deployer.address>
   ```
   - Windows WSL 用户需确保路径使用 Linux 风格（例如 `./contracts/targets.json`）。
   - 若选择直接将合约列表与运行时配置合并，可将 `VITE_CONTRACTS_PATH` 指向 `./public/api/runtime/config`，同时在前端界面中会展示该路径。
2. **启动开发服务器**：
   ```bash
   pnpm --filter frontend dev
   ```
   - 启动脚本会自动检测端口冲突；若端口被占用，将提示占用进程 PID 与解除方法。
   - 成功启动后终端会输出 `VITE v5` banner 与访问地址（默认 `http://localhost:4100/`）。
3. **浏览器验证脚本**：在浏览器打开访问地址，依次确认：
   - 首页顶部显示当前连接的 RPC 与默认账户。
   - 合约列表加载出 `Contest`、`Price Source` 等模块。
   - 控制台（Console）无 `Failed to fetch /api/runtime/config` 或 CORS 错误。
4. **命令行健康检查**：在另一个终端执行：
   ```bash
   curl -s http://localhost:4100/api/runtime/config | jq '.contracts | length'
   ```
   预期返回合约数量（≥1）。如返回空或报错，请重新同步运行时配置。
5. **关闭服务**：调试结束后按 `Ctrl+C` 停止开发服务器，避免占用端口影响其他同事。

## 前端常见故障排查

| 症状 | 可能原因 | 解决步骤 |
| --- | --- | --- |
| 启动时报 `Port 4100 is already in use` | 其他进程占用端口，或之前的 Vite 进程未退出 | 运行 `lsof -i :4100`（macOS/Linux）或 `ss -ltnp | grep 4100` 找出进程并结束；或在 `.env.local` 修改 `VITE_DEV_PORT` 并重新启动 |
| 浏览器提示 `Failed to fetch /api/runtime/config` | `frontend/public/api/runtime/config` 未更新或 JSON 不合法 | 使用 `jq` 或线上 JSON 校验器检查语法；确认文件路径与 `VITE_CONTRACTS_PATH` 一致；必要时重新执行部署脚本并覆盖文件 |
| 界面显示链 ID 不匹配 | `.env.local` 与 runtime 配置的 Chain ID 不一致 | 更新 `.env.local` 的 `VITE_CHAIN_ID` 与 runtime config 中的 `chainId` 为相同值，重启前端 |
| Windows 打开页面时无法连接本地节点 | 在 WSL 内启动前端但浏览器在 Windows 宿主打开，导致跨环境访问 | 在 WSL 内使用 `wslview http://localhost:4100/` 打开浏览器，或使用 VS Code Remote WSL；确保防火墙允许回环访问 |
| 运行时配置未更新到最新合约地址 | 多次执行部署脚本后未同步文件 | 删除旧的 `frontend/public/api/runtime/config` 并重新复制最新 JSON；在 README 验收要点中记录更新时间 |

## 时间线与预期输出

| 阶段 | 预计耗时 | 操作 / 命令 | 成功信号 | 失败信号 | 恢复手段 |
| --- | --- | --- | --- | --- | --- |
| 环境核查 | 5 分钟 | `node -v`、`pnpm -v`、端口检查 | 版本满足要求，端口未占用 | 版本不符或端口被占用 | 重新安装工具链，释放端口或更新 `.env.local` 中的端口 |
| 安装依赖 | 8 分钟 | `pnpm install` | 所有 workspace 包安装成功，无 error | pnpm 安装超时或失败 | 检查网络代理；执行 `pnpm install --offline` 使用本地缓存 |
| 启动节点 | 5 分钟 | `pnpm --filter @bc/contracts node` | 终端输出账户列表，RPC 健康检查返回 `0x0` | 启动时报错或无账户输出 | 按 `Ctrl+C` 后重新执行；若编译失败先运行 `pnpm --filter @bc/contracts hardhat clean` |
| 部署脚本 | 7 分钟 | `pnpm --filter @bc/contracts hardhat run ...` | 输出 JSON 包含地址、私钥 | 报错 `network connection` 或 `insufficient funds` | 确认节点仍在运行；必要时重启节点后重试 |
| 同步前端配置 | 5 分钟 | 更新 `frontend/public/api/runtime/config` | 文件更新后无 JSON lint 报错 | JSON 语法错误或缺字段 | 使用 `jq` 校验 JSON；参考样例重新填充 |
| 前端联调 | 10 分钟 | `pnpm --filter frontend dev` | 浏览器加载合约数据，Console 无错误 | 页面报错无法读取配置 | 检查 `.env.local` 与 runtime 配置；参阅“前端常见故障排查” |
| 测试抽样 | 5 分钟 | `pnpm --filter @bc/contracts test`（抽样） | 测试通过，生成报告 | 测试失败或依赖缺失 | 根据“测试矩阵”与“失败判定与恢复”处理 |

## 测试矩阵

| 套件 | 角色 | 命令 | 预计耗时 | 预期输出 | 前置条件 |
| --- | --- | --- | --- | --- | --- |
| 合约单测 (`contracts-unit`) | 新成员 / 测试 | `pnpm --filter @bc/contracts test` | 8-10 分钟 | 所有测试 `passing`，生成 gas 报告（如启用） | Hardhat 节点可选，不强制；需完成依赖安装 |
| 合约类型检查 | 新成员 | `pnpm --filter @bc/contracts typecheck` | 2 分钟 | TypeScript 无错误输出 | 同上 |
| 前端单测 (`frontend-unit`) | 前端 / 测试 | `pnpm --filter frontend test` | 3-5 分钟 | Vitest 报告 0 failed，用例覆盖核心服务 | 需完成 runtime 配置，允许在无节点情况下运行 |
| 前端端到端 (`frontend-e2e`) | 测试 | `pnpm --filter frontend test:e2e` | 7-12 分钟 | Playwright 通过，生成 HTML 报告于 `frontend/playwright-report/` | 要求前端 dev 服务器与 Hardhat 节点同时运行 |
| 手工旅程复核 | 测试 | 按本指南“时间线”执行并记录 | 15 分钟 | 表格中所有检查项通过，记录截图与日志 | 节点、前端、配置均已就绪 |

### 失败判定与恢复

| 套件 | 常见失败信号 | 日志 / 报告 | 恢复步骤 |
| --- | --- | --- | --- |
| 合约单测 | Hardhat 抛出 `Error: VM Exception`、Gas 报告缺失 | 终端输出、`contracts/artifacts/test-results/`（若生成） | 重新运行 `pnpm --filter @bc/contracts node` 保证链状态干净；执行 `pnpm --filter @bc/contracts hardhat clean` 后再试；记录失败交易哈希 |
| 合约类型检查 | `TS2580` 或 `Cannot find module` | 终端输出 | 确认 `tsconfig.json` 引用路径未被移动；重新安装依赖或执行 `pnpm install --force` |
| 前端单测 | Vitest 显示 `ReferenceError: fetch is not defined` 等 | `frontend/test-results/`（若配置）与终端 | 确认测试环境使用 jsdom（已默认）；如缺依赖执行 `pnpm --filter frontend install`；清理缓存 `pnpm store prune` |
| 前端端到端 | Playwright 报告 `retry #2 failed`、截图显示空白页 | `frontend/playwright-report/index.html`、`frontend/playwright-report/data/` | 确认 Hardhat 节点与前端 dev 服务均运行；执行 `pnpm --filter frontend test:e2e --debug` 观察步骤；如账号缺失，重新同步 runtime config |
| 手工旅程 | 表格检查项未完成或时间超出 45 分钟 | 自行记录的 Markdown/截图 | 回到对应章节复查；如多次失败，将原因同步到 README FAQ 并安排补充文档 |

**异常升级流程**：连续两次运行同一套件失败时，将终端日志与配置备份上传到 `docs/reports/YYYYMMDD/` 并通知文档负责人，直到问题关闭前暂停相关交付。

## 维护与更新责任

| 触发事件 | 响应时限 | 责任角色 | 动作 |
| --- | --- | --- | --- |
| 合约接口或部署脚本修改 | 24 小时内 | 合约负责人 | 更新 `docs/development/local-testing.md` 中的命令与输出示例；重新生成 runtime 配置并通知前端 |
| 前端读取逻辑变更 | 24 小时内 | 前端负责人 | 更新 `frontend/public/api/runtime/config` 样例、`.env` 字段说明与 README 快速导航 |
| 工具链版本升级（Node、pnpm、Hardhat、Vitest、Playwright） | 48 小时内 | DevOps / 文档维护者 | 在“读者角色与前置条件”“环境准备”中同步版本矩阵；验证测试矩阵在新版本下可通过 |
| 安全或审计发现新风险 | 12 小时内 | 安全联络人 | 在“安全策略与幂等原则”“常见故障排查”补充警示与缓解步骤 |
| 定期巡检 | 每月第一个工作日 | 文档维护者 | 按“测试矩阵”执行抽查（至少合约单测 + 前端单测），并将结果登记到 `docs/reports/YYYYMM/inspection.md` |

所有更新完成后，在 README “常见问题”段落记录变更摘要，并在版本控制中附上实际测试日志链接。

## 附录

- 术语表、FAQ 与额外链接待后续补充。
- 2025-10-10：对照 `quickstart.md`、`research.md` 校验命令与路径一致，未发现冲突。
- 2025-10-10：完成人工 Markdown 校对，标题层级与内联链接检查通过。
