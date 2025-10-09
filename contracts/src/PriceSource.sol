// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract PriceSource is Ownable2Step {
    struct Snapshot {
        int24 meanTick;
        uint64 updatedAt;
    }

    IUniswapV3Pool public pool;
    uint32 public twapSeconds;
    Snapshot public snapshot;

    event PriceSourceConfigured(address indexed pool, uint32 twapSeconds);
    event PriceUpdated(int24 meanTick, uint64 updatedAt);

    error PriceSourceInvalidParameter(string field);
    error PriceSourceNotConfigured();

    constructor(address pool_, uint32 twapSeconds_) Ownable(msg.sender) {
        if (pool_ != address(0)) {
            _configure(pool_, twapSeconds_);
        }
    }

    function configure(address pool_, uint32 twapSeconds_) external onlyOwner {
        _configure(pool_, twapSeconds_);
    }

    function getTwapTick() public returns (int24 meanTick) {
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
        meanTick = int24(tickDelta / int56(uint56(window)));
        if (tickDelta < 0 && tickDelta % int56(uint56(window)) != 0) {
            meanTick -= 1;
        }

        snapshot = Snapshot({meanTick: meanTick, updatedAt: uint64(block.timestamp)});
        emit PriceUpdated(meanTick, uint64(block.timestamp));
    }

    function lastSnapshot() external view returns (Snapshot memory) {
        return snapshot;
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
        snapshot = Snapshot({meanTick: 0, updatedAt: 0});
        emit PriceSourceConfigured(pool_, twapSeconds_);
    }
}
