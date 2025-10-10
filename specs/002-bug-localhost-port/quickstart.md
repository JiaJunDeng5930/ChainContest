# Quickstart – 开发者合约调试前端重建

## 准备环境
1. 确认已安装 Node.js 20 与 pnpm（仓库统一工具链）。
2. 在仓库根目录创建或更新 `frontend/.env.local`（或 `frontend/.env`）并至少包含：
   ```
   VITE_RPC_URL=https://your-rpc-endpoint
   VITE_CHAIN_ID=1
   VITE_DEV_PORT=4100
   VITE_CONTRACTS_PATH=./contracts/targets.json
   VITE_DEFAULT_ACCOUNT=0x...
   ```
   - 所有键必须以 `VITE_` 前缀暴露给前端。
   - `targets.json` 保存合约清单与 ABI 路径。

## 运行开发服务器
1. 在仓库根目录执行：
   ```
   pnpm --filter frontend install
   pnpm --filter frontend dev
   ```
   - `predev` 钩子会运行 `scripts/ensurePortAvailable.ts`，如端口被占用会立即退出并提示调整 `VITE_DEV_PORT`。
2. 浏览器访问 `http://localhost:$VITE_DEV_PORT`，页面会执行启动握手：
   - 加载 `.env` 与 `/api/runtime/config`，校验缺失字段会直接阻断启动并在界面显示修复指南；
   - 检查 RPC 连通性与解锁账户，通过后连接横幅会显示“RPC 节点连接正常”。

## 配置合约与 ABI
1. 在 `contracts/targets.json` 中定义：
   ```json
   [
     {
       "id": "corePool",
       "name": "Core Pool",
       "address": "0x...",
       "abiPath": "./contracts/abi/corePool.json",
       "tags": ["liquidity"]
     }
   ]
   ```
2. 对应 ABI 文件需位于可读路径，启动时若解析失败将阻止应用继续运行。

## 调试与验证
1. 启动界面中选择任意合约函数：
   - 读函数：输入参数后点击“执行”立即展示结果与日志。
   - 写函数：完成参数后触发校验，确认弹窗包含函数名、参数摘要、链 ID。
2. 当交易进入不同阶段，连接横幅、状态徽标与日志面板会实时更新，可使用级别过滤定位；写交易确认后可在调用历史中查看回执。
3. 若调用失败，错误覆盖层会弹出结构化错误（码、原因、修复建议），同时保留原始 RPC 返回值，便于审计和重试。
