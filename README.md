# ChainContest
**做什么：** 构建链上资产管理竞赛的核心合约与前端控制台，为参赛者提供注册、结算与领奖的全流程支持。  
**怎么跑：** `pnpm install && pnpm --filter @chaincontest/contracts test`

## 项目一句话定位
面向去中心化竞赛场景的一体化开发套件，覆盖智能合约、前端界面与运维工具链。

## 主要功能要点
- Contest/Vault 智能合约编排参赛报名、资产托管、收益结算与领奖流程。
- PriceSource 通过 Uniswap v3 TWAP 获取价格，保障榜单及结算的可信度。
- 前端基于 Vite + htmx 提供轻量交互，实时读取链上状态与排行榜。
- Hardhat Ignition 部署脚本与文档生成工具保持合约与文档一致。
- 跨网络配置（Hardhat 本地、Sepolia 测试网）支持快速验证与演示。

## 快速开始：前置条件、安装步骤、最小可运行示例
**前置条件**
- Node.js ≥ 20.12.0
- pnpm ≥ 9.0.0

**安装步骤**
1. `pnpm install`
2. （可选）复制环境变量样例：前端 `.env`、合约 `.env` 自行创建，详见后文配置表。

**最小可运行示例**
```bash
pnpm install
pnpm --filter @chaincontest/contracts test
pnpm --filter @chaincontest/frontend dev
```

## 使用方式：常用命令、配置文件位置、关键参数
- **根目录命令**
  - `pnpm lint`：分别执行合约与前端的 ESLint。
  - `pnpm test`：调用工作区内全部测试（Hardhat + Vitest）。
  - `pnpm build`：构建合约 TypeChain 类型与前端产物。
- **关键配置文件**
  - 合约：`contracts/hardhat.config.ts`（网络、编译器、Gas 报告）。
  - 前端：`frontend/vite.config.ts`、`frontend/scripts/ensurePortAvailable.ts`。
  - 文档：`docs/contracts/index.md`（自动生成的合约 API），`docs/development/local-testing.md`。
- **关键参数**
  - `contracts/hardhat.config.ts` 中的 `DOCS_OUTPUT_DIR`、`gasReporter` 选项控制文档与 Gas 报告。
  - `frontend/src/lib/config.ts` 要求 `VITE_*` 系列环境变量用于链上连接与合约地址解析。

## 支持矩阵：运行平台、语言/版本要求
| 环境 | 最低支持 | 说明 |
| --- | --- | --- |
| 操作系统 | macOS 13 / Ubuntu 22.04 / Windows 11 | 经本地开发验证 |
| Node.js | 20.12.0 | 与根 `package.json` 对齐 |
| pnpm | 9.0.0 | 统一工作区依赖管理 |
| Solidity 编译器 | 0.8.21（主）、0.7.6（兼容库） | Hardhat 多编译器配置 |
| 浏览器 | Chromium ≥ 114 / Firefox ≥ 115 / Safari ≥ 16.4 | 前端构建目标 |

## 强烈建议（中大型/对外开源）
- 建立 CI 流水线覆盖 lint、unit、hardhat 测试并生成合约文档。
- 将合约部署地址与校验信息纳入 `docs/contracts` 并持续更新。
- 引入安全审计流程（静态分析、测试网赏金）后再公开主网部署。

## 架构/目录鸟瞰与文档索引（指向 /docs）
- `contracts/`：Hardhat 项目（合约、测试、Ignition 部署、文档脚本）→ `/docs/contracts`.
- `frontend/`：Vite + htmx 前端（脚本、测试、配置）→ `/docs/development`.
- `docs/contracts/*.md`：自动生成的合约 API/NatSpec。
- `docs/development/local-testing.md`：本地节点与前端联调说明。

## 配置与环境变量一览表（含默认值与示例）
| 变量 | 作用 | 默认值 | 示例 |
| --- | --- | --- | --- |
| `SEPOLIA_RPC_PRIMARY` | Sepolia 主 RPC 终结点 | 空（必填之一） | `https://sepolia.infura.io/v3/<key>` |
| `SEPOLIA_RPC_FALLBACK` | Sepolia 备用 RPC | 空（必填之一） | `https://rpc.sepolia.org` |
| `DEPLOYER_PRIVATE_KEY` | 部署者私钥 | 空（本地无需） | `0xabc...` |
| `FORK_RPC_URL` | Hardhat 本地分叉数据源 | 未设置 | `https://mainnet.infura.io/v3/<key>` |
| `REPORT_GAS` | 是否启用 Gas Reporter | `false` | `true` |
| `VITE_CHAIN_ID` | 前端目标链 ID | `11155111` | `31337`（本地） |
| `VITE_PRIMARY_RPC` | 前端首选 RPC | 空（必填） | `https://sepolia.infura.io/v3/<key>` |
| `VITE_FALLBACK_RPC` | 前端备用 RPC | 空（必填） | `https://rpc2.sepolia.org` |
| `VITE_CONTEST_ADDRESS` | Contest 合约地址 | 空（必填） | `0x0000000000000000000000000000000000000001` |
| `VITE_PRICE_SOURCE_ADDRESS` | PriceSource 合约地址 | 空（必填） | `0x0000000000000000000000000000000000000002` |
| `VITE_DEV_PORT` | 前端开发服务器端口 | `5173` | `5174` |

## 前端：开发/构建脚本、浏览器支持、.env 示例、设计系统链接
- **脚本**：`pnpm --filter @chaincontest/frontend dev`（开发热更新）、`pnpm --filter @chaincontest/frontend build`、`pnpm --filter @chaincontest/frontend test`、`pnpm --filter @chaincontest/frontend test:e2e`。
- **浏览器支持**：Chromium ≥ 114、Firefox ≥ 115、Safari ≥ 16.4（与 Vite 默认 targets 匹配）。
- **.env 示例**
  ```bash
  VITE_CHAIN_ID=11155111
  VITE_PRIMARY_RPC=https://sepolia.infura.io/v3/<key>
  VITE_FALLBACK_RPC=https://rpc.sepolia.org
  VITE_CONTEST_ADDRESS=0x0000000000000000000000000000000000000001
  VITE_PRICE_SOURCE_ADDRESS=0x0000000000000000000000000000000000000002
  VITE_DEV_PORT=5173
  ```
- **设计系统链接**：暂未指定（建议统一到 /docs/design/index.md 后引用）。

## 区块链/合约：网络与链ID、部署地址、ABI 位置、主要方法、测试网说明
| 网络 | 链 ID | 部署地址 | ABI 位置 | 主要方法 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Hardhat 本地 | 31337 | 本地部署后打印（Ignition） | `contracts/artifacts/src/Contest.sol/Contest.json` 等 | `initialize`, `register`, `freeze`, `settle`, `updateLeaders`, `seal`, `claim`, `exit` | 运行 `pnpm --filter @chaincontest/contracts node` 启动节点；`deploy:localhost` 推送测试数据 |
| Sepolia 测试网 | 11155111 | 待部署（部署后写入 /docs/contracts/Contest.md） | 同上 | 同上 | 使用 `pnpm --filter @chaincontest/contracts deploy:sepolia`，需配置 RPC 与私钥 |

## 编写准则（精要）
- 变量、函数使用完整英文命名，禁止版本后缀，保持与领域模型一致。
- 先修正模块抽象与边界，不新增临时包装或适配层。
- 所有变更保持原子化提交，遵循 `feat:`、`fix:` 等前缀。
- 重要配置同步更新 `/docs`，保持文档自动生成与代码一致。

更新时间：2025-10-11 · Commit：0d11a506aa54cef6427f2c3ccce9ce2a152d941f
