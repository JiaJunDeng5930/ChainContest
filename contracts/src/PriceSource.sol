// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TickMath} from "./libraries/TickMath.sol";
import {FullMath} from "./libraries/FullMath.sol";

contract PriceSource is Ownable2Step {
    struct Snapshot {
        int24 meanTick;
        uint160 sqrtPriceX96;
        uint256 priceE18;
        uint64 updatedAt;
    }

    IUniswapV3Pool public pool;
    uint32 public twapSeconds;
    Snapshot public snapshot;

    event PriceSourceConfigured(address indexed pool, uint32 twapSeconds);
    event PriceUpdated(int24 meanTick, uint160 sqrtPriceX96, uint256 priceE18, uint64 updatedAt);

    error PriceSourceInvalidParameter(string field);
    error PriceSourceNotConfigured();
    error PriceSourceSnapshotStale(uint64 updatedAt, uint64 currentTimestamp);
    error PriceSourcePriceOutOfTolerance(int32 priceImpactBps, uint16 toleranceBps);

    constructor(address pool_, uint32 twapSeconds_) Ownable(msg.sender) {
        if (pool_ != address(0)) {
            _configure(pool_, twapSeconds_);
        }
    }

    function configure(address pool_, uint32 twapSeconds_) external onlyOwner {
        _configure(pool_, twapSeconds_);
    }

    function update() public returns (Snapshot memory snap) {
        if (address(pool) == address(0)) {
            revert PriceSourceNotConfigured();
        }

        uint32 window = twapSeconds;
        if (window == 0) {
            revert PriceSourceInvalidParameter("twapSeconds");
        }

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = window;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgos);
        int56 tickDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 meanTick = int24(tickDelta / int56(uint56(window)));
        if (tickDelta < 0 && tickDelta % int56(uint56(window)) != 0) {
            meanTick -= 1;
        }

        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(meanTick);
        uint256 priceX128 = FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), 1 << 64);
        uint256 priceE18 = FullMath.mulDiv(priceX128, 1e18, 1 << 128);

        snap = Snapshot({
            meanTick: meanTick,
            sqrtPriceX96: sqrtPriceX96,
            priceE18: priceE18,
            updatedAt: uint64(block.timestamp)
        });

        snapshot = snap;
        emit PriceUpdated(meanTick, sqrtPriceX96, priceE18, snap.updatedAt);
    }

    function getTwapTick() public returns (int24 meanTick) {
        Snapshot memory snap = update();
        return snap.meanTick;
    }

    function lastSnapshot() external view returns (Snapshot memory) {
        return snapshot;
    }

    function requireWithinTolerance(
        uint256 amountIn,
        uint256 amountOut,
        bool zeroForOne,
        uint16 toleranceBps
    ) external returns (int32 priceImpactBps, uint256 priceE18) {
        Snapshot memory snap = snapshot;
        if (snap.updatedAt == 0 || _isStale(snap.updatedAt)) {
            snap = update();
        }

        priceImpactBps = _priceImpact(amountIn, amountOut, zeroForOne, snap.priceE18);
        uint32 deviation = _abs(priceImpactBps);
        if (deviation > toleranceBps) {
            revert PriceSourcePriceOutOfTolerance(priceImpactBps, toleranceBps);
        }
        priceE18 = snap.priceE18;
    }

    function previewPriceImpact(
        uint256 amountIn,
        uint256 amountOut,
        bool zeroForOne
    ) external view returns (int32 priceImpactBps) {
        Snapshot memory snap = snapshot;
        if (snap.updatedAt == 0) {
            revert PriceSourceSnapshotStale(0, uint64(block.timestamp));
        }
        priceImpactBps = _priceImpact(amountIn, amountOut, zeroForOne, snap.priceE18);
    }

    function _configure(address pool_, uint32 twapSeconds_) internal {
        if (pool_ == address(0)) {
            revert PriceSourceInvalidParameter("pool");
        }
        if (twapSeconds_ < 600) {
            revert PriceSourceInvalidParameter("twapSeconds");
        }
        pool = IUniswapV3Pool(pool_);
        twapSeconds = twapSeconds_;
        snapshot = Snapshot({meanTick: 0, sqrtPriceX96: 0, priceE18: 0, updatedAt: 0});
        emit PriceSourceConfigured(pool_, twapSeconds_);
    }

    function _priceImpact(
        uint256 amountIn,
        uint256 amountOut,
        bool zeroForOne,
        uint256 twapPriceE18
    ) internal pure returns (int32) {
        if (amountIn == 0 || amountOut == 0) {
            return 0;
        }

        uint256 actualPriceE18;
        if (zeroForOne) {
            actualPriceE18 = FullMath.mulDiv(amountOut, 1e18, amountIn);
        } else {
            actualPriceE18 = FullMath.mulDiv(amountIn, 1e18, amountOut);
        }

        if (actualPriceE18 == twapPriceE18) {
            return 0;
        }

        int256 diff = int256(actualPriceE18) - int256(twapPriceE18);
        int256 impact = (diff * int256(uint256(10_000))) / int256(twapPriceE18);
        if (impact > type(int32).max) {
            return type(int32).max;
        }
        if (impact < type(int32).min) {
            return type(int32).min;
        }
        return int32(impact);
    }

    function _isStale(uint64 updatedAt) internal view returns (bool) {
        return updatedAt == 0 || block.timestamp - updatedAt >= twapSeconds;
    }

    function _abs(int32 value) internal pure returns (uint32) {
        if (value >= 0) {
            return uint32(value);
        }
        if (value == type(int32).min) {
            return uint32(uint64(uint32(type(int32).max)) + 1);
        }
        return uint32(-value);
    }
}
