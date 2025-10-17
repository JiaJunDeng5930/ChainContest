// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IUniswapV3SwapCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import {TickMath} from "./libraries/TickMath.sol";

import {PriceSource} from "./PriceSource.sol";

interface IContestMinimal {
    enum ContestState {
        Uninitialized,
        Registering,
        Live,
        Frozen,
        Sealed,
        Closed
    }

    struct ContestConfig {
        IERC20 entryAsset;
        uint256 entryAmount;
        uint256 entryFee;
        address priceSource;
        address swapPool;
        uint16 priceToleranceBps;
        uint32 settlementWindow;
        uint16 maxParticipants;
        uint16 topK;
    }

    struct ContestTimeline {
        uint64 registeringEnds;
        uint64 liveEnds;
        uint64 claimEnds;
    }

    /// @notice 返回 Contest 当前状态枚举值。
    /// @dev Vault 在 swap 和结算过程中使用，用于限制行为窗口。
    /// @return state_ 当前比赛状态。
    /// @custom:error 无
    /// @custom:example Vault.swapExact 在交易前检查状态是否为 Live。
    function state() external view returns (ContestState);

    /// @notice 获取比赛的时间线配置。
    /// @dev Vault 根据时间戳判断交易与结算窗口。
    /// @return timeline 含报名、实盘、领奖截止的时间戳。
    /// @custom:error 无
    /// @custom:example Vault.swapExact 用于校验实盘期未结束。
    function getTimeline() external view returns (ContestTimeline memory);

    /// @notice 获取比赛配置，包括资产与价格源信息。
    /// @dev Vault 需要读取价格源、交易池与容忍度。
    /// @return config 比赛配置结构体。
    /// @custom:error 无
    /// @custom:example Vault.swapExact 根据配置检验 swapPool。
    function getConfig() external view returns (ContestConfig memory);

    /// @notice 查询 Vault 在比赛中的上下文信息。
    /// @dev 返回 Vault ID 与所有者地址以进行权限判断。
    /// @param vault Vault 合约地址。
    /// @return vaultId Vault 唯一标识符。
    /// @return owner Vault 所有者地址。
    /// @custom:error ContestUnknownVault 传入地址非本比赛。
    /// @custom:example Vault.swapExact 调用以确保自身仍受 Contest 管理。
    function getVaultContext(address vault) external view returns (bytes32 vaultId, address owner);
}

contract Vault is Pausable, ReentrancyGuard, IUniswapV3SwapCallback {
    using SafeERC20 for IERC20;

    struct Score {
        uint256 nav;
        int32 roiBps;
        uint16 rank;
    }

    /// @notice 返回 Vault 绑定的基础资产合约。
    /// @dev 由构造函数确定，后续不可修改。
    /// @custom:error 无
    /// @custom:example Contest 结算前读取基础资产类型。
    IERC20 public immutable baseAsset;
    /// @notice 返回 Vault 使用的报价资产合约。
    /// @dev 用于计算净值与价格保护。
    /// @custom:error 无
    /// @custom:example Contest 在 syncBalances 时确认报价资产。
    IERC20 public immutable quoteAsset;

    /// @notice Vault 当前绑定的 Contest 地址。
    /// @dev 初始化后指向负责治理的比赛合约。
    /// @custom:error 无
    /// @custom:example 外部监控工具确认 Vault 属于哪场比赛。
    address public contest;
    /// @notice 返回 Vault 所属参赛者地址。
    /// @dev 初始化后保持不变。
    /// @custom:error 无
    /// @custom:example Contest 在发放奖励时验证归属。
    address public owner;

    /// @notice Vault 最近同步的基础资产余额。
    /// @dev 由 Contest 调用 `syncBalances` 或 swap 更新。
    /// @custom:error 无
    /// @custom:example 领奖前检查 Vault 剩余基础资产。
    uint256 public baseBalance;
    /// @notice Vault 最近同步的报价资产余额。
    /// @dev 与 `baseBalance` 同步以供结算。
    /// @custom:error 无
    /// @custom:example 领奖前检查 Vault 剩余报价资产。
    uint256 public quoteBalance;
    /// @notice 最近一次结算时的区块高度。
    /// @dev 主要用于追踪结算频率。
    /// @custom:error 无
    /// @custom:example 审计脚本校验结算是否及时。
    uint256 public lastSettleBlock;
    /// @notice 标记 Vault 是否已完成结算。
    /// @dev Contest 调用 `finalizeSettlement` 后设置为 true。
    /// @custom:error 无
    /// @custom:example Contest.exit 调用前确认 Vault 已结算。
    bool public isSettled;
    /// @notice 表示 Vault 是否已完全提取资产。
    /// @dev 当基础与报价资产余额均为零时设为 true。
    /// @custom:error 无
    /// @custom:example Contest 决定是否允许再次 withdraw。
    bool public withdrawn;

    /// @notice 返回 Vault 最近一次的净值、收益率与排名。
    /// @dev 由结算与 `updateRank` 更新，用于领奖资格判断。
    /// @custom:error 无
    /// @custom:example Contest._claim 验证参赛者排名。
    Score public score;

    bool private _initialized;

    /// @notice Vault 完成初始化并绑定参赛者时触发。
    /// @dev 记录 Contest 地址、所有者与起始报名金额。
    /// @param contest Contest 合约地址。
    /// @param owner Vault 所有者（参赛者）。
    /// @param entryAmount 报名转入的基础资产数量。
    /// @custom:example Contest.register 在将资产转入后调用 `initialize`。
    event VaultInitialized(address indexed contest, address indexed owner, uint256 entryAmount);
    /// @notice Vault 完成一次兑换交易并更新余额。
    /// @dev 记录撮合池、代币方向、成交数量、TWAP 价格与价格冲击。
    /// @param contest Contest 合约地址。
    /// @param participant Vault 所有者地址。
    /// @param pool 使用的 Uniswap V3 池地址。
    /// @param tokenIn 输入代币。
    /// @param tokenOut 输出代币。
    /// @param amountIn 实际支出数量。
    /// @param amountOut 实际获得数量。
    /// @param twap 交易时价格源提供的 TWAP（1e18 精度）。
    /// @param priceImpactBps 价格偏离的基点数。
    /// @custom:example 参赛者执行调仓后，监听器记录交易细节。
    event VaultSwapped(
        address indexed contest,
        address indexed participant,
        address indexed pool,
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 twap,
        int32 priceImpactBps
    );
    /// @notice Contest 写入结算结果时触发。
    /// @dev 记录净值、收益率与排名（初始为 0，随后由 Contest 更新）。
    /// @param contest Contest 合约地址。
    /// @param nav 结算后的净值金额。
    /// @param roiBps 收益率（基点）。
    /// @param rank 初始排名，默认为 0。
    /// @custom:example Contest.settle 调用 `finalizeSettlement` 后触发。
    event VaultSettled(address indexed contest, uint256 nav, int32 roiBps, uint16 rank);
    /// @notice Vault 资产被 Contest 提取至参赛者时触发。
    /// @dev 记录提取金额以便审计与资金对账。
    /// @param contest Contest 合约地址。
    /// @param participant Vault 所有者地址。
    /// @param baseAmount 提取的基础资产数量。
    /// @param quoteAmount 提取的报价资产数量。
    /// @custom:example 领奖或退出流程完成时触发。
    event VaultWithdrawn(address indexed contest, address indexed participant, uint256 baseAmount, uint256 quoteAmount);

    /// @notice Vault 已完成初始化时拒绝再次初始化。
    /// @dev `_initialized` 标志位防止重复绑定。
    /// @custom:example Contest 再次调用 `initialize` 将触发。
    error VaultAlreadyInitialized();
    /// @notice 调用者不具备所需权限时抛出。
    /// @dev 同时适用于 Contest 与所有者权限校验。
    /// @param account 未授权的调用方地址。
    /// @custom:example 非所有者尝试调用 `swapExact`。
    error VaultUnauthorized(address account);
    /// @notice 输入参数不符合业务规则时抛出。
    /// @dev 使用字段名帮助排查错误。
    /// @param field 触发错误的参数标识。
    /// @custom:example 初始化时 Vault 余额与报名金额不符。
    error VaultInvalidParameter(string field);
    /// @notice Vault 已执行过 withdraw，禁止重复提取。
    /// @dev 防止重复转移导致资产流失。
    /// @custom:example Contest 在领奖后再次调用 `withdraw`。
    error VaultWithdrawForbidden();
    /// @notice 当前比赛状态不允许执行 swap。
    /// @dev 将状态编码为 `uint8` 以节省 gas。
    /// @param state 实际检测到的状态。
    /// @custom:example 比赛冻结后仍尝试调用 `swapExact`。
    error VaultSwapInvalidState(uint8 state);
    /// @notice swap 请求超过指定截止时间。
    /// @dev 保护参赛者免受撮合延迟影响。
    /// @param deadline 请求指定的过期时间戳。
    /// @param current 当前区块时间戳。
    /// @custom:example 前端长时间未确认导致交易超时。
    error VaultSwapExpired(uint256 deadline, uint256 current);
    /// @notice 实际获得的输出金额低于用户设定的最小值。
    /// @dev 避免在滑点过大时继续执行。
    /// @param amountOut 合约计算得到的输出数量。
    /// @param minAmountOut 用户期望的最小输出。
    /// @custom:example 市场波动导致兑换结果过低。
    error VaultSwapInsufficientOutput(uint256 amountOut, uint256 minAmountOut);
    /// @notice 指定的交易池与预期资产不匹配。
    /// @dev 防止对接错误或被替换的池。
    /// @param pool 调用者指定的池地址。
    /// @custom:example Contest 配置的池资产顺序与 Vault 不符。
    error VaultUnknownPool(address pool);
    /// @notice Contest 试图重复写入结算结果。
    /// @dev `finalizeSettlement` 仅允许执行一次。
    /// @custom:example Contest 在已结算情况下重复调用。
    error VaultAlreadySettled();

    struct SwapCallbackData {
        address pool;
        IERC20 token0;
        IERC20 token1;
    }

    modifier onlyContest() {
        if (msg.sender != contest) {
            revert VaultUnauthorized(msg.sender);
        }
        _;
    }

    modifier onlyOwnerOrContest() {
        if (msg.sender != owner && msg.sender != contest) {
            revert VaultUnauthorized(msg.sender);
        }
        _;
    }

    /// @notice 创建 Vault 并固定基础、报价资产类型。
    /// @dev 资产地址不可为零，否则视为配置错误。
    /// @param baseAsset_ 比赛报名资产。
    /// @param quoteAsset_ 兑换时参考的报价资产。
    /// @custom:error VaultInvalidParameter 基础或报价资产地址为空。
    /// @custom:example 工厂部署 Vault 时传入 Contest 指定的资产。
    constructor(IERC20 baseAsset_, IERC20 quoteAsset_) {
        if (address(baseAsset_) == address(0) || address(quoteAsset_) == address(0)) {
            revert VaultInvalidParameter("asset");
        }
        baseAsset = baseAsset_;
        quoteAsset = quoteAsset_;
    }

    /// @notice 完成 Vault 初始化，绑定参赛者与 Contest。
    /// @dev 仅允许 Contest 调用一次，并检查初始资产余额。
    /// @param owner_ 参赛者地址。
    /// @param contest_ Contest 合约地址。
    /// @param entryAmount 报名金额，需与 Vault 余额一致。
    /// @custom:error VaultAlreadyInitialized Vault 已初始化。
    /// @custom:error VaultUnauthorized 调用方不是 Contest。
    /// @custom:error VaultInvalidParameter 所有者、Contest、金额或余额不合法。
    /// @custom:example Contest.register 转入报名资金后调用。
    function initialize(address owner_, address contest_, uint256 entryAmount) external whenNotPaused {
        if (_initialized) {
            revert VaultAlreadyInitialized();
        }
        if (msg.sender != contest_) {
            revert VaultUnauthorized(msg.sender);
        }
        if (owner_ == address(0)) {
            revert VaultInvalidParameter("owner");
        }
        if (contest_ == address(0)) {
            revert VaultInvalidParameter("contest");
        }
        if (entryAmount == 0) {
            revert VaultInvalidParameter("entryAmount");
        }

        uint256 currentBase = baseAsset.balanceOf(address(this));
        if (currentBase != entryAmount) {
            revert VaultInvalidParameter("entryAmountBalanceMismatch");
        }

        owner = owner_;
        contest = contest_;
        baseBalance = currentBase;
        quoteBalance = quoteAsset.balanceOf(address(this));
        lastSettleBlock = block.number;
        _initialized = true;

        emit VaultInitialized(contest_, owner_, entryAmount);
    }

    /// @notice 暂停 Vault，阻止参赛者继续兑换。
    /// @dev 仅允许 Contest 触发，用于应急措施。
    /// @custom:error VaultUnauthorized 调用者不是 Contest。
    /// @custom:example Contest 在冻结阶段暂停 Vault。
    function pause() external onlyContest {
        _pause();
    }

    /// @notice 取消暂停状态，恢复交易能力。
    /// @dev 应与治理流程或 Contest 状态联动使用。
    /// @custom:error VaultUnauthorized 调用者不是 Contest。
    /// @custom:example 比赛状态恢复 Live 时重新开放 Vault。
    function unpause() external onlyContest {
        _unpause();
    }

    /// @notice 将 Vault 内部余额同步为 Contest 观察到的实际值。
    /// @dev Contest 在结算前调用以防止缓存与链上余额不一致。
    /// @param baseBalance_ 最新基础资产余额。
    /// @param quoteBalance_ 最新报价资产余额。
    /// @custom:error VaultUnauthorized 调用者不是 Contest。
    /// @custom:example Contest.settle 读取 Token 余额后调用。
    function syncBalances(uint256 baseBalance_, uint256 quoteBalance_) external onlyContest {
        baseBalance = baseBalance_;
        quoteBalance = quoteBalance_;
    }

    /// @notice 写入结算净值与收益率并锁定 Vault。
    /// @dev 仅允许执行一次，随后会触发 `VaultSettled` 事件。
    /// @param nav 结算净值金额。
    /// @param roiBps 收益率（基点）。
    /// @custom:error VaultUnauthorized 调用者不是 Contest。
    /// @custom:error VaultAlreadySettled 已经写入过结算结果。
    /// @custom:example Contest.settle 完成净值计算后调用。
    function finalizeSettlement(uint256 nav, int32 roiBps) external onlyContest {
        if (isSettled) {
            revert VaultAlreadySettled();
        }
        score = Score({nav: nav, roiBps: roiBps, rank: 0});
        isSettled = true;
        lastSettleBlock = block.number;
        emit VaultSettled(contest, nav, roiBps, score.rank);
    }

    /// @notice 更新 Vault 在排行榜中的排名。
    /// @dev Contest 在调用 `updateLeaders` 时同步写入。
    /// @param rank 最新排名，1 表示冠军。
    /// @custom:error VaultUnauthorized 调用者不是 Contest。
    /// @custom:example Contest.updateLeaders 在排序后调用。
    function updateRank(uint16 rank) external onlyContest {
        score.rank = rank;
    }

    /// @notice 从 Vault 转出资产至指定地址。
    /// @dev Contest 在领奖或退出时调用，确保余额充足后更新记录。
    /// @param recipient 接收资产的钱包地址。
    /// @param baseAmount 要转出的基础资产数量。
    /// @param quoteAmount 要转出的报价资产数量。
    /// @custom:error VaultUnauthorized 调用者不是 Contest。
    /// @custom:error VaultWithdrawForbidden 资产已被全部提取。
    /// @custom:error VaultInvalidParameter 收款人地址为空或请求金额超过余额。
    /// @custom:example Contest._claim 在发放奖金后调用本函数。
    function withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external onlyContest nonReentrant {
        if (withdrawn) {
            revert VaultWithdrawForbidden();
        }
        if (recipient == address(0)) {
            revert VaultInvalidParameter("recipient");
        }

        uint256 currentBase = baseAsset.balanceOf(address(this));
        uint256 currentQuote = quoteAsset.balanceOf(address(this));
        if (baseAmount > currentBase) {
            revert VaultInvalidParameter("baseAmount");
        }
        if (quoteAmount > currentQuote) {
            revert VaultInvalidParameter("quoteAmount");
        }

        if (baseAmount > 0) {
            baseAsset.safeTransfer(recipient, baseAmount);
            currentBase -= baseAmount;
        }
        if (quoteAmount > 0) {
            quoteAsset.safeTransfer(recipient, quoteAmount);
            currentQuote -= quoteAmount;
        }

        baseBalance = currentBase;
        quoteBalance = currentQuote;
        withdrawn = baseBalance == 0 && quoteBalance == 0;

        emit VaultWithdrawn(contest, owner, baseAmount, quoteAmount);
    }

    /// @notice 在 Uniswap V3 池中执行兑换，更新 Vault 资产结构。
    /// @dev 仅所有者在实盘阶段可调用，校验价格容忍度并记录成交详情。
    /// @param amountIn 输入资产数量。
    /// @param minAmountOut 希望至少获得的输出数量。
    /// @param swapBaseForQuote 为真表示卖出基础资产换取报价资产。
    /// @param deadline 交易有效期截止时间戳（秒）。
    /// @return amountOut 实际获得的输出数量。
    /// @return priceImpactBps 价格偏离的基点数。
    /// @custom:error VaultInvalidParameter Vault 未初始化或参数无效。
    /// @custom:error VaultUnauthorized 调用者不是所有者。
    /// @custom:error VaultSwapExpired 当前时间超过截止时间。
    /// @custom:error VaultSwapInvalidState 比赛不在 Live 阶段。
    /// @custom:error VaultInvalidParameter PriceSource 或 swapPool 配置为空。
    /// @custom:error VaultUnknownPool 交易池与资产不匹配。
    /// @custom:error VaultInvalidParameter amountIn 超过 Vault 余额。
    /// @custom:error VaultSwapInsufficientOutput 实际输出低于最小值。
    /// @custom:example 参赛者在比赛进行中调整仓位。
    function swapExact(uint256 amountIn, uint256 minAmountOut, bool swapBaseForQuote, uint256 deadline)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 amountOut, int32 priceImpactBps)
    {
        if (!_initialized) {
            revert VaultInvalidParameter("uninitialized");
        }
        if (msg.sender != owner) {
            revert VaultUnauthorized(msg.sender);
        }
        if (amountIn == 0) {
            revert VaultInvalidParameter("amountIn");
        }
        if (block.timestamp > deadline) {
            revert VaultSwapExpired(deadline, block.timestamp);
        }

        IContestMinimal contestContract = IContestMinimal(contest);
        {
            IContestMinimal.ContestState contestState = contestContract.state();
            if (contestState != IContestMinimal.ContestState.Live) {
                revert VaultSwapInvalidState(uint8(contestState));
            }
        }

        {
            IContestMinimal.ContestTimeline memory contestTimeline = contestContract.getTimeline();
            if (block.timestamp >= contestTimeline.liveEnds) {
                revert VaultSwapInvalidState(uint8(IContestMinimal.ContestState.Frozen));
            }
        }

        contestContract.getVaultContext(address(this));

        address priceSourceAddress;
        address poolAddress;
        uint16 toleranceBps;
        {
            IContestMinimal.ContestConfig memory contestConfig = contestContract.getConfig();
            priceSourceAddress = contestConfig.priceSource;
            poolAddress = contestConfig.swapPool;
            toleranceBps = contestConfig.priceToleranceBps;
        }

        if (priceSourceAddress == address(0)) {
            revert VaultInvalidParameter("priceSource");
        }
        if (poolAddress == address(0)) {
            revert VaultInvalidParameter("swapPool");
        }

        IUniswapV3Pool pool = IUniswapV3Pool(poolAddress);
        address token0 = pool.token0();
        address token1 = pool.token1();

        bool zeroForOne;
        if (token0 == address(baseAsset) && token1 == address(quoteAsset)) {
            zeroForOne = swapBaseForQuote;
        } else if (token0 == address(quoteAsset) && token1 == address(baseAsset)) {
            zeroForOne = !swapBaseForQuote;
        } else {
            revert VaultUnknownPool(poolAddress);
        }

        IERC20 tokenIn = swapBaseForQuote ? baseAsset : quoteAsset;
        IERC20 tokenOut = swapBaseForQuote ? quoteAsset : baseAsset;

        uint256 balanceInBefore = tokenIn.balanceOf(address(this));
        uint256 balanceOutBefore = tokenOut.balanceOf(address(this));
        if (amountIn > balanceInBefore) {
            revert VaultInvalidParameter("amountInBalance");
        }
        pool.swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1,
            abi.encode(SwapCallbackData({pool: poolAddress, token0: IERC20(token0), token1: IERC20(token1)}))
        );

        uint256 spent = balanceInBefore - tokenIn.balanceOf(address(this));
        amountOut = tokenOut.balanceOf(address(this)) - balanceOutBefore;

        if (spent == 0) {
            revert VaultInvalidParameter("amountInBalance");
        }
        if (amountOut < minAmountOut) {
            revert VaultSwapInsufficientOutput(amountOut, minAmountOut);
        }

        PriceSource priceSource = PriceSource(priceSourceAddress);
        (int32 impact, uint256 twapPriceE18) =
            priceSource.requireWithinTolerance(spent, amountOut, swapBaseForQuote, toleranceBps);
        priceImpactBps = impact;

        baseBalance = baseAsset.balanceOf(address(this));
        quoteBalance = quoteAsset.balanceOf(address(this));

        emit VaultSwapped(
            contest,
            owner,
            poolAddress,
            tokenIn,
            tokenOut,
            spent,
            amountOut,
            twapPriceE18,
            priceImpactBps
        );

        return (amountOut, priceImpactBps);
    }

    /// @notice Uniswap V3 回调函数，支付兑换所需的输入资产。
    /// @dev 仅允许来自预期池的回调，使用 SafeERC20 转账。
    /// @param amount0Delta 需要支付的 token0 金额，正数表示 Vault 需转出。
    /// @param amount1Delta 需要支付的 token1 金额。
    /// @param data 交换时编码的池与代币信息。
    /// @custom:error VaultUnauthorized 回调来源不是预期池。
    /// @custom:example Uniswap 在执行 swapExact 时调用本函数。
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external override {
        SwapCallbackData memory decoded = abi.decode(data, (SwapCallbackData));
        if (msg.sender != decoded.pool) {
            revert VaultUnauthorized(msg.sender);
        }

        if (amount0Delta > 0) {
            decoded.token0.safeTransfer(msg.sender, uint256(amount0Delta));
        }
        if (amount1Delta > 0) {
            decoded.token1.safeTransfer(msg.sender, uint256(amount1Delta));
        }
    }
}
