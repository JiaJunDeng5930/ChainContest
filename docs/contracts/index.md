> ⚙️**自动生成文档**
> - 提交哈希：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
> - 生成时间 (UTC)：2025-10-10T13:34:22.954Z
> - 命令：pnpm --filter contracts docs:generate


# 合约接口文档索引

- **提交哈希**：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
- **生成时间 (UTC)**：2025-10-10T13:34:22.954Z
- **总合约数**：11

## Contest · 合约


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 17 |
| 事件 | 10 |
| 错误 | 16 |

### 函数
- [constructor](Contest.md#contest-function-constructor)：初始化比赛合约并预置未初始化状态。
- [initialize](Contest.md#contest-function-initialize)：配置比赛基础参数并开启报名阶段。
- [syncState](Contest.md#contest-function-sync-state)：基于当前区块时间推进比赛状态。
- [freeze](Contest.md#contest-function-freeze)：在实盘阶段结束后冻结比赛，阻止进一步交易。
- [settle](Contest.md#contest-function-settle)：为指定参赛者触发 Vault 结算并返回净值与收益率。
- [getConfig](Contest.md#contest-function-get-config)：返回当前比赛的配置参数。
- [getTimeline](Contest.md#contest-function-get-timeline)：返回比赛的关键时间节点。
- [getVaultContext](Contest.md#contest-function-get-vault-context)：查询 Vault 对应的 ID 与所有者。
- [register](Contest.md#contest-function-register)：报名参赛并部署个人 Vault。
- [updateLeaders](Contest.md#contest-function-update-leaders)：写入最新排行榜并同步每个 Vault 的排名。
- [getLeaders](Contest.md#contest-function-get-leaders)：返回当前缓存的排行榜数据。
- [seal](Contest.md#contest-function-seal)：在所有 Vault 结算完成后进入密封阶段。
- [claim](Contest.md#contest-function-claim)：参赛者在密封阶段领取个人奖金。
- [claimFor](Contest.md#contest-function-claim-for)：代理参赛者领取奖金并转账至其地址。
- [exit](Contest.md#contest-function-exit)：在密封阶段提取 Vault 余额以完成退出。
- [participantAt](Contest.md#contest-function-participant-at)：根据索引返回参赛者地址。
- [participantsLength](Contest.md#contest-function-participants-length)：获取当前参赛者总数。

### 事件
- [ContestInitialized](Contest.md#contest-event-contest-initialized)：记录比赛完成初始化后的完整配置。
- [ContestRegistered](Contest.md#contest-event-contest-registered)：参赛者成功报名并完成 Vault 部署时触发。
- [ContestRegistrationClosed](Contest.md#contest-event-contest-registration-closed)：报名阶段结束时广播截止时间。
- [ContestLiveStarted](Contest.md#contest-event-contest-live-started)：比赛进入实盘阶段时触发。
- [ContestFrozen](Contest.md#contest-event-contest-frozen)：比赛被手动冻结时的时间点。
- [VaultSettled](Contest.md#contest-event-vault-settled)：单个 Vault 完成结算时记录净值与收益率。
- [LeadersUpdated](Contest.md#contest-event-leaders-updated)：排行榜重算完成并写入新的排名。
- [ContestSealed](Contest.md#contest-event-contest-sealed)：比赛进入密封阶段，进入领奖与退出流程。
- [RewardClaimed](Contest.md#contest-event-reward-claimed)：参赛者领取奖金时记录发放金额。
- [VaultExited](Contest.md#contest-event-vault-exited)：参赛者退出并取回 Vault 内剩余资产。

### 错误
- [ContestAlreadyInitialized](Contest.md#contest-error-contest-already-initialized)：&#x60;initialize&#x60; 被重复调用时抛出。
- [ContestInvalidParam](Contest.md#contest-error-contest-invalid-param)：输入参数不满足业务约束时抛出。
- [ContestInvalidState](Contest.md#contest-error-contest-invalid-state)：当前比赛状态与预期不匹配时抛出。
- [ContestUnauthorized](Contest.md#contest-error-contest-unauthorized)：调用者没有执行对应动作的权限时抛出。
- [ContestAlreadyRegistered](Contest.md#contest-error-contest-already-registered)：参赛者重复报名时抛出。
- [ContestMaxParticipantsReached](Contest.md#contest-error-contest-max-participants-reached)：报名人数已达上限时抛出。
- [ContestRegistrationClosedError](Contest.md#contest-error-contest-registration-closed-error)：报名截止后仍尝试注册时抛出。
- [ContestInsufficientStake](Contest.md#contest-error-contest-insufficient-stake)：参赛者余额不足以覆盖报名金额时抛出。
- [ContestInsufficientAllowance](Contest.md#contest-error-contest-insufficient-allowance)：参赛者授权额度不足时抛出。
- [ContestUnknownVault](Contest.md#contest-error-contest-unknown-vault)：传入的 Vault 地址不属于本比赛时抛出。
- [ContestFreezeTooEarly](Contest.md#contest-error-contest-freeze-too-early)：比赛尚未到达冻结时间便尝试冻结时抛出。
- [ContestParticipantUnknown](Contest.md#contest-error-contest-participant-unknown)：根据地址或 Vault ID 未找到参赛者时抛出。
- [ContestSettlementPending](Contest.md#contest-error-contest-settlement-pending)：尚有 Vault 未结算时抛出。
- [ContestRewardAlreadyClaimed](Contest.md#contest-error-contest-reward-already-claimed)：Vault 已领取奖励后重复领取时抛出。
- [ContestNotEligibleForReward](Contest.md#contest-error-contest-not-eligible-for-reward)：Vault 不符合领取奖励或退出资格时抛出。
- [ContestWithdrawalUnavailable](Contest.md#contest-error-contest-withdrawal-unavailable)：Vault 当前无法执行资产提取时抛出。

---

## FullMath · 库

> Facilitates multiplication and division that can have overflow of an intermediate value without any loss of
precision

| 分类 | 数量 |
| ---- | ---- |
| 函数 | 0 |
| 事件 | 0 |
| 错误 | 0 |




---

## IContestMinimal · 接口


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 4 |
| 事件 | 0 |
| 错误 | 0 |

### 函数
- [state](Vault.md#icontest-minimal-function-state)：返回 Contest 当前状态枚举值。
- [getTimeline](Vault.md#icontest-minimal-function-get-timeline)：获取比赛的时间线配置。
- [getConfig](Vault.md#icontest-minimal-function-get-config)：获取比赛配置，包括资产与价格源信息。
- [getVaultContext](Vault.md#icontest-minimal-function-get-vault-context)：查询 Vault 在比赛中的上下文信息。



---

## IVault · 接口


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 11 |
| 事件 | 0 |
| 错误 | 0 |

### 函数
- [baseAsset](Contest.md#ivault-function-base-asset)：返回 Vault 当前持有的基础资产。
- [quoteAsset](Contest.md#ivault-function-quote-asset)：返回 Vault 当前使用的报价资产。
- [syncBalances](Contest.md#ivault-function-sync-balances)：同步 Vault 记录的基础与报价资产余额。
- [finalizeSettlement](Contest.md#ivault-function-finalize-settlement)：结束 Vault 结算并写入净值与收益率。
- [isSettled](Contest.md#ivault-function-is-settled)：查询 Vault 是否已结算。
- [baseBalance](Contest.md#ivault-function-base-balance)：返回 Vault 最近一次记录的基础资产余额。
- [quoteBalance](Contest.md#ivault-function-quote-balance)：返回 Vault 最近一次记录的报价资产余额。
- [withdraw](Contest.md#ivault-function-withdraw)：将 Vault 中的资产转出至指定地址。
- [withdrawn](Contest.md#ivault-function-withdrawn)：查询 Vault 的资产是否已全部提取。
- [updateRank](Contest.md#ivault-function-update-rank)：更新 Vault 的最终排名，供奖励逻辑引用。
- [score](Contest.md#ivault-function-score)：返回 Vault 已记录的净值、收益率与排名。



---

## IVaultFactory · 接口


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 2 |
| 事件 | 0 |
| 错误 | 0 |

### 函数
- [deployVault](Contest.md#ivault-factory-function-deploy-vault)：为参赛者部署与报名金额匹配的新 Vault 合约。
- [predictVaultAddress](Contest.md#ivault-factory-function-predict-vault-address)：预测给定参赛者对应 Vault 的地址，以便预估授权与监听。



---

## IVaultInitializer · 接口


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 1 |
| 事件 | 0 |
| 错误 | 0 |

### 函数
- [initialize](VaultFactory.md#ivault-initializer-function-initialize)：初始化新部署的 Vault 并绑定 Contest。



---

## IVaultInitializer · 接口


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 1 |
| 事件 | 0 |
| 错误 | 0 |

### 函数
- [initialize](Contest.md#ivault-initializer-function-initialize)：初始化刚部署的 Vault，使其与 Contest 关联。



---

## PriceSource · 合约


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 7 |
| 事件 | 2 |
| 错误 | 4 |

### 函数
- [constructor](PriceSource.md#price-source-function-constructor)：部署时可选地初始化价格池配置。
- [configure](PriceSource.md#price-source-function-configure)：由所有者更新价格池与 TWAP 窗口。
- [update](PriceSource.md#price-source-function-update)：读取最新 TWAP 并刷新内部快照。
- [getTwapTick](PriceSource.md#price-source-function-get-twap-tick)：返回最新快照的均值 Tick，并在必要时刷新。
- [lastSnapshot](PriceSource.md#price-source-function-last-snapshot)：返回最近一次缓存的价格快照。
- [requireWithinTolerance](PriceSource.md#price-source-function-require-within-tolerance)：校验给定成交价格是否在容忍度以内并返回偏离。
- [previewPriceImpact](PriceSource.md#price-source-function-preview-price-impact)：基于当前快照预估一次交易的价格偏离值。

### 事件
- [PriceSourceConfigured](PriceSource.md#price-source-event-price-source-configured)：价格源配置更新时发出事件。
- [PriceUpdated](PriceSource.md#price-source-event-price-updated)：每次更新快照生成后的价格数据。

### 错误
- [PriceSourceInvalidParameter](PriceSource.md#price-source-error-price-source-invalid-parameter)：输入参数不符合约束时抛出。
- [PriceSourceNotConfigured](PriceSource.md#price-source-error-price-source-not-configured)：尚未配置价格池时抛出。
- [PriceSourceSnapshotStale](PriceSource.md#price-source-error-price-source-snapshot-stale)：快照缺失或已过期时抛出。
- [PriceSourcePriceOutOfTolerance](PriceSource.md#price-source-error-price-source-price-out-of-tolerance)：价格偏离超出容忍阈值时抛出。

---

## TickMath · 库

> Computes sqrt price for ticks of size 1.0001, i.e. sqrt(1.0001^tick) as fixed point Q64.96 numbers. Supports
prices between 2**-128 and 2**128

| 分类 | 数量 |
| ---- | ---- |
| 函数 | 0 |
| 事件 | 0 |
| 错误 | 0 |




---

## Vault · 合约


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 10 |
| 事件 | 4 |
| 错误 | 9 |

### 函数
- [constructor](Vault.md#vault-function-constructor)：创建 Vault 并固定基础、报价资产类型。
- [initialize](Vault.md#vault-function-initialize)：完成 Vault 初始化，绑定参赛者与 Contest。
- [pause](Vault.md#vault-function-pause)：暂停 Vault，阻止参赛者继续兑换。
- [unpause](Vault.md#vault-function-unpause)：取消暂停状态，恢复交易能力。
- [syncBalances](Vault.md#vault-function-sync-balances)：将 Vault 内部余额同步为 Contest 观察到的实际值。
- [finalizeSettlement](Vault.md#vault-function-finalize-settlement)：写入结算净值与收益率并锁定 Vault。
- [updateRank](Vault.md#vault-function-update-rank)：更新 Vault 在排行榜中的排名。
- [withdraw](Vault.md#vault-function-withdraw)：从 Vault 转出资产至指定地址。
- [swapExact](Vault.md#vault-function-swap-exact)：在 Uniswap V3 池中执行兑换，更新 Vault 资产结构。
- [uniswapV3SwapCallback](Vault.md#vault-function-uniswap-v3-swap-callback)：Uniswap V3 回调函数，支付兑换所需的输入资产。

### 事件
- [VaultInitialized](Vault.md#vault-event-vault-initialized)：Vault 完成初始化并绑定参赛者时触发。
- [VaultSwapped](Vault.md#vault-event-vault-swapped)：Vault 完成一次兑换交易并更新余额。
- [VaultSettled](Vault.md#vault-event-vault-settled)：Contest 写入结算结果时触发。
- [VaultWithdrawn](Vault.md#vault-event-vault-withdrawn)：Vault 资产被 Contest 提取至参赛者时触发。

### 错误
- [VaultAlreadyInitialized](Vault.md#vault-error-vault-already-initialized)：Vault 已完成初始化时拒绝再次初始化。
- [VaultUnauthorized](Vault.md#vault-error-vault-unauthorized)：调用者不具备所需权限时抛出。
- [VaultInvalidParameter](Vault.md#vault-error-vault-invalid-parameter)：输入参数不符合业务规则时抛出。
- [VaultWithdrawForbidden](Vault.md#vault-error-vault-withdraw-forbidden)：Vault 已执行过 withdraw，禁止重复提取。
- [VaultSwapInvalidState](Vault.md#vault-error-vault-swap-invalid-state)：当前比赛状态不允许执行 swap。
- [VaultSwapExpired](Vault.md#vault-error-vault-swap-expired)：swap 请求超过指定截止时间。
- [VaultSwapInsufficientOutput](Vault.md#vault-error-vault-swap-insufficient-output)：实际获得的输出金额低于用户设定的最小值。
- [VaultUnknownPool](Vault.md#vault-error-vault-unknown-pool)：指定的交易池与预期资产不匹配。
- [VaultAlreadySettled](Vault.md#vault-error-vault-already-settled)：Contest 试图重复写入结算结果。

---

## VaultFactory · 合约


| 分类 | 数量 |
| ---- | ---- |
| 函数 | 5 |
| 事件 | 3 |
| 错误 | 5 |

### 函数
- [constructor](VaultFactory.md#vault-factory-function-constructor)：部署工厂并设置初始 Vault 实现与 Contest。
- [setImplementation](VaultFactory.md#vault-factory-function-set-implementation)：更新工厂使用的 Vault 实现地址。
- [setContest](VaultFactory.md#vault-factory-function-set-contest)：更新被授权部署 Vault 的 Contest 地址。
- [predictVaultAddress](VaultFactory.md#vault-factory-function-predict-vault-address)：根据参赛者地址预测未来部署的 Vault 地址。
- [deployVault](VaultFactory.md#vault-factory-function-deploy-vault)：克隆新的 Vault 并广播部署信息。

### 事件
- [VaultImplementationUpdated](VaultFactory.md#vault-factory-event-vault-implementation-updated)：Vault 实现地址更新时广播旧值与新值。
- [ContestAddressUpdated](VaultFactory.md#vault-factory-event-contest-address-updated)：Contest 地址变更时广播。
- [VaultDeployed](VaultFactory.md#vault-factory-event-vault-deployed)：记录新 Vault 部署情况与报名金额。

### 错误
- [VaultFactoryInvalidImplementation](VaultFactory.md#vault-factory-error-vault-factory-invalid-implementation)：工厂实现地址无效时抛出。
- [VaultFactoryInvalidContest](VaultFactory.md#vault-factory-error-vault-factory-invalid-contest)：Contest 地址无效时抛出。
- [VaultFactoryInvalidParticipant](VaultFactory.md#vault-factory-error-vault-factory-invalid-participant)：参赛者地址无效时抛出。
- [VaultFactoryInvalidEntryAmount](VaultFactory.md#vault-factory-error-vault-factory-invalid-entry-amount)：报名金额无效时抛出。
- [VaultFactoryUnauthorized](VaultFactory.md#vault-factory-error-vault-factory-unauthorized)：非 Contest 地址尝试部署 Vault 时抛出。

---
