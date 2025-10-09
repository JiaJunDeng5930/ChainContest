# Contest 安全审计清单

## 1. 生命周期与关键假设
- **报名前**：`Contest.initialize` 完成参数写入并确认 `payoutSchedule` 总和为 10,000 bp；`vaultFactory` 与 `vaultImplementation` 地址需经过审计。
- **报名阶段**：仅白名单报名入口开放；监控 `ContestRegistered` 事件与 USDC 余额一致性。
- **实盘阶段**：禁止手动调用 `settle`/`updateLeaders`；仅允许 `Vault.swapExact` 在 `Live` 状态执行，异常时应立即触发 `freeze`。
- **冻结阶段**：所有 `settle` 操作必须记录 `VaultSettled`，保留交易回执以备重放；确认 prize pool 未被消耗。
- **封榜阶段**：`updateLeaders` 仅允许管理员/自动化机器人调用，输入需按 NAV 降序，长度 ≤ `topK`。

## 2. 故障降级流程
1. **价格源异常**：
   - 观察到 `PriceSourcePriceOutOfTolerance` 等错误 → 使用管理员面板 `冻结比赛`。
   - 多次读取 TWAP 失败时执行 `PriceSource.configure`，必要时切换备用池。
2. **Swap 异常**：
   - 出现池余额异常或重入风险 → 管理员调用 `freeze`，确认所有 Vault `swapExact` 入口都已停止。
3. **结算失败**：
   - `settle` revert 时需记录 revert 原因，待价格源恢复后重新执行；禁止跳过未结算参赛者直接封榜。
4. **合约漏洞**：
   - 立即触发 `freeze`，并在多签通过后调用 `transferOwnership` 将 Contest 权限移交给应急管理员。

## 3. 事件重放与账本校验
- 拉取事件顺序：`ContestInitialized` → `ContestRegistered` → `VaultSwapped` → `ContestFrozen` → `VaultSettled` → `LeadersUpdated` → `ContestSealed` → `RewardClaimed` / `VaultExited`。
- 通过 `VaultSwapped` 重建每个 Vault 的 base/quote 余额并对比 `Vault.syncBalances` 最终值。
- 校验排行榜：
  1. 取 `updateLeaders` 输入及 `VaultSettled` NAV，按降序生成期望 Top-K 列表。
  2. 对比 `getLeaders()` 与事件 `LeadersUpdated` 中的 vaultId 顺序。
- 复核奖池：
  - 使用 `totalPrizePool` × `payoutSchedule` 计算理论派发量，减去 `RewardClaimed` 实际金额，确认 `contest.prizePool()` 为 0。

## 4. 权限移交与恢复
1. **部署后**：
   - `Contest` 默认持有者为部署者，应在报名开始前执行 `transferOwnership(<多签地址>)`。
2. **日常运营**：
   - 所有管理员操作（冻结、结算、封榜）需由受控多签执行，并保留签名指令。
3. **赛季结束**：
   - 验证 `settledCount == participantCount` 且 `prizePool == 0`，再调用 `transferOwnership(0x000...0)` 放弃权限。
4. **应急恢复**：
   - 若需更新 PriceSource/Vault 模板，先 `freeze`，待所有 Vault 退出后执行 `setImplementation` 或部署新 Contest。

> 所有步骤需在操作日志中记录交易哈希、执行人、时间戳以及复核人签字，确保可追溯性。
