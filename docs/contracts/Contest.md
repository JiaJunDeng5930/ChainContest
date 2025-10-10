> ⚙️**自动生成文档**
> - 提交哈希：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
> - 生成时间 (UTC)：2025-10-10T13:34:22.954Z
> - 命令：pnpm --filter contracts docs:generate


# Solidity API

## IVaultFactory

<a id="ivault-factory-function-deploy-vault"></a>
### 函数 deployVault

```solidity
function deployVault(address participant, uint256 entryAmount) external returns (address)
```

**功能概述：** 为参赛者部署与报名金额匹配的新 Vault 合约。

**开发说明：** 由 Contest 在注册阶段调用，部署后需要立即初始化并转入报名资金。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 参赛者地址，部署出的 Vault 将绑定该地址。 |
| entryAmount | uint256 | 参赛者应存入的基础资产金额，单位与赛事配置一致。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | address | vault 部署出的 Vault 合约地址。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.register 调用期间通过工厂部署 Vault。

<a id="ivault-factory-function-predict-vault-address"></a>
### 函数 predictVaultAddress

```solidity
function predictVaultAddress(address participant) external view returns (address)
```

**功能概述：** 预测给定参赛者对应 Vault 的地址，以便预估授权与监听。

**开发说明：** 实现需保持与 `deployVault` 相同的创建盐与初始化逻辑。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 参赛者地址。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | address | predictedVault 将要部署的 Vault 地址。 |

#### 可能抛出的错误
无

#### 调用示例
前端在报名前调用以确定 Vault allowance 目标。

## IVaultInitializer

<a id="ivault-initializer-function-initialize"></a>
### 函数 initialize

```solidity
function initialize(address owner, address contest, uint256 entryAmount) external
```

**功能概述：** 初始化刚部署的 Vault，使其与 Contest 关联。

**开发说明：** Contest 在转入报名资产后调用，Vault 需记录所有者与报名金额。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| owner | address | Vault 对应参赛者地址。 |
| contest | address | Contest 合约地址。 |
| entryAmount | uint256 | 参赛者报名金额。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.register 在完成资产转移后调用以初始化 Vault。

## IVault

<a id="ivault-function-base-asset"></a>
### 函数 baseAsset

```solidity
function baseAsset() external view returns (contract IERC20)
```

**功能概述：** 返回 Vault 当前持有的基础资产。

**开发说明：** Vault 构造函数确定资产类型，后续保持不变。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | contract IERC20 | asset 基础资产的 IERC20 接口。 |

#### 可能抛出的错误
无

#### 调用示例
Contest 结算前查询 Vault 持有的报名资产种类。

<a id="ivault-function-quote-asset"></a>
### 函数 quoteAsset

```solidity
function quoteAsset() external view returns (contract IERC20)
```

**功能概述：** 返回 Vault 当前使用的报价资产。

**开发说明：** 报价资产用于兑换与净值计算，应与比赛配置一致。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | contract IERC20 | asset 报价资产的 IERC20 接口。 |

#### 可能抛出的错误
无

#### 调用示例
Contest 在 settlement 时调用以同步持仓余额。

<a id="ivault-function-sync-balances"></a>
### 函数 syncBalances

```solidity
function syncBalances(uint256 baseBalance, uint256 quoteBalance) external
```

**功能概述：** 同步 Vault 记录的基础与报价资产余额。

**开发说明：** Contest 在结算前会传入链上实际余额以避免脏数据。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| baseBalance | uint256 | 最新基础资产余额，单位与 baseAsset 一致。 |
| quoteBalance | uint256 | 最新报价资产余额，单位与 quoteAsset 一致。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.settle 在读出 Token 余额后调用本函数。

<a id="ivault-function-finalize-settlement"></a>
### 函数 finalizeSettlement

```solidity
function finalizeSettlement(uint256 nav, int32 roiBps) external
```

**功能概述：** 结束 Vault 结算并写入净值与收益率。

**开发说明：** Contest 仅在冻结阶段调用，Vault 应拒绝重复结算。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| nav | uint256 | 折算后的净值金额，单位与基础资产一致。 |
| roiBps | int32 | 净值相对报名本金的收益率，单位为基点。 |

#### 可能抛出的错误
无

#### 调用示例
Contest 在结算完毕后调用 finalizeSettlement。

<a id="ivault-function-is-settled"></a>
### 函数 isSettled

```solidity
function isSettled() external view returns (bool)
```

**功能概述：** 查询 Vault 是否已结算。

**开发说明：** Contest 在执行后续排名或退出流程前调用。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | bool | settled 是否完成结算。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.exit 在允许退出前验证 Vault 状态。

<a id="ivault-function-base-balance"></a>
### 函数 baseBalance

```solidity
function baseBalance() external view returns (uint256)
```

**功能概述：** 返回 Vault 最近一次记录的基础资产余额。

**开发说明：** 余额由 Contest.syncBalances 或 swap 操作更新。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | uint256 | balance 基础资产数量。 |

#### 可能抛出的错误
无

#### 调用示例
Contest 在奖励发放前读取 baseBalance。

<a id="ivault-function-quote-balance"></a>
### 函数 quoteBalance

```solidity
function quoteBalance() external view returns (uint256)
```

**功能概述：** 返回 Vault 最近一次记录的报价资产余额。

**开发说明：** 余额由 Contest.syncBalances 或 swap 操作更新。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | uint256 | balance 报价资产数量。 |

#### 可能抛出的错误
无

#### 调用示例
Contest 在奖励发放前读取 quoteBalance。

<a id="ivault-function-withdraw"></a>
### 函数 withdraw

```solidity
function withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external
```

**功能概述：** 将 Vault 中的资产转出至指定地址。

**开发说明：** Contest 在退赛或领奖时调用，Vault 应完成转账并更新余额状态。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| recipient | address | 接收资产的钱包地址。 |
| baseAmount | uint256 | 要转出的基础资产数量。 |
| quoteAmount | uint256 | 要转出的报价资产数量。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.exit 调用 withdraw 将资产归还参赛者。

<a id="ivault-function-withdrawn"></a>
### 函数 withdrawn

```solidity
function withdrawn() external view returns (bool)
```

**功能概述：** 查询 Vault 的资产是否已全部提取。

**开发说明：** Contest 在发放奖励后调用以确认状态。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | bool | emptied 是否已无剩余资产。 |

#### 可能抛出的错误
无

#### 调用示例
Contest._claim 在发放奖励前确认 Vault 未被提空。

<a id="ivault-function-update-rank"></a>
### 函数 updateRank

```solidity
function updateRank(uint16 rank) external
```

**功能概述：** 更新 Vault 的最终排名，供奖励逻辑引用。

**开发说明：** Contest 在冻结阶段根据排行榜写入名次。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| rank | uint16 | 最新排名，1 为冠军，0 表示未入榜。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.updateLeaders 在刷新榜单时同步排名。

<a id="ivault-function-score"></a>
### 函数 score

```solidity
function score() external view returns (uint256 nav, int32 roiBps, uint16 rank)
```

**功能概述：** 返回 Vault 已记录的净值、收益率与排名。

**开发说明：** Contest.exit 与 _claim 用于校验参赛者资格。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| nav | uint256 | 最新净值金额。 |
| roiBps | int32 | 最新收益率（基点）。 |
| rank | uint16 | 最新排名。 |

#### 可能抛出的错误
无

#### 调用示例
Contest.exit 在判定奖励资格前调用 score。

## Contest

### ContestState

```solidity
enum ContestState {
  Uninitialized,
  Registering,
  Live,
  Frozen,
  Sealed,
  Closed
}
```

### ContestConfig

```solidity
struct ContestConfig {
  contract IERC20 entryAsset;
  uint256 entryAmount;
  address priceSource;
  address swapPool;
  uint16 priceToleranceBps;
  uint32 settlementWindow;
  uint16 maxParticipants;
  uint16 topK;
}
```

### ContestTimeline

```solidity
struct ContestTimeline {
  uint64 registeringEnds;
  uint64 liveEnds;
  uint64 claimEnds;
}
```

### InitializeParams

```solidity
struct InitializeParams {
  bytes32 contestId;
  struct Contest.ContestConfig config;
  struct Contest.ContestTimeline timeline;
  uint16[32] payoutSchedule;
  address vaultImplementation;
  address vaultFactory;
  address owner;
}
```

### contestId

```solidity
bytes32 contestId
```

### config

```solidity
struct Contest.ContestConfig config
```

### timeline

```solidity
struct Contest.ContestTimeline timeline
```

### state

```solidity
enum Contest.ContestState state
```

### vaultImplementation

```solidity
address vaultImplementation
```

### vaultFactory

```solidity
address vaultFactory
```

### sealedAt

```solidity
uint64 sealedAt
```

### prizePool

```solidity
uint256 prizePool
```

### participantVaults

```solidity
mapping(address => bytes32) participantVaults
```

### vaultOwners

```solidity
mapping(bytes32 => address) vaultOwners
```

### vaultIdsByAddress

```solidity
mapping(address => bytes32) vaultIdsByAddress
```

### vaultAddresses

```solidity
mapping(bytes32 => address) vaultAddresses
```

### participantCount

```solidity
uint256 participantCount
```

### payoutSchedule

```solidity
uint16[32] payoutSchedule
```

### frozenAt

```solidity
uint64 frozenAt
```

### settledCount

```solidity
uint256 settledCount
```

### leaderboardVersion

```solidity
uint32 leaderboardVersion
```

### totalPrizePool

```solidity
uint256 totalPrizePool
```

### vaultSettled

```solidity
mapping(bytes32 => bool) vaultSettled
```

### vaultNavs

```solidity
mapping(bytes32 => uint256) vaultNavs
```

### vaultRoiBps

```solidity
mapping(bytes32 => int32) vaultRoiBps
```

### rewardClaimed

```solidity
mapping(bytes32 => bool) rewardClaimed
```

### LeaderboardEntry

```solidity
struct LeaderboardEntry {
  bytes32 vaultId;
  uint256 nav;
  int32 roiBps;
  uint16 rank;
}
```

### LeaderboardUpdate

```solidity
struct LeaderboardUpdate {
  bytes32 vaultId;
  uint256 nav;
  int32 roiBps;
}
```

<a id="contest-event-contest-initialized"></a>
### 事件 ContestInitialized

```solidity
event ContestInitialized(bytes32 contestId, struct Contest.ContestConfig config, struct Contest.ContestTimeline timeline, uint16[32] payoutSchedule, address vaultImplementation, address priceSource)
```

**事件说明：** 记录比赛完成初始化后的完整配置。

**补充信息：** 供监听者确认参赛资产、时间线与 Vault 工厂是否与部署脚本一致。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛唯一标识符。 |
| config | struct Contest.ContestConfig | 报名所需资产、金额及外部依赖配置。 |
| timeline | struct Contest.ContestTimeline | 报名、实盘、领奖等时间边界。 |
| payoutSchedule | uint16[32] | 奖励分配表，各名次对应基点比例。 |
| vaultImplementation | address | Vault 实现合约地址。 |
| priceSource | address | 文档与结算所依赖的价格源地址。 |

#### 示例
部署者调用 `initialize` 后，前端订阅该事件更新 UI。

<a id="contest-event-contest-registered"></a>
### 事件 ContestRegistered

```solidity
event ContestRegistered(bytes32 contestId, address participant, address vault, uint256 amount)
```

**事件说明：** 参赛者成功报名并完成 Vault 部署时触发。

**补充信息：** 用于追踪参赛者与 Vault 的绑定关系及报名金额。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| participant | address | 参赛者地址。 |
| vault | address | 新部署的 Vault 地址。 |
| amount | uint256 | 本次报名转入的基础资产数量。 |

#### 示例
前端监听事件以在排行榜中新增参赛者。

<a id="contest-event-contest-registration-closed"></a>
### 事件 ContestRegistrationClosed

```solidity
event ContestRegistrationClosed(bytes32 contestId, uint64 registeringEnds)
```

**事件说明：** 报名阶段结束时广播截止时间。

**补充信息：** `syncState` 检测到报名截止后触发，确保前端停止报名入口。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| registeringEnds | uint64 | 报名截止时间戳（秒）。 |

#### 示例
后端服务监听事件以冻结报名 API。

<a id="contest-event-contest-live-started"></a>
### 事件 ContestLiveStarted

```solidity
event ContestLiveStarted(bytes32 contestId, uint64 liveEnds)
```

**事件说明：** 比赛进入实盘阶段时触发。

**补充信息：** 与报名闭合事件同区块发出，记录实盘阶段的结束时间。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| liveEnds | uint64 | 实盘阶段结束时间戳（秒）。 |

#### 示例
价格抓取服务启动时订阅该事件以确认撮合窗口。

<a id="contest-event-contest-frozen"></a>
### 事件 ContestFrozen

```solidity
event ContestFrozen(bytes32 contestId, uint64 frozenAt)
```

**事件说明：** 比赛被手动冻结时的时间点。

**补充信息：** 冻结后禁止进一步交易，等待结算。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| frozenAt | uint64 | 冻结时间戳（秒）。 |

#### 示例
当直播结束后运营调用 `freeze`，事件通知参赛者。

<a id="contest-event-vault-settled"></a>
### 事件 VaultSettled

```solidity
event VaultSettled(bytes32 vaultId, uint256 nav, int32 roiBps)
```

**事件说明：** 单个 Vault 完成结算时记录净值与收益率。

**补充信息：** 由 `settle` 在写入内部状态后发出，供排行榜与审计读取。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | Vault 唯一标识符。 |
| nav | uint256 | 折算后的净值金额。 |
| roiBps | int32 | 收益率（基点）。 |

#### 示例
结算服务按参赛者遍历调用 `settle` 并监听本事件。

<a id="contest-event-leaders-updated"></a>
### 事件 LeadersUpdated

```solidity
event LeadersUpdated(bytes32 contestId, bytes32[] vaultIds, uint32 heapVersion)
```

**事件说明：** 排行榜重算完成并写入新的排名。

**补充信息：** `_leaders` 会被替换为最新数组，同步记录版本号。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| vaultIds | bytes32[] | 新排行榜中的 Vault ID 列表。 |
| heapVersion | uint32 | 排行榜版本号，自增。 |

#### 示例
数据服务监听事件以刷新排行榜缓存。

<a id="contest-event-contest-sealed"></a>
### 事件 ContestSealed

```solidity
event ContestSealed(bytes32 contestId, uint64 sealedAt)
```

**事件说明：** 比赛进入密封阶段，进入领奖与退出流程。

**补充信息：** 所有 Vault 结算完成后才能调用。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| sealedAt | uint64 | 密封阶段开始的时间戳（秒）。 |

#### 示例
运营在确认结算完成后调用 `seal` 并监听事件。

<a id="contest-event-reward-claimed"></a>
### 事件 RewardClaimed

```solidity
event RewardClaimed(bytes32 contestId, bytes32 vaultId, uint256 amount)
```

**事件说明：** 参赛者领取奖金时记录发放金额。

**补充信息：** `_claim` 成功执行后发出，同时标记 Vault 已领奖。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| vaultId | bytes32 | 领奖对应的 Vault ID。 |
| amount | uint256 | 实际发放的基础资产金额。 |

#### 示例
领奖前端可根据事件更新参赛者余额。

<a id="contest-event-vault-exited"></a>
### 事件 VaultExited

```solidity
event VaultExited(bytes32 contestId, bytes32 vaultId, uint256 baseReturned, uint256 quoteReturned)
```

**事件说明：** 参赛者退出并取回 Vault 内剩余资产。

**补充信息：** 既可由领奖流程触发，也可在密封阶段主动退出。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contestId | bytes32 | 比赛标识符。 |
| vaultId | bytes32 | Vault ID。 |
| baseReturned | uint256 | 退回的基础资产数量。 |
| quoteReturned | uint256 | 退回的报价资产数量。 |

#### 示例
领奖完成后自动触发，或用户调用 `exit`。

<a id="contest-error-contest-already-initialized"></a>
### 错误 ContestAlreadyInitialized

```solidity
error ContestAlreadyInitialized()
```

**触发场景：** `initialize` 被重复调用时抛出。

**开发说明：** 一旦 `_initialized` 为真，任何后续初始化尝试都会 revert。

#### 示例
第二次部署脚本误调用 `initialize` 时触发。

<a id="contest-error-contest-invalid-param"></a>
### 错误 ContestInvalidParam

```solidity
error ContestInvalidParam(string field)
```

**触发场景：** 输入参数不满足业务约束时抛出。

**开发说明：** 包含字段名，便于诊断具体配置。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| field | string | 触发校验失败的字段标识。 |

#### 示例
报名金额为 0 时触发 `ContestInvalidParam("entryAmount")`。

<a id="contest-error-contest-invalid-state"></a>
### 错误 ContestInvalidState

```solidity
error ContestInvalidState(enum Contest.ContestState expected, enum Contest.ContestState actual)
```

**触发场景：** 当前比赛状态与预期不匹配时抛出。

**开发说明：** 用于限制函数在特定流水段执行。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| expected | enum Contest.ContestState | 调用方期望的状态。 |
| actual | enum Contest.ContestState | 合约当前状态。 |

#### 示例
在非冻结阶段调用 `settle` 会触发此错误。

<a id="contest-error-contest-unauthorized"></a>
### 错误 ContestUnauthorized

```solidity
error ContestUnauthorized(address account)
```

**触发场景：** 调用者没有执行对应动作的权限时抛出。

**开发说明：** 包含尝试操作的地址以便审计。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| account | address | 被拒绝的调用者地址。 |

#### 示例
非 Vault 所有者尝试更新排名时触发。

<a id="contest-error-contest-already-registered"></a>
### 错误 ContestAlreadyRegistered

```solidity
error ContestAlreadyRegistered(address participant)
```

**触发场景：** 参赛者重复报名时抛出。

**开发说明：** `register` 会检查是否已有 Vault 绑定。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 尝试重复报名的参赛者地址。 |

#### 示例
同一地址第二次调用 `register`。

<a id="contest-error-contest-max-participants-reached"></a>
### 错误 ContestMaxParticipantsReached

```solidity
error ContestMaxParticipantsReached(uint16 limit)
```

**触发场景：** 报名人数已达上限时抛出。

**开发说明：** 在注册阶段检查 `participantCount` 是否超过 `maxParticipants`。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| limit | uint16 | 最大允许参赛人数。 |

#### 示例
第 `limit + 1` 位参赛者报名时触发。

<a id="contest-error-contest-registration-closed-error"></a>
### 错误 ContestRegistrationClosedError

```solidity
error ContestRegistrationClosedError(uint64 deadline, uint64 currentTimestamp)
```

**触发场景：** 报名截止后仍尝试注册时抛出。

**开发说明：** 包含截止时间和当前时间，便于确认延迟原因。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| deadline | uint64 | 报名截止时间戳。 |
| currentTimestamp | uint64 | 当前区块时间戳。 |

#### 示例
报名窗口关闭后调用 `register`。

<a id="contest-error-contest-insufficient-stake"></a>
### 错误 ContestInsufficientStake

```solidity
error ContestInsufficientStake(uint256 balance, uint256 required)
```

**触发场景：** 参赛者余额不足以覆盖报名金额时抛出。

**开发说明：** 会在调用 `balanceOf` 后进行比较。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| balance | uint256 | 参赛者当前余额。 |
| required | uint256 | 报名所需余额。 |

#### 示例
报名资产余额小于配置值时触发。

<a id="contest-error-contest-insufficient-allowance"></a>
### 错误 ContestInsufficientAllowance

```solidity
error ContestInsufficientAllowance(uint256 allowance, uint256 required)
```

**触发场景：** 参赛者授权额度不足时抛出。

**开发说明：** 在调用 `allowance` 后发现小于报名金额。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| allowance | uint256 | 当前授权额度。 |
| required | uint256 | 需要的授权额度。 |

#### 示例
用户未提前授权或授权额度不够。

<a id="contest-error-contest-unknown-vault"></a>
### 错误 ContestUnknownVault

```solidity
error ContestUnknownVault(address vault)
```

**触发场景：** 传入的 Vault 地址不属于本比赛时抛出。

**开发说明：** 主要用于各种查询、奖励流程的校验。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vault | address | 未识别的 Vault 地址。 |

#### 示例
在 `_claim` 中根据 vaultId 找不到地址时触发。

<a id="contest-error-contest-freeze-too-early"></a>
### 错误 ContestFreezeTooEarly

```solidity
error ContestFreezeTooEarly(uint64 liveEnds, uint64 currentTimestamp)
```

**触发场景：** 比赛尚未到达冻结时间便尝试冻结时抛出。

**开发说明：** 附带理应结束的时间与当前时间。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| liveEnds | uint64 | 实盘阶段结束时间戳。 |
| currentTimestamp | uint64 | 当前区块时间戳。 |

#### 示例
运营提前调用 `freeze` 导致出错。

<a id="contest-error-contest-participant-unknown"></a>
### 错误 ContestParticipantUnknown

```solidity
error ContestParticipantUnknown(address participant)
```

**触发场景：** 根据地址或 Vault ID 未找到参赛者时抛出。

**开发说明：** 报名阶段之前或重复调用时常见。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 未登记的参赛者地址。 |

#### 示例
未报名的地址调用 `claim`。

<a id="contest-error-contest-settlement-pending"></a>
### 错误 ContestSettlementPending

```solidity
error ContestSettlementPending()
```

**触发场景：** 尚有 Vault 未结算时抛出。

**开发说明：** 防止在排名或密封阶段之前提前结束流程。

#### 示例
尝试更新排行榜但仍有 Vault 未结算。

<a id="contest-error-contest-reward-already-claimed"></a>
### 错误 ContestRewardAlreadyClaimed

```solidity
error ContestRewardAlreadyClaimed(bytes32 vaultId)
```

**触发场景：** Vault 已领取奖励后重复领取时抛出。

**开发说明：** `_claim` 与 `exit` 均会检查奖励状态。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | 已领奖的 Vault 标识。 |

#### 示例
已领取奖金的参赛者再次调用 `claim`。

<a id="contest-error-contest-not-eligible-for-reward"></a>
### 错误 ContestNotEligibleForReward

```solidity
error ContestNotEligibleForReward(bytes32 vaultId)
```

**触发场景：** Vault 不符合领取奖励或退出资格时抛出。

**开发说明：** 包括排名不在 `topK` 或奖励比例为 0 的情况。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | 不满足条件的 Vault 标识。 |

#### 示例
排名未上榜的参赛者调用 `claim`。

<a id="contest-error-contest-withdrawal-unavailable"></a>
### 错误 ContestWithdrawalUnavailable

```solidity
error ContestWithdrawalUnavailable(bytes32 vaultId)
```

**触发场景：** Vault 当前无法执行资产提取时抛出。

**开发说明：** 主要用于防止重复 withdraw。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | 被阻止的 Vault 标识。 |

#### 示例
Vault 资产已全部提取后再次调用 `exit`。

### onlyState

```solidity
modifier onlyState(enum Contest.ContestState expected)
```

### onlyVault

```solidity
modifier onlyVault(bytes32 vaultId)
```

<a id="contest-function-constructor"></a>
### 函数 constructor

```solidity
constructor() public
```

**功能概述：** 初始化比赛合约并预置未初始化状态。

**开发说明：** 部署者默认成为临时所有者，随后会在 `initialize` 中转移。

#### 可能抛出的错误
无

#### 调用示例
部署脚本在创建合约后立即调用 `initialize`。

<a id="contest-function-initialize"></a>
### 函数 initialize

```solidity
function initialize(struct Contest.InitializeParams params) external
```

**功能概述：** 配置比赛基础参数并开启报名阶段。

**开发说明：** 仅允许调用一次，完成后会将所有权交给提供的 `owner`。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| params | struct Contest.InitializeParams | 初始化所需的配置、时间线、奖金分配与依赖地址。 |

#### 可能抛出的错误
ContestAlreadyInitialized 重复初始化。
ContestInvalidParam 参数不符合约束或缺失。

#### 调用示例
部署流程完成后调用以设置报名资产、Vault 工厂与时间线。

<a id="contest-function-sync-state"></a>
### 函数 syncState

```solidity
function syncState() public
```

**功能概述：** 基于当前区块时间推进比赛状态。

**开发说明：** 超过报名截止后会自动切换至 `Live` 并触发相关事件。

#### 可能抛出的错误
无

#### 调用示例
前端轮询调用以确认比赛是否进入实盘阶段。

<a id="contest-function-freeze"></a>
### 函数 freeze

```solidity
function freeze() external
```

**功能概述：** 在实盘阶段结束后冻结比赛，阻止进一步交易。

**开发说明：** 调用前会先同步状态，需等待 `timeline.liveEnds` 之后。

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Live。
ContestFreezeTooEarly 当前仍在实盘窗口内。

#### 调用示例
运营在比赛结束后调用以进入结算模式。

<a id="contest-function-settle"></a>
### 函数 settle

```solidity
function settle(address participant) external returns (uint256 nav, int32 roiBps)
```

**功能概述：** 为指定参赛者触发 Vault 结算并返回净值与收益率。

**开发说明：** 仅在冻结阶段可用，会写入内部结算记录并触发事件。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 参赛者钱包地址。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| nav | uint256 | 最新净值金额，单位与报名资产一致。 |
| roiBps | int32 | 净值对应的收益率（基点）。 |

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Frozen。
ContestParticipantUnknown 未找到参赛者或 Vault。
ContestUnknownVault 结算时无法定位 Vault 地址。

#### 调用示例
结算服务遍历 `_participants` 调用以计算奖励。

<a id="contest-function-get-config"></a>
### 函数 getConfig

```solidity
function getConfig() external view returns (struct Contest.ContestConfig config_)
```

**功能概述：** 返回当前比赛的配置参数。

**开发说明：** 用于前端或 Vault 获取资产、工厂、价格源等信息。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| config_ | struct Contest.ContestConfig | 比赛配置对象。 |

#### 可能抛出的错误
无

#### 调用示例
Vault.swapExact 读取配置确认价格源与池地址。

<a id="contest-function-get-timeline"></a>
### 函数 getTimeline

```solidity
function getTimeline() external view returns (struct Contest.ContestTimeline timeline_)
```

**功能概述：** 返回比赛的关键时间节点。

**开发说明：** 供前端展示或 Vault 校验交易窗口使用。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| timeline_ | struct Contest.ContestTimeline | 包含报名、实盘、领奖截止的时间戳。 |

#### 可能抛出的错误
无

#### 调用示例
Vault.swapExact 在交易前确认仍处于 Live 窗口。

<a id="contest-function-get-vault-context"></a>
### 函数 getVaultContext

```solidity
function getVaultContext(address vault) external view returns (bytes32 vaultId, address owner)
```

**功能概述：** 查询 Vault 对应的 ID 与所有者。

**开发说明：** 会校验 Vault 是否属于本比赛。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vault | address | Vault 合约地址。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | 对应的参赛者 Vault 标识。 |
| owner | address | Vault 对应参赛者地址。 |

#### 可能抛出的错误
ContestUnknownVault 传入地址未注册。

#### 调用示例
Vault 在交换前调用用于权限校验。

<a id="contest-function-register"></a>
### 函数 register

```solidity
function register() external returns (bytes32 vaultId)
```

**功能概述：** 报名参赛并部署个人 Vault。

**开发说明：** 将报名资产从参赛者转移至新 Vault，并记录参与人数。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | 新分配的 Vault 标识符。 |

#### 可能抛出的错误
ContestInvalidState 当前不在 Registering 状态。
ContestRegistrationClosedError 报名已截止。
ContestAlreadyRegistered 参赛者已报名。
ContestMaxParticipantsReached 报名人数达到上限。
ContestInsufficientAllowance 授权额度不足。
ContestInsufficientStake 账户余额不足。

#### 调用示例
新参赛者批准资产后调用以加入比赛。

<a id="contest-function-update-leaders"></a>
### 函数 updateLeaders

```solidity
function updateLeaders(struct Contest.LeaderboardUpdate[] updates) external
```

**功能概述：** 写入最新排行榜并同步每个 Vault 的排名。

**开发说明：** 要求比赛已冻结且所有 Vault 结算完成，输入按净值降序。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| updates | struct Contest.LeaderboardUpdate[] | 结算服务计算后的排行榜条目列表。 |

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Frozen。
ContestSettlementPending 有 Vault 未结算。
ContestInvalidParam 更新参数不合法（长度、排序或数据不一致）。
ContestUnknownVault 排行榜条目的 Vault 未登记。

#### 调用示例
结算离线程序计算排序后调用以同步排名。

<a id="contest-function-get-leaders"></a>
### 函数 getLeaders

```solidity
function getLeaders() external view returns (struct Contest.LeaderboardEntry[] leaders_)
```

**功能概述：** 返回当前缓存的排行榜数据。

**开发说明：** 复制内部数组，供前端或分析工具读取。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| leaders_ | struct Contest.LeaderboardEntry[] | 排行榜条目列表。 |

#### 可能抛出的错误
无

#### 调用示例
前端界面调用以展示排行榜。

<a id="contest-function-seal"></a>
### 函数 seal

```solidity
function seal() external
```

**功能概述：** 在所有 Vault 结算完成后进入密封阶段。

**开发说明：** 成功后触发 `ContestSealed`，后续只允许领奖与退出。

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Frozen。
ContestSettlementPending 仍有 Vault 未结算。

#### 调用示例
运营确认全部结算后调用，开启领奖窗口。

<a id="contest-function-claim"></a>
### 函数 claim

```solidity
function claim() external returns (uint256 prizeAmount)
```

**功能概述：** 参赛者在密封阶段领取个人奖金。

**开发说明：** 内部调用 `_claim` 校验排名、奖励比例与 Vault 状态。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| prizeAmount | uint256 | 本次发放的基础资产金额。 |

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Sealed。
ContestInvalidParam 收款人地址无效。
ContestParticipantUnknown 未找到参赛者登记。
ContestSettlementPending Vault 尚未结算。
ContestRewardAlreadyClaimed Vault 已领奖。
ContestUnknownVault Vault 地址缺失。
ContestWithdrawalUnavailable Vault 已提空资产。
ContestNotEligibleForReward 排名不在奖励范围内。

#### 调用示例
冠军在密封阶段调用领取奖金。

<a id="contest-function-claim-for"></a>
### 函数 claimFor

```solidity
function claimFor(address participant) external returns (uint256 prizeAmount)
```

**功能概述：** 代理参赛者领取奖金并转账至其地址。

**开发说明：** 与 `claim` 共用校验逻辑，适用于托管或运营代领场景。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 被代理的参赛者地址。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| prizeAmount | uint256 | 本次发放的基础资产金额。 |

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Sealed。
ContestInvalidParam 收款人地址无效。
ContestParticipantUnknown 未找到参赛者登记。
ContestSettlementPending Vault 尚未结算。
ContestRewardAlreadyClaimed Vault 已领奖。
ContestUnknownVault Vault 地址缺失。
ContestWithdrawalUnavailable Vault 已提空资产。
ContestNotEligibleForReward 排名不在奖励范围内。

#### 调用示例
运营批量为获奖者领取奖金并发放。

<a id="contest-function-exit"></a>
### 函数 exit

```solidity
function exit() external
```

**功能概述：** 在密封阶段提取 Vault 余额以完成退出。

**开发说明：** 限制仅参赛者本人调用，且需 Vault 已结算且未领奖。

#### 可能抛出的错误
ContestInvalidState 当前状态不是 Sealed。
ContestParticipantUnknown 未登记参赛者。
ContestSettlementPending Vault 尚未结算。
ContestRewardAlreadyClaimed Vault 已领奖。
ContestUnknownVault Vault 地址缺失。
ContestWithdrawalUnavailable Vault 已提空资产。
ContestNotEligibleForReward 排名仍在奖励名次内。

#### 调用示例
未获奖参赛者在结果公示后退出并取回资产。

<a id="contest-function-participant-at"></a>
### 函数 participantAt

```solidity
function participantAt(uint256 index) external view returns (address participant)
```

**功能概述：** 根据索引返回参赛者地址。

**开发说明：** 为前端分页或离线处理提供便利。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| index | uint256 | 参赛者索引，从 0 开始。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 参赛者地址。 |

#### 可能抛出的错误
无

#### 调用示例
后台定期遍历参赛者并更新统计。

<a id="contest-function-participants-length"></a>
### 函数 participantsLength

```solidity
function participantsLength() external view returns (uint256 length)
```

**功能概述：** 获取当前参赛者总数。

**开发说明：** 与 `participantAt` 配合实现分页。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| length | uint256 | 参赛者数量。 |

#### 可能抛出的错误
无

#### 调用示例
前端根据该值限制分页末尾。

<a id="contest-function-compute-score"></a>
### 函数 _computeScore

```solidity
function _computeScore(contract IVault vault, uint256 baseBalanceActual, uint256 quoteBalanceActual) internal returns (uint256 nav, int32 roiBps)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vault | contract IVault |  |
| baseBalanceActual | uint256 |  |
| quoteBalanceActual | uint256 |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| nav | uint256 |  |
| roiBps | int32 |  |

<a id="contest-function-compute-roi"></a>
### 函数 _computeRoi

```solidity
function _computeRoi(uint256 nav) internal view returns (int32)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| nav | uint256 |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | int32 |  |

<a id="contest-function-scale-value"></a>
### 函数 _scaleValue

```solidity
function _scaleValue(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amount | uint256 |  |
| fromDecimals | uint8 |  |
| toDecimals | uint8 |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | uint256 |  |

<a id="contest-function-claim"></a>
### 函数 _claim

```solidity
function _claim(address participant, address recipient) internal returns (uint256 prizeShare)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address |  |
| recipient | address |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| prizeShare | uint256 |  |
