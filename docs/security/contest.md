# Contest 安全审计清单

## 1. 生命周期与关键假设
- [ ] **报名前**：`Contest.initialize` 完成参数写入并确认 `payoutSchedule` 总和为 10,000 bp，`vaultFactory` 与 `vaultImplementation` 地址已完成审计。
- [ ] **报名阶段**：仅开放白名单报名入口，监控 `ContestRegistered` 事件与 Vault USDC 余额一致性。
- [ ] **实盘阶段**：禁止人工触发 `settle`/`updateLeaders`，仅允许 `Vault.swapExact` 在 `Live` 状态执行；出现异常立即触发 `freeze`。
- [ ] **冻结阶段**：所有 `settle` 操作均写入 `VaultSettled` 事件并保留回执，核对 prize pool 余额未被动用。
- [ ] **封榜阶段**：仅授权机器人/多签可调用 `updateLeaders`，输入列表需为 NAV 降序且长度 ≤ `topK`。

## 2. 故障降级流程
- [ ] **价格源异常**：出现 `PriceSourcePriceOutOfTolerance` 等错误时立即执行 `freeze`，并在多次 TWAP 失败后通过 `PriceSource.configure` 切换备用池。
- [ ] **Swap 异常**：检测到池余额异常或重入迹象时，管理员调用 `freeze` 并确认所有 Vault `swapExact` 入口停用。
- [ ] **结算失败**：`settle` revert 后记录原因，待价格源恢复后逐一重试，禁止跳过未结算参赛者直接封榜。
- [ ] **合约漏洞**：发现潜在漏洞时立即 `freeze`，经多签批准后执行 `transferOwnership` 将 Contest 权限移交应急管理员。

## 3. 事件重放与账本校验
- [ ] 按顺序重放事件：`ContestInitialized` → `ContestRegistered` → `VaultSwapped` → `ContestFrozen` → `VaultSettled` → `LeadersUpdated` → `ContestSealed` → `RewardClaimed` / `VaultExited`。
- [ ] 基于 `VaultSwapped` 事件重建每个 Vault 的 base/quote 余额，并与 `Vault.syncBalances` 最终值对账。
- [ ] 使用 `updateLeaders` 输入与 `VaultSettled` NAV 生成期望 Top-K 列表，对比 `getLeaders()` 与 `LeadersUpdated` 事件顺序。
- [ ] 计算 `totalPrizePool` × `payoutSchedule` 的理论派发量，扣除 `RewardClaimed` 金额后确认 `contest.prizePool()` 归零。

## 4. 权限移交与恢复
- [ ] **部署后**：在报名开始前执行 `transferOwnership(<多签地址>)`，避免部署者保留控制权。
- [ ] **日常运营**：冻结、结算、封榜等管理动作均由受控多签签批，并保留签名记录。
- [ ] **赛季结束**：确认 `settledCount == participantCount` 且 `prizePool == 0` 后，调用 `transferOwnership(0x000...0)` 放弃权限。
- [ ] **应急恢复**：计划更新 PriceSource/Vault 模板时先 `freeze`，待 Vault 全部退出后再执行 `setImplementation` 或新部署 Contest。

> 所有步骤需在操作日志中记录交易哈希、执行人、时间戳以及复核人签字，确保可追溯性。
