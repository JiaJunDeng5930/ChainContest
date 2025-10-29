# 合约部署环境指引

## 必备条件
- Node.js 20.x
- pnpm 9.x
- Docker Compose（用于本地 Hardhat 网络）
- `.env.contracts` 或 shell 环境中提供以下变量：
  - `DEPLOYER_PRIVATE_KEY`：部署账户私钥（十六进制，前缀 `0x`）。
  - `SEPOLIA_RPC_PRIMARY`：主 RPC 端点。
  - `SEPOLIA_RPC_FALLBACK`：可选备用 RPC 端点。
  - `FORK_RPC_URL`：可选，执行 Hardhat 分叉测试时使用。

## 本地 Hardhat 网络
```bash
pnpm --filter @chaincontest/contracts node
```
- 网络地址：`http://127.0.0.1:8545`
- Chain ID：`31337`
- 默认助记词：Hardhat 内置（执行 `npx hardhat accounts` 查看）。

## 测试网部署
```bash
pnpm --filter @chaincontest/contracts build
pnpm --filter @chaincontest/contracts hardhat ignition deploy ignition/modules/contest.ts --network sepolia
```
- 确保 `DEPLOYER_PRIVATE_KEY` 对应账户已在目标网络充值。
- RPC 超时时间由 Hardhat 配置决定，可在 `hardhat.config.ts` 调整。

## 常见问题
- **缺少私钥**：Hardhat 会报错 `Network sepolia doesn't have account`，请检查环境变量。
- **RPC 超时**：确认网络连通性，必要时切换到 `SEPOLIA_RPC_FALLBACK`。
- **Gas 估算失败**：手动指定 `--gas-price` 或在 Hardhat 配置中设置默认值。
