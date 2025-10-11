# 合约调试前端

该目录包含内部合约调试工具的全新前端实现，基于原生 HTML/TypeScript 与最小依赖（ethers、htmx）。

## 环境准备

1. 安装 Node.js 20 与 pnpm。
2. 复制 `.env.example` 到 `.env.local`（或 `.env`），根据实际环境填写：
   ```dotenv
   VITE_RPC_URL=https://your-rpc-endpoint
   VITE_CHAIN_ID=1
   VITE_DEV_PORT=4100
   VITE_CONTRACTS_PATH=./contracts/targets.json
   VITE_DEFAULT_ACCOUNT=0x0000000000000000000000000000000000000000
   ```
   - 所有键必须使用 `VITE_` 前缀才能暴露给前端。
   - `VITE_DEV_PORT` 会在启动前通过 `scripts/ensurePortAvailable.ts` 自动检测冲突。

## 安装依赖

```bash
pnpm --filter @chaincontest/frontend install
```

## 本地开发

```bash
pnpm --filter @chaincontest/frontend dev
```

- `predev` 钩子会执行端口占用检测脚本，如端口被占用会直接阻断启动并输出解决提示。
- 首次打开页面会执行启动握手：读取环境配置 → 检查 RPC 连接 → 验证解锁账户。若任一步失败，界面会展示错误覆盖层并给出修复建议。

## 目录结构

```
frontend/
├── index.html          # Vite 根模板
├── public/             # 静态 HTML 模板（用于服务端渲染占位）
├── scripts/            # Node/TS 工具脚本
└── src/
    ├── services/       # 配置、RPC、调用执行等核心服务
    ├── views/          # 原生 DOM 视图组件
    └── styles/         # 全局样式
```

## 常见问题

- **端口被占用**：调整 `.env` 中的 `VITE_DEV_PORT`，或释放占用进程后重新运行。
- **RPC 连接失败**：确认 `VITE_RPC_URL` 可访问且链 ID 与 `VITE_CHAIN_ID` 一致；确保节点存在解锁账户。
- **ABI 加载失败**：检查运行时配置或 `abiPath` 指向的文件是否存在且为合法 ABI JSON。
