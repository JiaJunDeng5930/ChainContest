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

    function state() external view returns (ContestState);

    function getTimeline() external view returns (ContestTimeline memory);

    function getConfig() external view returns (ContestConfig memory);

    function getVaultContext(address vault) external view returns (bytes32 vaultId, address owner);
}

contract Vault is Pausable, ReentrancyGuard, IUniswapV3SwapCallback {
    using SafeERC20 for IERC20;

    struct Score {
        uint256 nav;
        int32 roiBps;
        uint16 rank;
    }

    IERC20 public immutable baseAsset;
    IERC20 public immutable quoteAsset;

    address public contest;
    address public owner;

    uint256 public baseBalance;
    uint256 public quoteBalance;
    uint256 public lastSettleBlock;
    bool public isSettled;
    bool public withdrawn;

    Score public score;

    bool private _initialized;

    event VaultInitialized(address indexed contest, address indexed owner, uint256 entryAmount);
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
    event VaultSettled(address indexed contest, uint256 nav, int32 roiBps, uint16 rank);
    event VaultWithdrawn(address indexed contest, address indexed participant, uint256 baseAmount, uint256 quoteAmount);

    error VaultAlreadyInitialized();
    error VaultUnauthorized(address account);
    error VaultInvalidParameter(string field);
    error VaultWithdrawForbidden();
    error VaultSwapInvalidState(uint8 state);
    error VaultSwapExpired(uint256 deadline, uint256 current);
    error VaultSwapInsufficientOutput(uint256 amountOut, uint256 minAmountOut);
    error VaultUnknownPool(address pool);

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

    constructor(IERC20 baseAsset_, IERC20 quoteAsset_) {
        if (address(baseAsset_) == address(0) || address(quoteAsset_) == address(0)) {
            revert VaultInvalidParameter("asset");
        }
        baseAsset = baseAsset_;
        quoteAsset = quoteAsset_;
    }

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

    function pause() external onlyContest {
        _pause();
    }

    function unpause() external onlyContest {
        _unpause();
    }

    function syncBalances(uint256 baseBalance_, uint256 quoteBalance_) external onlyContest {
        baseBalance = baseBalance_;
        quoteBalance = quoteBalance_;
    }

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
