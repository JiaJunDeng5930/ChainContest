// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import {TickMath} from "../libraries/TickMath.sol";
import {FullMath} from "../libraries/FullMath.sol";

contract MockUniswapV3Pool {
    /// @notice 返回池子的第一个代币地址。
    /// @dev 用于测试时确认 Token 顺序。
    /// @custom:error 无
    /// @custom:example 在 swap 回调中读取 `token0()` 校验资产流向。
    address public token0;
    /// @notice 返回池子的第二个代币地址。
    /// @dev 与真实 Uniswap V3 池接口保持一致。
    /// @custom:error 无
    /// @custom:example 测试合约中使用 `token1()` 发送兑换结果。
    address public token1;
    /// @notice 当前模拟池的价格 Tick。
    /// @dev 可通过 `setTick` 更新，用于控制报价。
    /// @custom:error 无
    /// @custom:example 测试前设置 `tick` 以模拟不同价格区间。
    int24 public tick;

    /// @notice 构造函数初始化代币地址与初始 Tick。
    /// @dev 主要供测试上下文使用，不执行额外校验。
    /// @param token0_ Token0 地址。
    /// @param token1_ Token1 地址。
    /// @param tick_ 初始 Tick 值。
    /// @custom:error 无
    /// @custom:example `new MockUniswapV3Pool(tokenA, tokenB, 0)`。
    constructor(address token0_, address token1_, int24 tick_) {
        token0 = token0_;
        token1 = token1_;
        tick = tick_;
    }

    /// @notice 手动更新池子的 Tick 值。
    /// @dev 用于模拟价格波动。
    /// @param tick_ 新的 Tick。
    /// @custom:error 无
    /// @custom:example 测试中调用 `setTick(100)` 后再执行 `swap`。
    function setTick(int24 tick_) external {
        tick = tick_;
    }

    /// @notice 模拟 Uniswap V3 `observe` 接口，返回累积 Tick。
    /// @dev 按传入秒数与当前 tick 计算线性累积值，不包含实际流动性数据。
    /// @param secondsAgos 回溯时间数组，单位秒。
    /// @return tickCumulatives 每个时间点对应的累积 Tick。
    /// @return liquidity 空数组，占位符以匹配真实接口。
    /// @custom:error 无
    /// @custom:example `observe([60, 0])` 估算一分钟 TWAP。
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory)
    {
        uint256 length = secondsAgos.length;
        tickCumulatives = new int56[](length);
        for (uint256 i = 0; i < length; i++) {
            tickCumulatives[i] = int56(int256(tick) * int256(uint256(secondsAgos[i])));
        }
        uint160[] memory liquidity = new uint160[](length);
        return (tickCumulatives, liquidity);
    }

    /// @notice 返回池子的 Slot0 信息。
    /// @dev 仅填充基础字段，保证兼容真实接口。
    /// @return sqrtPriceX96 模拟价格的平方根表示。
    /// @return tick_ 当前 Tick。
    /// @return observationIndex 固定为 0。
    /// @return observationCardinality 固定为 0。
    /// @return observationCardinalityNext 固定为 0。
    /// @return feeProtocol 固定为 0。
    /// @return unlocked 永远返回 true。
    /// @custom:error 无
    /// @custom:example `vault.swapExact` 获取价格快照时调用。
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick_,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
        tick_ = tick;
        observationIndex = 0;
        observationCardinality = 0;
        observationCardinalityNext = 0;
        feeProtocol = 0;
        unlocked = true;
    }

    /// @notice 使用当前 Tick 模拟一次兑换，并触发回调。
    /// @dev 只支持正向 `amountSpecified`，根据方向计算对应输出。
    /// @param recipient 接收兑换输出的地址。
    /// @param zeroForOne 为真表示卖出 token0、买入 token1。
    /// @param amountSpecified 输入数量，必须为正。
    /// @param data 透传到回调的数据。
    /// @return amount0 兑换后 token0 的净变化。
    /// @return amount1 兑换后 token1 的净变化。
    /// @custom:error 无
    /// @custom:example Vault 测试中调用 `swap(participant, true, 1e18, 0, data)`。
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1)
    {
        if (amountSpecified <= 0) {
            revert("MockPool: amountSpecified must be positive");
        }

        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
        uint256 priceX128 = FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), 1 << 64);
        uint256 amountIn = uint256(amountSpecified);
        uint256 amountOut;

        int256 amount0Delta;
        int256 amount1Delta;

        if (zeroForOne) {
            amountOut = FullMath.mulDiv(amountIn, priceX128, 1 << 128);
            amount0Delta = int256(amountIn);
            amount1Delta = -int256(amountOut);
            _callback(amount0Delta, amount1Delta, data);
            IERC20(token1).transfer(recipient, amountOut);
            amount0 = -amount0Delta;
            amount1 = -amount1Delta;
        } else {
            amountOut = FullMath.mulDiv(amountIn, 1 << 128, priceX128);
            amount0Delta = -int256(amountOut);
            amount1Delta = int256(amountIn);
            _callback(amount0Delta, amount1Delta, data);
            IERC20(token0).transfer(recipient, amountOut);
            amount0 = -amount0Delta;
            amount1 = -amount1Delta;
        }
    }

    function _callback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) internal {
        IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0Delta, amount1Delta, data);
    }
}
