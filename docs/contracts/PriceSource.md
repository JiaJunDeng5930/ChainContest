> ⚙️**自动生成文档**
> - 提交哈希：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
> - 生成时间 (UTC)：2025-10-10T13:34:22.954Z
> - 命令：pnpm --filter contracts docs:generate


# Solidity API

## PriceSource

### Snapshot

```solidity
struct Snapshot {
  int24 meanTick;
  uint160 sqrtPriceX96;
  uint256 priceE18;
  uint64 updatedAt;
}
```

### pool

```solidity
contract IUniswapV3Pool pool
```

返回当前引用的 Uniswap V3 价格池。

_配置后用于计算 TWAP 与价格偏离。_

### twapSeconds

```solidity
uint32 twapSeconds
```

获取 TWAP 计算窗口长度（秒）。

_更新价格时会根据该窗口读取双点快照。_

### snapshot

```solidity
struct PriceSource.Snapshot snapshot
```

返回最近一次价格快照。

_快照包含均值 Tick、平方根价格与 1e18 精度的价格。_

<a id="price-source-event-price-source-configured"></a>
### 事件 PriceSourceConfigured

```solidity
event PriceSourceConfigured(address pool, uint32 twapSeconds)
```

**事件说明：** 价格源配置更新时发出事件。

**补充信息：** 包含新的池地址与 TWAP 窗口。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| pool | address | 配置的 Uniswap V3 池地址。 |
| twapSeconds | uint32 | TWAP 窗口长度。 |

#### 示例
治理调整价格池后触发。

<a id="price-source-event-price-updated"></a>
### 事件 PriceUpdated

```solidity
event PriceUpdated(int24 meanTick, uint160 sqrtPriceX96, uint256 priceE18, uint64 updatedAt)
```

**事件说明：** 每次更新快照生成后的价格数据。

**补充信息：** 包含均值 Tick、平方根价格、1e18 价格与时间戳。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| meanTick | int24 | 平均 Tick 值。 |
| sqrtPriceX96 | uint160 | 平方根价格（96 位精度）。 |
| priceE18 | uint256 | 1e18 精度价格。 |
| updatedAt | uint64 | 快照生成时间。 |

#### 示例
Vault.swapExact 触发更新后监听本事件。

<a id="price-source-error-price-source-invalid-parameter"></a>
### 错误 PriceSourceInvalidParameter

```solidity
error PriceSourceInvalidParameter(string field)
```

**触发场景：** 输入参数不符合约束时抛出。

**开发说明：** 包含字段名，便于定位具体问题。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| field | string | 违规字段名称。 |

#### 示例
配置时传入过短的 TWAP 时间。

<a id="price-source-error-price-source-not-configured"></a>
### 错误 PriceSourceNotConfigured

```solidity
error PriceSourceNotConfigured()
```

**触发场景：** 尚未配置价格池时抛出。

**开发说明：** 在 update 或 requireWithinTolerance 中使用。

#### 示例
治理尚未设置池但 Vault 请求价格。

<a id="price-source-error-price-source-snapshot-stale"></a>
### 错误 PriceSourceSnapshotStale

```solidity
error PriceSourceSnapshotStale(uint64 updatedAt, uint64 currentTimestamp)
```

**触发场景：** 快照缺失或已过期时抛出。

**开发说明：** 返回上次更新时间与当前时间戳。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| updatedAt | uint64 | 快照时间戳。 |
| currentTimestamp | uint64 | 当前区块时间戳。 |

#### 示例
previewPriceImpact 在无快照时触发。

<a id="price-source-error-price-source-price-out-of-tolerance"></a>
### 错误 PriceSourcePriceOutOfTolerance

```solidity
error PriceSourcePriceOutOfTolerance(int32 priceImpactBps, uint16 toleranceBps)
```

**触发场景：** 价格偏离超出容忍阈值时抛出。

**开发说明：** 提供实际偏离与阈值，供调用方决策。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| priceImpactBps | int32 | 实际价格偏离基点。 |
| toleranceBps | uint16 | 允许的最大偏离基点。 |

#### 示例
Vault.swapExact 检测到超过容忍度的滑点。

<a id="price-source-function-constructor"></a>
### 函数 constructor

```solidity
constructor(address pool_, uint32 twapSeconds_) public
```

**功能概述：** 部署时可选地初始化价格池配置。

**开发说明：** 若提供有效参数，会立即写入配置并重置快照。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| pool_ | address | Uniswap V3 池地址，可为零表示稍后再配置。 |
| twapSeconds_ | uint32 | TWAP 窗口长度。 |

#### 可能抛出的错误
PriceSourceInvalidParameter TWAP 小于 600 秒。
PriceSourceInvalidParameter 池地址为空但需要配置。

#### 调用示例
治理部署后立即配置池与窗口。

<a id="price-source-function-configure"></a>
### 函数 configure

```solidity
function configure(address pool_, uint32 twapSeconds_) external
```

**功能概述：** 由所有者更新价格池与 TWAP 窗口。

**开发说明：** 会重置快照并触发 `PriceSourceConfigured` 事件。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| pool_ | address | 新的 Uniswap V3 池地址。 |
| twapSeconds_ | uint32 | 新的 TWAP 窗口长度。 |

#### 可能抛出的错误
PriceSourceInvalidParameter 池地址为空或窗口过短。

#### 调用示例
迁移到新的交易对后更新配置。

<a id="price-source-function-update"></a>
### 函数 update

```solidity
function update() public returns (struct PriceSource.Snapshot snap)
```

**功能概述：** 读取最新 TWAP 并刷新内部快照。

**开发说明：** 调用 Uniswap `observe` 获取均值 Tick，返回完整快照。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| snap | struct PriceSource.Snapshot | 最新价格快照。 |

#### 可能抛出的错误
PriceSourceNotConfigured 尚未配置池地址。
PriceSourceInvalidParameter TWAP 配置为 0。

#### 调用示例
Contest 结算前调用以获取链上最新价格。

<a id="price-source-function-get-twap-tick"></a>
### 函数 getTwapTick

```solidity
function getTwapTick() public returns (int24 meanTick)
```

**功能概述：** 返回最新快照的均值 Tick，并在必要时刷新。

**开发说明：** 直接调用 `update` 并提取 `meanTick` 字段。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| meanTick | int24 | 最新均值 Tick。 |

#### 可能抛出的错误
PriceSourceNotConfigured 尚未配置池地址。
PriceSourceInvalidParameter TWAP 配置为 0。

#### 调用示例
监控脚本定期读取 TWAP Tick。

<a id="price-source-function-last-snapshot"></a>
### 函数 lastSnapshot

```solidity
function lastSnapshot() external view returns (struct PriceSource.Snapshot snap)
```

**功能概述：** 返回最近一次缓存的价格快照。

**开发说明：** 若尚未通过 `update` 初始化，字段将为默认值。

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| snap | struct PriceSource.Snapshot | 最新快照。 |

#### 可能抛出的错误
无

#### 调用示例
前端在显示价格前先检查快照时间。

<a id="price-source-function-require-within-tolerance"></a>
### 函数 requireWithinTolerance

```solidity
function requireWithinTolerance(uint256 amountIn, uint256 amountOut, bool zeroForOne, uint16 toleranceBps) external returns (int32 priceImpactBps, uint256 priceE18)
```

**功能概述：** 校验给定成交价格是否在容忍度以内并返回偏离。

**开发说明：** 若缓存快照过期会自动刷新，再计算价格偏离并比较阈值。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amountIn | uint256 | 输入资产数量。 |
| amountOut | uint256 | 输出资产数量。 |
| zeroForOne | bool | 为真表示基础资产兑报价资产。 |
| toleranceBps | uint16 | 允许的最大价格偏离（基点）。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| priceImpactBps | int32 | 实际价格偏离（基点）。 |
| priceE18 | uint256 | 最新 1e18 精度的 TWAP 价格。 |

#### 可能抛出的错误
PriceSourcePriceOutOfTolerance 偏离超出容忍度。
PriceSourceNotConfigured 尚未配置价格池。
PriceSourceInvalidParameter TWAP 配置为 0。

#### 调用示例
Vault.swapExact 交易完成后调用验证滑点。

<a id="price-source-function-preview-price-impact"></a>
### 函数 previewPriceImpact

```solidity
function previewPriceImpact(uint256 amountIn, uint256 amountOut, bool zeroForOne) external view returns (int32 priceImpactBps)
```

**功能概述：** 基于当前快照预估一次交易的价格偏离值。

**开发说明：** 不刷新快照，适用于静态查询。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amountIn | uint256 | 输入资产数量。 |
| amountOut | uint256 | 输出资产数量。 |
| zeroForOne | bool | 方向标记，true 表示基础兑报价。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| priceImpactBps | int32 | 预估的价格偏离（基点）。 |

#### 可能抛出的错误
PriceSourceSnapshotStale 缓存快照为空或过期。

#### 调用示例
前端在签名交易前预览滑点。

<a id="price-source-function-configure"></a>
### 函数 _configure

```solidity
function _configure(address pool_, uint32 twapSeconds_) internal
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| pool_ | address |  |
| twapSeconds_ | uint32 |  |

<a id="price-source-function-price-impact"></a>
### 函数 _priceImpact

```solidity
function _priceImpact(uint256 amountIn, uint256 amountOut, bool zeroForOne, uint256 twapPriceE18) internal pure returns (int32)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| amountIn | uint256 |  |
| amountOut | uint256 |  |
| zeroForOne | bool |  |
| twapPriceE18 | uint256 |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | int32 |  |

<a id="price-source-function-is-stale"></a>
### 函数 _isStale

```solidity
function _isStale(uint64 updatedAt) internal view returns (bool)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| updatedAt | uint64 |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | bool |  |

<a id="price-source-function-abs"></a>
### 函数 _abs

```solidity
function _abs(int32 value) internal pure returns (uint32)
```

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| value | int32 |  |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| [0] | uint32 |  |
