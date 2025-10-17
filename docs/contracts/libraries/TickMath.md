> ⚙️**自动生成文档**
> - 提交哈希：fb3275b1e01e32fcb30583864d9ec4ae6f43610f
> - 生成时间 (UTC)：2025-10-17T14:10:17.127Z
> - 命令：pnpm --filter contracts docs:generate


# Solidity API

## TickMath

Computes sqrt price for ticks of size 1.0001, i.e. sqrt(1.0001^tick) as fixed point Q64.96 numbers. Supports
prices between 2**-128 and 2**128

### MIN_TICK

```solidity
int24 MIN_TICK
```

_The minimum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**-128_

### MAX_TICK

```solidity
int24 MAX_TICK
```

_The maximum tick that may be passed to #getSqrtRatioAtTick computed from log base 1.0001 of 2**128_

### MIN_SQRT_RATIO

```solidity
uint160 MIN_SQRT_RATIO
```

_The minimum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MIN_TICK)_

### MAX_SQRT_RATIO

```solidity
uint160 MAX_SQRT_RATIO
```

_The maximum value that can be returned from #getSqrtRatioAtTick. Equivalent to getSqrtRatioAtTick(MAX_TICK)_

<a id="tick-math-function-get-sqrt-ratio-at-tick"></a>
### 函数 getSqrtRatioAtTick

```solidity
function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96)
```

**功能概述：** Calculates sqrt(1.0001^tick) * 2^96

**开发说明：** Throws if |tick| > max tick

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| tick | int24 | The input tick for the above formula |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| sqrtPriceX96 | uint160 | A Fixed point Q64.96 number representing the sqrt of the ratio of the two assets (token1/token0) at the given tick |

<a id="tick-math-function-get-tick-at-sqrt-ratio"></a>
### 函数 getTickAtSqrtRatio

```solidity
function getTickAtSqrtRatio(uint160 sqrtPriceX96) internal pure returns (int24 tick)
```

**功能概述：** Calculates the greatest tick value such that getRatioAtTick(tick) <= ratio

**开发说明：** Throws in case sqrtPriceX96 < MIN_SQRT_RATIO, as MIN_SQRT_RATIO is the lowest value getRatioAtTick may
ever return.

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| sqrtPriceX96 | uint160 | The sqrt ratio for which to compute the tick as a Q64.96 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| tick | int24 | The greatest tick for which the ratio is less than or equal to the input ratio |
