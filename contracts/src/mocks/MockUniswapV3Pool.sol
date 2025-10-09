// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import {TickMath} from "../libraries/TickMath.sol";
import {FullMath} from "../libraries/FullMath.sol";

contract MockUniswapV3Pool {
    address public token0;
    address public token1;
    int24 public tick;

    constructor(address token0_, address token1_, int24 tick_) {
        token0 = token0_;
        token1 = token1_;
        tick = tick_;
    }

    function setTick(int24 tick_) external {
        tick = tick_;
    }

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
