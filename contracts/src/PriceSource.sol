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

    /// @notice 返回当前引用的 Uniswap V3 价格池。
    /// @dev 配置后用于计算 TWAP 与价格偏离。
    /// @custom:error 无
    /// @custom:example Vault 在 swap 前确认价格源配置。
    IUniswapV3Pool public pool;
    /// @notice 获取 TWAP 计算窗口长度（秒）。
    /// @dev 更新价格时会根据该窗口读取双点快照。
    /// @custom:error 无
    /// @custom:example 治理配置 900 秒平滑价格曲线。
    uint32 public twapSeconds;
    /// @notice 返回最近一次价格快照。
    /// @dev 快照包含均值 Tick、平方根价格与 1e18 精度的价格。
    /// @custom:error 无
    /// @custom:example Contest 结算前读取最新价格。
    Snapshot public snapshot;

    /// @notice 价格源配置更新时发出事件。
    /// @dev 包含新的池地址与 TWAP 窗口。
    /// @param pool 配置的 Uniswap V3 池地址。
    /// @param twapSeconds TWAP 窗口长度。
    /// @custom:example 治理调整价格池后触发。
    event PriceSourceConfigured(address indexed pool, uint32 twapSeconds);
    /// @notice 每次更新快照生成后的价格数据。
    /// @dev 包含均值 Tick、平方根价格、1e18 价格与时间戳。
    /// @param meanTick 平均 Tick 值。
    /// @param sqrtPriceX96 平方根价格（96 位精度）。
    /// @param priceE18 1e18 精度价格。
    /// @param updatedAt 快照生成时间。
    /// @custom:example Vault.swapExact 触发更新后监听本事件。
    event PriceUpdated(int24 meanTick, uint160 sqrtPriceX96, uint256 priceE18, uint64 updatedAt);

    /// @notice 输入参数不符合约束时抛出。
    /// @dev 包含字段名，便于定位具体问题。
    /// @param field 违规字段名称。
    /// @custom:example 配置时传入过短的 TWAP 时间。
    error PriceSourceInvalidParameter(string field);
    /// @notice 尚未配置价格池时抛出。
    /// @dev 在 update 或 requireWithinTolerance 中使用。
    /// @custom:example 治理尚未设置池但 Vault 请求价格。
    error PriceSourceNotConfigured();
    /// @notice 快照缺失或已过期时抛出。
    /// @dev 返回上次更新时间与当前时间戳。
    /// @param updatedAt 快照时间戳。
    /// @param currentTimestamp 当前区块时间戳。
    /// @custom:example previewPriceImpact 在无快照时触发。
    error PriceSourceSnapshotStale(uint64 updatedAt, uint64 currentTimestamp);
    /// @notice 价格偏离超出容忍阈值时抛出。
    /// @dev 提供实际偏离与阈值，供调用方决策。
    /// @param priceImpactBps 实际价格偏离基点。
    /// @param toleranceBps 允许的最大偏离基点。
    /// @custom:example Vault.swapExact 检测到超过容忍度的滑点。
    error PriceSourcePriceOutOfTolerance(int32 priceImpactBps, uint16 toleranceBps);

    /// @notice 部署时可选地初始化价格池配置。
    /// @dev 若提供有效参数，会立即写入配置并重置快照。
    /// @param pool_ Uniswap V3 池地址，可为零表示稍后再配置。
    /// @param twapSeconds_ TWAP 窗口长度。
    /// @custom:error PriceSourceInvalidParameter TWAP 小于 600 秒。
    /// @custom:error PriceSourceInvalidParameter 池地址为空但需要配置。
    /// @custom:example 治理部署后立即配置池与窗口。
    constructor(address pool_, uint32 twapSeconds_) Ownable(msg.sender) {
        if (pool_ != address(0)) {
            _configure(pool_, twapSeconds_);
        }
    }

    /// @notice 由所有者更新价格池与 TWAP 窗口。
    /// @dev 会重置快照并触发 `PriceSourceConfigured` 事件。
    /// @param pool_ 新的 Uniswap V3 池地址。
    /// @param twapSeconds_ 新的 TWAP 窗口长度。
    /// @custom:error PriceSourceInvalidParameter 池地址为空或窗口过短。
    /// @custom:example 迁移到新的交易对后更新配置。
    function configure(address pool_, uint32 twapSeconds_) external onlyOwner {
        _configure(pool_, twapSeconds_);
    }

    /// @notice 读取最新 TWAP 并刷新内部快照。
    /// @dev 调用 Uniswap `observe` 获取均值 Tick，返回完整快照。
    /// @return snap 最新价格快照。
    /// @custom:error PriceSourceNotConfigured 尚未配置池地址。
    /// @custom:error PriceSourceInvalidParameter TWAP 配置为 0。
    /// @custom:example Contest 结算前调用以获取链上最新价格。
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

    /// @notice 返回最新快照的均值 Tick，并在必要时刷新。
    /// @dev 直接调用 `update` 并提取 `meanTick` 字段。
    /// @return meanTick 最新均值 Tick。
    /// @custom:error PriceSourceNotConfigured 尚未配置池地址。
    /// @custom:error PriceSourceInvalidParameter TWAP 配置为 0。
    /// @custom:example 监控脚本定期读取 TWAP Tick。
    function getTwapTick() public returns (int24 meanTick) {
        Snapshot memory snap = update();
        return snap.meanTick;
    }

    /// @notice 返回最近一次缓存的价格快照。
    /// @dev 若尚未通过 `update` 初始化，字段将为默认值。
    /// @return snap 最新快照。
    /// @custom:error 无
    /// @custom:example 前端在显示价格前先检查快照时间。
    function lastSnapshot() external view returns (Snapshot memory snap) {
        return snapshot;
    }

    /// @notice 校验给定成交价格是否在容忍度以内并返回偏离。
    /// @dev 若缓存快照过期会自动刷新，再计算价格偏离并比较阈值。
    /// @param amountIn 输入资产数量。
    /// @param amountOut 输出资产数量。
    /// @param zeroForOne 为真表示基础资产兑报价资产。
    /// @param toleranceBps 允许的最大价格偏离（基点）。
    /// @return priceImpactBps 实际价格偏离（基点）。
    /// @return priceE18 最新 1e18 精度的 TWAP 价格。
    /// @custom:error PriceSourcePriceOutOfTolerance 偏离超出容忍度。
    /// @custom:error PriceSourceNotConfigured 尚未配置价格池。
    /// @custom:error PriceSourceInvalidParameter TWAP 配置为 0。
    /// @custom:example Vault.swapExact 交易完成后调用验证滑点。
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

    /// @notice 基于当前快照预估一次交易的价格偏离值。
    /// @dev 不刷新快照，适用于静态查询。
    /// @param amountIn 输入资产数量。
    /// @param amountOut 输出资产数量。
    /// @param zeroForOne 方向标记，true 表示基础兑报价。
    /// @return priceImpactBps 预估的价格偏离（基点）。
    /// @custom:error PriceSourceSnapshotStale 缓存快照为空或过期。
    /// @custom:example 前端在签名交易前预览滑点。
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
