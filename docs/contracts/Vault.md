> ⚙️**自动生成文档**
> - 提交哈希：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
> - 生成时间 (UTC)：2025-10-10T13:34:22.954Z
> - 命令：pnpm --filter contracts docs:generate


# Solidity API

## IContestMinimal

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

<a id="icontest-minimal-function-state"></a>
### 函数 state

```solidity
function state() external view returns (enum IContestMinimal.ContestState)
```

**功能概述：** 返回 Contest 当前状态枚举值。

**开发说明：** Vault 在 swap 和结算过程中使用，用于限制行为窗口。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | enum IContestMinimal.ContestState | state_ 当前比赛状态。 |

#### 可能抛出的错误
无

#### 调用示例
Vault.swapExact 在交易前检查状态是否为 Live。

<a id="icontest-minimal-function-get-timeline"></a>
### 函数 getTimeline

```solidity
function getTimeline() external view returns (struct IContestMinimal.ContestTimeline)
```

**功能概述：** 获取比赛的时间线配置。

**开发说明：** Vault 根据时间戳判断交易与结算窗口。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | struct IContestMinimal.ContestTimeline | timeline 含报名、实盘、领奖截止的时间戳。 |

#### 可能抛出的错误
无

#### 调用示例
Vault.swapExact 用于校验实盘期未结束。

<a id="icontest-minimal-function-get-config"></a>
### 函数 getConfig

```solidity
function getConfig() external view returns (struct IContestMinimal.ContestConfig)
```

**功能概述：** 获取比赛配置，包括资产与价格源信息。

**开发说明：** Vault 需要读取价格源、交易池与容忍度。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | struct IContestMinimal.ContestConfig | config 比赛配置结构体。 |

#### 可能抛出的错误
无

#### 调用示例
Vault.swapExact 根据配置检验 swapPool。

<a id="icontest-minimal-function-get-vault-context"></a>
### 函数 getVaultContext

```solidity
function getVaultContext(address vault) external view returns (bytes32 vaultId, address owner)
```

**功能概述：** 查询 Vault 在比赛中的上下文信息。

**开发说明：** 返回 Vault ID 与所有者地址以进行权限判断。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vault | address | Vault 合约地址。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | Vault 唯一标识符。 |
| owner | address | Vault 所有者地址。 |

#### 可能抛出的错误
ContestUnknownVault 传入地址非本比赛。

#### 调用示例
Vault.swapExact 调用以确保自身仍受 Contest 管理。

## Vault

### Score

```solidity
struct Score {
  uint256 nav;
  int32 roiBps;
  uint16 rank;
}
```

### baseAsset

```solidity
contract IERC20 baseAsset
```

返回 Vault 绑定的基础资产合约。

_由构造函数确定，后续不可修改。_

### quoteAsset

```solidity
contract IERC20 quoteAsset
```

返回 Vault 使用的报价资产合约。

_用于计算净值与价格保护。_

### contest

```solidity
address contest
```

Vault 当前绑定的 Contest 地址。

_初始化后指向负责治理的比赛合约。_

### owner

```solidity
address owner
```

返回 Vault 所属参赛者地址。

_初始化后保持不变。_

### baseBalance

```solidity
uint256 baseBalance
```

Vault 最近同步的基础资产余额。

_由 Contest 调用 `syncBalances` 或 swap 更新。_

### quoteBalance

```solidity
uint256 quoteBalance
```

Vault 最近同步的报价资产余额。

_与 `baseBalance` 同步以供结算。_

### lastSettleBlock

```solidity
uint256 lastSettleBlock
```

最近一次结算时的区块高度。

_主要用于追踪结算频率。_

### isSettled

```solidity
bool isSettled
```

标记 Vault 是否已完成结算。

_Contest 调用 `finalizeSettlement` 后设置为 true。_

### withdrawn

```solidity
bool withdrawn
```

表示 Vault 是否已完全提取资产。

_当基础与报价资产余额均为零时设为 true。_

### score

```solidity
struct Vault.Score score
```

返回 Vault 最近一次的净值、收益率与排名。

_由结算与 `updateRank` 更新，用于领奖资格判断。_

<a id="vault-event-vault-initialized"></a>
### 事件 VaultInitialized

```solidity
event VaultInitialized(address contest, address owner, uint256 entryAmount)
```

**事件说明：** Vault 完成初始化并绑定参赛者时触发。

**补充信息：** 记录 Contest 地址、所有者与起始报名金额。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contest | address | Contest 合约地址。 |
| owner | address | Vault 所有者（参赛者）。 |
| entryAmount | uint256 | 报名转入的基础资产数量。 |

#### 示例
Contest.register 在将资产转入后调用 `initialize`。

<a id="vault-event-vault-swapped"></a>
### 事件 VaultSwapped

```solidity
event VaultSwapped(address contest, address participant, address pool, contract IERC20 tokenIn, contract IERC20 tokenOut, uint256 amountIn, uint256 amountOut, uint256 twap, int32 priceImpactBps)
```

**事件说明：** Vault 完成一次兑换交易并更新余额。

**补充信息：** 记录撮合池、代币方向、成交数量、TWAP 价格与价格冲击。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contest | address | Contest 合约地址。 |
| participant | address | Vault 所有者地址。 |
| pool | address | 使用的 Uniswap V3 池地址。 |
| tokenIn | contract IERC20 | 输入代币。 |
| tokenOut | contract IERC20 | 输出代币。 |
| amountIn | uint256 | 实际支出数量。 |
| amountOut | uint256 | 实际获得数量。 |
| twap | uint256 | 交易时价格源提供的 TWAP（1e18 精度）。 |
| priceImpactBps | int32 | 价格偏离的基点数。 |

#### 示例
参赛者执行调仓后，监听器记录交易细节。

<a id="vault-event-vault-settled"></a>
### 事件 VaultSettled

```solidity
event VaultSettled(address contest, uint256 nav, int32 roiBps, uint16 rank)
```

**事件说明：** Contest 写入结算结果时触发。

**补充信息：** 记录净值、收益率与排名（初始为 0，随后由 Contest 更新）。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contest | address | Contest 合约地址。 |
| nav | uint256 | 结算后的净值金额。 |
| roiBps | int32 | 收益率（基点）。 |
| rank | uint16 | 初始排名，默认为 0。 |

#### 示例
Contest.settle 调用 `finalizeSettlement` 后触发。

<a id="vault-event-vault-withdrawn"></a>
### 事件 VaultWithdrawn

```solidity
event VaultWithdrawn(address contest, address participant, uint256 baseAmount, uint256 quoteAmount)
```

**事件说明：** Vault 资产被 Contest 提取至参赛者时触发。

**补充信息：** 记录提取金额以便审计与资金对账。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| contest | address | Contest 合约地址。 |
| participant | address | Vault 所有者地址。 |
| baseAmount | uint256 | 提取的基础资产数量。 |
| quoteAmount | uint256 | 提取的报价资产数量。 |

#### 示例
领奖或退出流程完成时触发。

<a id="vault-error-vault-already-initialized"></a>
### 错误 VaultAlreadyInitialized

```solidity
error VaultAlreadyInitialized()
```

**触发场景：** Vault 已完成初始化时拒绝再次初始化。

**开发说明：** `_initialized` 标志位防止重复绑定。

#### 示例
Contest 再次调用 `initialize` 将触发。

<a id="vault-error-vault-unauthorized"></a>
### 错误 VaultUnauthorized

```solidity
error VaultUnauthorized(address account)
```

**触发场景：** 调用者不具备所需权限时抛出。

**开发说明：** 同时适用于 Contest 与所有者权限校验。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| account | address | 未授权的调用方地址。 |

#### 示例
非所有者尝试调用 `swapExact`。

<a id="vault-error-vault-invalid-parameter"></a>
### 错误 VaultInvalidParameter

```solidity
error VaultInvalidParameter(string field)
```

**触发场景：** 输入参数不符合业务规则时抛出。

**开发说明：** 使用字段名帮助排查错误。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| field | string | 触发错误的参数标识。 |

#### 示例
初始化时 Vault 余额与报名金额不符。

<a id="vault-error-vault-withdraw-forbidden"></a>
### 错误 VaultWithdrawForbidden

```solidity
error VaultWithdrawForbidden()
```

**触发场景：** Vault 已执行过 withdraw，禁止重复提取。

**开发说明：** 防止重复转移导致资产流失。

#### 示例
Contest 在领奖后再次调用 `withdraw`。

<a id="vault-error-vault-swap-invalid-state"></a>
### 错误 VaultSwapInvalidState

```solidity
error VaultSwapInvalidState(uint8 state)
```

**触发场景：** 当前比赛状态不允许执行 swap。

**开发说明：** 将状态编码为 `uint8` 以节省 gas。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| state | uint8 | 实际检测到的状态。 |

#### 示例
比赛冻结后仍尝试调用 `swapExact`。

<a id="vault-error-vault-swap-expired"></a>
### 错误 VaultSwapExpired

```solidity
error VaultSwapExpired(uint256 deadline, uint256 current)
```

**触发场景：** swap 请求超过指定截止时间。

**开发说明：** 保护参赛者免受撮合延迟影响。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| deadline | uint256 | 请求指定的过期时间戳。 |
| current | uint256 | 当前区块时间戳。 |

#### 示例
前端长时间未确认导致交易超时。

<a id="vault-error-vault-swap-insufficient-output"></a>
### 错误 VaultSwapInsufficientOutput

```solidity
error VaultSwapInsufficientOutput(uint256 amountOut, uint256 minAmountOut)
```

**触发场景：** 实际获得的输出金额低于用户设定的最小值。

**开发说明：** 避免在滑点过大时继续执行。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amountOut | uint256 | 合约计算得到的输出数量。 |
| minAmountOut | uint256 | 用户期望的最小输出。 |

#### 示例
市场波动导致兑换结果过低。

<a id="vault-error-vault-unknown-pool"></a>
### 错误 VaultUnknownPool

```solidity
error VaultUnknownPool(address pool)
```

**触发场景：** 指定的交易池与预期资产不匹配。

**开发说明：** 防止对接错误或被替换的池。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| pool | address | 调用者指定的池地址。 |

#### 示例
Contest 配置的池资产顺序与 Vault 不符。

<a id="vault-error-vault-already-settled"></a>
### 错误 VaultAlreadySettled

```solidity
error VaultAlreadySettled()
```

**触发场景：** Contest 试图重复写入结算结果。

**开发说明：** `finalizeSettlement` 仅允许执行一次。

#### 示例
Contest 在已结算情况下重复调用。

### SwapCallbackData

```solidity
struct SwapCallbackData {
  address pool;
  contract IERC20 token0;
  contract IERC20 token1;
}
```

### onlyContest

```solidity
modifier onlyContest()
```

### onlyOwnerOrContest

```solidity
modifier onlyOwnerOrContest()
```

<a id="vault-function-constructor"></a>
### 函数 constructor

```solidity
constructor(contract IERC20 baseAsset_, contract IERC20 quoteAsset_) public
```

**功能概述：** 创建 Vault 并固定基础、报价资产类型。

**开发说明：** 资产地址不可为零，否则视为配置错误。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| baseAsset_ | contract IERC20 | 比赛报名资产。 |
| quoteAsset_ | contract IERC20 | 兑换时参考的报价资产。 |

#### 可能抛出的错误
VaultInvalidParameter 基础或报价资产地址为空。

#### 调用示例
工厂部署 Vault 时传入 Contest 指定的资产。

<a id="vault-function-initialize"></a>
### 函数 initialize

```solidity
function initialize(address owner_, address contest_, uint256 entryAmount) external
```

**功能概述：** 完成 Vault 初始化，绑定参赛者与 Contest。

**开发说明：** 仅允许 Contest 调用一次，并检查初始资产余额。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| owner_ | address | 参赛者地址。 |
| contest_ | address | Contest 合约地址。 |
| entryAmount | uint256 | 报名金额，需与 Vault 余额一致。 |

#### 可能抛出的错误
VaultAlreadyInitialized Vault 已初始化。
VaultUnauthorized 调用方不是 Contest。
VaultInvalidParameter 所有者、Contest、金额或余额不合法。

#### 调用示例
Contest.register 转入报名资金后调用。

<a id="vault-function-pause"></a>
### 函数 pause

```solidity
function pause() external
```

**功能概述：** 暂停 Vault，阻止参赛者继续兑换。

**开发说明：** 仅允许 Contest 触发，用于应急措施。

#### 可能抛出的错误
VaultUnauthorized 调用者不是 Contest。

#### 调用示例
Contest 在冻结阶段暂停 Vault。

<a id="vault-function-unpause"></a>
### 函数 unpause

```solidity
function unpause() external
```

**功能概述：** 取消暂停状态，恢复交易能力。

**开发说明：** 应与治理流程或 Contest 状态联动使用。

#### 可能抛出的错误
VaultUnauthorized 调用者不是 Contest。

#### 调用示例
比赛状态恢复 Live 时重新开放 Vault。

<a id="vault-function-sync-balances"></a>
### 函数 syncBalances

```solidity
function syncBalances(uint256 baseBalance_, uint256 quoteBalance_) external
```

**功能概述：** 将 Vault 内部余额同步为 Contest 观察到的实际值。

**开发说明：** Contest 在结算前调用以防止缓存与链上余额不一致。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| baseBalance_ | uint256 | 最新基础资产余额。 |
| quoteBalance_ | uint256 | 最新报价资产余额。 |

#### 可能抛出的错误
VaultUnauthorized 调用者不是 Contest。

#### 调用示例
Contest.settle 读取 Token 余额后调用。

<a id="vault-function-finalize-settlement"></a>
### 函数 finalizeSettlement

```solidity
function finalizeSettlement(uint256 nav, int32 roiBps) external
```

**功能概述：** 写入结算净值与收益率并锁定 Vault。

**开发说明：** 仅允许执行一次，随后会触发 `VaultSettled` 事件。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| nav | uint256 | 结算净值金额。 |
| roiBps | int32 | 收益率（基点）。 |

#### 可能抛出的错误
VaultUnauthorized 调用者不是 Contest。
VaultAlreadySettled 已经写入过结算结果。

#### 调用示例
Contest.settle 完成净值计算后调用。

<a id="vault-function-update-rank"></a>
### 函数 updateRank

```solidity
function updateRank(uint16 rank) external
```

**功能概述：** 更新 Vault 在排行榜中的排名。

**开发说明：** Contest 在调用 `updateLeaders` 时同步写入。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| rank | uint16 | 最新排名，1 表示冠军。 |

#### 可能抛出的错误
VaultUnauthorized 调用者不是 Contest。

#### 调用示例
Contest.updateLeaders 在排序后调用。

<a id="vault-function-withdraw"></a>
### 函数 withdraw

```solidity
function withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external
```

**功能概述：** 从 Vault 转出资产至指定地址。

**开发说明：** Contest 在领奖或退出时调用，确保余额充足后更新记录。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| recipient | address | 接收资产的钱包地址。 |
| baseAmount | uint256 | 要转出的基础资产数量。 |
| quoteAmount | uint256 | 要转出的报价资产数量。 |

#### 可能抛出的错误
VaultUnauthorized 调用者不是 Contest。
VaultWithdrawForbidden 资产已被全部提取。
VaultInvalidParameter 收款人地址为空或请求金额超过余额。

#### 调用示例
Contest._claim 在发放奖金后调用本函数。

<a id="vault-function-swap-exact"></a>
### 函数 swapExact

```solidity
function swapExact(uint256 amountIn, uint256 minAmountOut, bool swapBaseForQuote, uint256 deadline) external returns (uint256 amountOut, int32 priceImpactBps)
```

**功能概述：** 在 Uniswap V3 池中执行兑换，更新 Vault 资产结构。

**开发说明：** 仅所有者在实盘阶段可调用，校验价格容忍度并记录成交详情。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amountIn | uint256 | 输入资产数量。 |
| minAmountOut | uint256 | 希望至少获得的输出数量。 |
| swapBaseForQuote | bool | 为真表示卖出基础资产换取报价资产。 |
| deadline | uint256 | 交易有效期截止时间戳（秒）。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amountOut | uint256 | 实际获得的输出数量。 |
| priceImpactBps | int32 | 价格偏离的基点数。 |

#### 可能抛出的错误
VaultInvalidParameter Vault 未初始化或参数无效。
VaultUnauthorized 调用者不是所有者。
VaultSwapExpired 当前时间超过截止时间。
VaultSwapInvalidState 比赛不在 Live 阶段。
VaultInvalidParameter PriceSource 或 swapPool 配置为空。
VaultUnknownPool 交易池与资产不匹配。
VaultInvalidParameter amountIn 超过 Vault 余额。
VaultSwapInsufficientOutput 实际输出低于最小值。

#### 调用示例
参赛者在比赛进行中调整仓位。

<a id="vault-function-uniswap-v3-swap-callback"></a>
### 函数 uniswapV3SwapCallback

```solidity
function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes data) external
```

**功能概述：** Uniswap V3 回调函数，支付兑换所需的输入资产。

**开发说明：** 仅允许来自预期池的回调，使用 SafeERC20 转账。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amount0Delta | int256 | 需要支付的 token0 金额，正数表示 Vault 需转出。 |
| amount1Delta | int256 | 需要支付的 token1 金额。 |
| data | bytes | 交换时编码的池与代币信息。 |

#### 可能抛出的错误
VaultUnauthorized 回调来源不是预期池。

#### 调用示例
Uniswap 在执行 swapExact 时调用本函数。
