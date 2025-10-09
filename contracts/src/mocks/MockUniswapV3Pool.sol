// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

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
}
