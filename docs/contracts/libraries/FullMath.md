> ⚙️**自动生成文档**
> - 提交哈希：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
> - 生成时间 (UTC)：2025-10-10T13:34:22.954Z
> - 命令：pnpm --filter contracts docs:generate


# Solidity API

## FullMath

Facilitates multiplication and division that can have overflow of an intermediate value without any loss of
precision

<a id="full-math-function-mul-div"></a>
### 函数 mulDiv

```solidity
function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result)
```

**功能概述：** Calculates floor(a×b÷denominator) with full precision. Throws if result overflows a uint256 or denominator == 0

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| a | uint256 | The multiplicand |
| b | uint256 | The multiplier |
| denominator | uint256 | The divisor |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| result | uint256 | The 256-bit result |
