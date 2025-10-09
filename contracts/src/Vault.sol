// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Vault is Pausable, ReentrancyGuard {
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

    function initialize(address owner_, address contest_, uint256 entryAmount) external {
        if (_initialized) {
            revert VaultAlreadyInitialized();
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

        owner = owner_;
        contest = contest_;
        baseBalance = entryAmount;
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
}
