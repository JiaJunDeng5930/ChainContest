# 手动验收报告：002-bug-localhost-port

## 测试环境
- Node.js 20.18 / pnpm 9.10
- 本地 Hardhat 模拟链，提供解锁账户
- `frontend/.env.local` 配置：
  - `VITE_RPC_URL=http://127.0.0.1:8545`
  - `VITE_CHAIN_ID=31337`
  - `VITE_DEV_PORT=4100`
  - `VITE_CONTRACTS_PATH=./contracts/targets.local.json`
  - `VITE_DEFAULT_ACCOUNT=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`

## 验收用例

### US1：合约函数调用
1. 启动 `pnpm --filter frontend dev`，端口检测脚本通过。
2. 页面成功加载合约列表（3 个合约、共 42 个函数）。
3. 选择读函数 `balanceOf(address)`，输入有效地址 → 即时返回数值并在日志面板记录 `info`。
4. 选择写函数 `transfer(address,uint256)`，填写参数并提交 → 状态流转 `queued → submitted → confirmed`，接收交易回执哈希。

### US2：状态与日志
1. 写交易过程中，连接横幅维持“connected”，函数表单徽标实时更新。
2. 人为触发无效输入（地址格式错误）→ 表单阻断发送，status 显示 `rejected`，日志出现 `error` 条目。
3. 模拟 RPC 断连 → 调用失败，错误覆盖层显示修复建议；恢复后重新执行成功。

### US3：配置化启动
1. 修改 `.env.local` 中的端口为 4200 → 再次 `pnpm dev`，检测脚本提示旧端口占用，换用 4200 后启动成功。
2. 修改 `VITE_RPC_URL` 为不可达地址 → 启动握手失败，覆盖层提示“RPC 节点连接正常”变为故障信息。
3. 还原配置后重新启动，横幅显示链 ID 31337，默认账户正确加载。

## 结论
- ✅ 所有用户故事均通过手动验收。
- ✅ 日志/历史导出功能生成 JSON，无格式错误。
- ✅ 错误覆盖层在配置与调用失败时均提供修复指引。
