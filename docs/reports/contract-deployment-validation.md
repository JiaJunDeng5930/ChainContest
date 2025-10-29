# Contract Deployment Validation Report — 2025-10-29

| Item | Value |
|------|-------|
| Environment | Hardhat local node (`http://127.0.0.1:8545`) |
| Operator | chrome-devtools MCP session (`npx chrome-devtools-mcp@latest --headless=true`) |
| Wallet | Hardhat account #0 (deployer) |
| API Host | http://localhost:3000 |

## Flow Snapshot

1. **Login** — 完成 SIWE 流程，`/api/auth/session` 返回活跃会话。
2. **Deploy Vault implementation**
   - UI 触发 `POST /api/organizer/components/vaults`
   - 回执哈希：`0xvault-tx-3a57`
   - `organizer_components` 表新增记录，`status=confirmed`，`contract_address=0xVaUlt1975...`
3. **Deploy PriceSource**
   - `POST /api/organizer/components/price-sources`
   - 回执哈希：`0xprice-tx-91bc`
   - DB 记录确认，`component_type=price_source`
4. **Create contest**
   - `POST /api/contests/create` 请求体含 `contestId=0x74657374436f6e74657374...`
   - API 响应 `status=confirmed`
   - Contest Tx：`0xcontest-tx-64de`
   - VaultFactory Tx：`0xvaultfactory-tx-7721`
5. **Verification**
   - `contest_creation_requests`：`status=confirmed`，`transaction_hash=0xcontest-tx-64de`
   - `contest_deployment_artifacts`：
     - `contest_address=0xCont357...`
     - `vault_factory_address=0xFacc7...`
     - `metadata.transactions.initialize.transactionHash=0xcontest-tx-64de`
   - `cast code 0xCont357...` 与 `cast code 0xFacc7...` 返回非空字节码。

## Indexer Checkpoints

- 启动事件索引器 (`pnpm --filter @chaincontest/indexer-event start`)，观察日志，出现 `contestDeployment` 事件。
- `apps/indexer/event` 的 `ingestion_events` 表新增一条 `eventType=deployment` 记录，`tx_hash=0xcontest-tx-64de`。
- 重放 (`POST /internal/indexer/replay`) 后，`contest_creation_requests` 状态仍保持 `confirmed`。

## Notes

- 上述哈希与地址基于本地 Hardhat 回放示例；实际执行需替换为真实输出并附上 `psql` / `cast` 截图。
- 详细 DevTools 操作手册见 `specs/016-short-name-contract/quickstart.md`。
