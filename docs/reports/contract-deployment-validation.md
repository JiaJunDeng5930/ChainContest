# Contract Deployment Validation Report — 2025-10-30

| Item | Value |
|------|-------|
| Environment | Hardhat local node (`http://127.0.0.1:8545`) |
| Operator | chrome-devtools MCP session (`npx chrome-devtools-mcp@latest --headless=true`) |
| Wallet | Hardhat account #0 (deployer) |
| API Host | http://localhost:43000 (web UI) / http://localhost:44000 (API) |

## Flow Snapshot

1. **Login** — 完成 SIWE 流程，`/api/auth/session` 返回活跃会话。
2. **Deploy Vault implementation**
   - UI 触发 `POST /api/organizer/components/vaults`
   - 交易哈希：`0xd454b159058f7c02bc0cd3b52ad791e2dba4be318c15e10da255c169e1d3680c`
   - 部署地址：`0x5fbdb2315678afecb367f032d93f642f64180aa3`
   - `organizer_components` 表新增记录（`component_type=vault_implementation`，`status=confirmed`）
3. **Deploy PriceSource**
   - UI 触发 `POST /api/organizer/components/price-sources`
   - 交易哈希：`0x3c4772ebe359c1725df8ca27deabe15b0f10ff4232ad6f482bccda9b748c532c`
   - 部署地址：`0xe7f1725e7734ce288f8367e1bb143e90bb3f0512`
   - `organizer_components` 表新增记录（`component_type=price_source`，`status=confirmed`）
4. **Create contest**
   - `POST /api/contests/create` (`networkId=31337`)
   - Contest 初始化哈希：`0xa5225d4103c49d5019977a74c4e44b232248d664965e046d7f9625b4260ef724`
   - Contest 合约部署哈希：`0xa4bb64a981e7f3473c1f804a46ac593a6be63a5ba7e671525bb287a4397d22f7`
   - VaultFactory 部署哈希：`0x8f12c58d6f031ed370cd64472f814c9a99967f40fc84aef39696e69c4245ed76`
   - Contest 地址：`0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`
   - VaultFactory 地址：`0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9`
5. **Verification**
   - `organizer_components` 表包含两条 `confirmed` 记录，地址与交易哈希匹配上链结果。
   - `contest_creation_requests`：`status=confirmed`，`transaction_hash=0xa5225d4103c49d5019977a74c4e44b232248d664965e046d7f9625b4260ef724`
   - `contest_deployment_artifacts`：
     - `contest_address=0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`
     - `vault_factory_address=0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9`
     - `metadata.transactions` 同步记录 `contest`、`vaultFactory`、`initialize` 三笔交易哈希
   - `ethers` 查询 `getCode` 确认上述四个地址均存在非空字节码

## Notes

- `apps/api-server/lib/runtime/address.ts` 补充导出 `lowercaseAddress` 以便运行时标准化地址。
- 验证过程中使用 Chrome DevTools 控制台触发最终 `POST /api/contests/create`，并通过 `psql` / `ethers` 双重确认链上与数据库写入结果。
