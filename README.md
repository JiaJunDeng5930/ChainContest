# ChainContest

构建链上资产管理竞赛的核心合约与前端控制台，为参赛者提供注册、结算与领奖的全流程支持。
**怎么跑：** `pnpm install && pnpm test`

## 主要功能要点

- Contest/Vault 智能合约编排参赛报名、资产托管、收益结算与领奖流程。
- PriceSource 通过 Uniswap v3 TWAP 获取价格，保障榜单及结算的可信度。
- 前端基于 Vite + htmx 提供轻量交互，实时读取链上状态与排行榜。
- Hardhat Ignition 部署脚本与文档生成工具保持合约与文档一致。
- 跨网络配置（Hardhat 本地、Sepolia 测试网）支持快速验证与演示。

## 快速开始

**前置条件**

- Node.js ≥ 20.12.0
- pnpm ≥ 9.0.0

**安装步骤**

1. `pnpm install`
2. 前端 `.env`、合约 `.env` 自行创建，详见后文配置表。

**最小可运行示例**

```bash
pnpm install
pnpm --filter @chaincontest/contracts test
pnpm --filter @chaincontest/dev-console dev
```

## 使用方式

- **根目录命令**
  - `pnpm lint`：分别执行合约与前端的 ESLint。
  - `pnpm test`：调用工作区内全部测试（Hardhat + Vitest）。
  - `pnpm build`：构建合约 TypeChain 类型与前端产物。
- **关键配置文件**
  - 合约：`contracts/hardhat.config.ts`（网络、编译器、Gas 报告）。
  - 前端：`apps/dev-console/vite.config.ts`、`apps/dev-console/scripts/ensurePortAvailable.ts`。
  - 文档：`docs/contracts/index.md`（自动生成的合约 API），`docs/development/local-testing.md`。
- **关键参数**
  - `contracts/hardhat.config.ts` 中的 `DOCS_OUTPUT_DIR`、`gasReporter` 选项控制文档与 Gas 报告。
  - `apps/dev-console/src/lib/config.ts` 要求 `VITE_*` 系列环境变量用于链上连接与合约地址解析。

## 目录

- `contracts/`：Hardhat 项目（合约、测试、Ignition 部署、文档脚本）→ `/docs/contracts`.
- `apps/dev-console/`：Vite + htmx 前端（脚本、测试、配置）→ `/docs/development`.
- `docs/contracts/*.md`：自动生成的合约 API/NatSpec。
- `docs/development/local-testing.md`：本地节点与前端联调说明。

## 配置与环境变量一览表

| 变量                        | 作用                   | 默认值         | 示例                                         |
| --------------------------- | ---------------------- | -------------- | -------------------------------------------- |
| `SEPOLIA_RPC_PRIMARY`       | Sepolia 主 RPC 终结点  | 空（必填之一） | `https://sepolia.infura.io/v3/<key>`         |
| `SEPOLIA_RPC_FALLBACK`      | Sepolia 备用 RPC       | 空（必填之一） | `https://rpc.sepolia.org`                    |
| `DEPLOYER_PRIVATE_KEY`      | 部署者私钥             | 空（本地无需） | `0xabc...`                                   |
| `FORK_RPC_URL`              | Hardhat 本地分叉数据源 | 未设置         | `https://mainnet.infura.io/v3/<key>`         |
| `REPORT_GAS`                | 是否启用 Gas Reporter  | `false`        | `true`                                       |
| `VITE_CHAIN_ID`             | 前端目标链 ID          | `11155111`     | `31337`（本地）                              |
| `VITE_PRIMARY_RPC`          | 前端首选 RPC           | 空（必填）     | `https://sepolia.infura.io/v3/<key>`         |
| `VITE_FALLBACK_RPC`         | 前端备用 RPC           | 空（必填）     | `https://rpc2.sepolia.org`                   |
| `VITE_CONTEST_ADDRESS`      | Contest 合约地址       | 空（必填）     | `0x0000000000000000000000000000000000000001` |
| `VITE_PRICE_SOURCE_ADDRESS` | PriceSource 合约地址   | 空（必填）     | `0x0000000000000000000000000000000000000002` |
| `VITE_DEV_PORT`             | 前端开发服务器端口     | `5173`         | `5174`                                       |

## 前端

- **脚本**：`pnpm --filter @chaincontest/dev-console dev`（开发热更新）、`pnpm --filter @chaincontest/dev-console build`、`pnpm --filter @chaincontest/dev-console test`、`pnpm --filter @chaincontest/dev-console test:e2e`。
- **.env 示例**
  ```bash
  VITE_CHAIN_ID=11155111
  VITE_PRIMARY_RPC=https://sepolia.infura.io/v3/<key>
  VITE_FALLBACK_RPC=https://rpc.sepolia.org
  VITE_CONTEST_ADDRESS=0x0000000000000000000000000000000000000001
  VITE_PRICE_SOURCE_ADDRESS=0x0000000000000000000000000000000000000002
  VITE_DEV_PORT=5173
  ```

更新时间：2025-10-11 · Commit：0d11a506aa54cef6427f2c3ccce9ce2a152d941f
