# Quickstart — 链上托管交易比赛

## 前置要求
- Node.js 24.x、pnpm 10.x。
- Hardhat v3（内置 Ignition 部署模块）。
- 已配置 Sepolia 测试网账户与 USDC/WETH 测试代币水龙头。
- 环境变量：
  - `SEPOLIA_RPC_PRIMARY`：Infura HTTPS 终结点。
  - `SEPOLIA_RPC_FALLBACK`：Alchemy HTTPS 终结点。
  - `DEPLOYER_PRIVATE_KEY`：部署钱包私钥（0x 前缀）。

## 安装
```bash
pnpm install
pnpm --filter contracts install
pnpm --filter frontend install
```

## 合约地址（截至 2025-10-09）

| 环境 | Contest | VaultFactory | Vault Implementation | PriceSource | Entry Asset (USDC) | Quote Asset (WETH) |
|------|---------|--------------|----------------------|-------------|--------------------|--------------------|
| Hardhat (localhost) | 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 | 0x0165878A594ca255338adfa4d48449f69242Eb8F | 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 | 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707 | 0x5FbDB2315678afecb367f032d93F642f64180aa3 | 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 |
| Sepolia（待发布） | — | — | — | — | — | — |

> 使用 `pnpm --filter @bc/contracts exec -- hardhat run scripts/e2e/register-setup.ts` 可快速生成上述本地地址 JSON 输出。完成 Sepolia 部署后，请将产物复制到 `frontend/src/config/contracts/` 并同步更新本表。

## 合约工作流
1. 复制 `contracts/.env.example` 为 `.env` 并填入 RPC 与私钥。
2. 编译与生成类型：
   ```bash
   pnpm --filter contracts hardhat compile
   pnpm --filter contracts hardhat typechain
   ```
3. 运行测试与 gas 报告：
   ```bash
   pnpm --filter contracts hardhat test
   REPORT_GAS=true pnpm --filter contracts hardhat test --grep "Contest"
   pnpm --filter contracts exec -- hardhat run scripts/report-gas.ts
   pnpm --filter contracts hardhat test --network sepolia --grep "fork"  # 分叉测试
   ```
4. 本地模拟完整结算链路（可选）：
   ```bash
   pnpm --filter contracts node -- --hostname 127.0.0.1 --port 8547
   pnpm --filter contracts exec -- hardhat run scripts/e2e/settlement-setup.ts --network localhost
   ```
5. 部署流程：
   ```bash
   pnpm --filter contracts hardhat ignition deploy ignition/modules/contest.ts --network localhost
   ```

## 前端工作流
1. 将合约部署产物 `contracts/deployments/sepolia/*.json` 复制到 `frontend/src/config/contracts/`。
2. `.env` 配置：
   ```
   VITE_PRIMARY_RPC=${SEPOLIA_RPC_PRIMARY}
   VITE_FALLBACK_RPC=${SEPOLIA_RPC_FALLBACK}
   VITE_CONTEST_ADDRESS=0x...
   VITE_PRICE_SOURCE_ADDRESS=0x...
   VITE_TEST_ACCOUNTS=0x管理员,0x赢家A,0x赢家B,0x参赛者C
   ```
3. 启动开发服务器：
   ```bash
   pnpm --filter frontend dev
   ```
4. 运行测试：
   ```bash
   pnpm --filter frontend test            # Vitest
   pnpm --filter frontend test:e2e        # Playwright，需先 `pnpm --filter frontend dev`
   ```

## 标准旅程验证
1. **报名**：在前端连接钱包，按提示授权 USDC 并发送 `register` 交易；确认 `ContestRegistered` 事件，金库地址余额等于报名本金。
2. **换仓**：在 `LIVE` 状态下执行一次合法 swap，再尝试超出 ε 或非白名单池的 swap，预期后者返回 `PriceSourcePriceOutOfTolerance` 等错误。
3. **冻结与结算**：等待 `timeline.liveEnds` 或使用脚本推进时间后，点击“冻结比赛”按钮进入 `FROZEN`；随后对每位参赛者调用 `settle` 并观察 `VaultSettled` 事件与 NAV/ROI。
4. **更新排行榜**：点击“更新排行榜”，前端会根据当前 NAV 降序选择前 K 名并调用 `updateLeaders`，确认事件与排行榜组件展示一致。
5. **封榜与领奖**：调用 `seal()` 后由上榜金库执行 “领奖”，其余参赛者点击 “退出领取本金”，分别触发 `RewardClaimed` 与 `VaultExited` 事件。
6. **奖池归零**：所有领奖／退出完成后，管理员面板的 `当前奖池剩余` 与 `contest.prizePool()` 应显示 `0`。

## 故障应对
- 价格源异常：`settle` revert 时提示重试或延迟，必要时通过 `pause` 暂停入口。
- RPC 故障：前端自动切换备用终结点；如均不可用，提示用户稍后重试。
- 安全事件：在 `LIVE` 阶段触发 `freeze`（等同时间到达），进入 `FROZEN` 并暂停 swap。
- Gas 报告为空：确认在执行测试或脚本时已设置 `REPORT_GAS=true`，并确保安装了 `hardhat-gas-reporter` 依赖；若仍为空，先运行 `pnpm --filter contracts hardhat clean && pnpm --filter contracts hardhat compile` 再重新执行。
- Hardhat 脚本报错 `ContestInvalidParam(\"unsorted\")`：通常是排行榜输入未按 NAV 降序排序，先运行 `scripts/report-gas.ts` 或参考测试产出的排行榜顺序再手动调用。
