// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVaultFactory {
    function deployVault(address participant, uint256 entryAmount) external returns (address);

    function predictVaultAddress(address participant) external view returns (address);
}

contract Contest is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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

    struct InitializeParams {
        bytes32 contestId;
        ContestConfig config;
        ContestTimeline timeline;
        address vaultImplementation;
        address vaultFactory;
        address owner;
    }

    bytes32 public contestId;
    ContestConfig public config;
    ContestTimeline public timeline;
    ContestState public state;
    address public vaultImplementation;
    address public vaultFactory;
    uint64 public sealedAt;
    uint256 public prizePool;

    bool private _initialized;

    mapping(address => bytes32) public participantVaults;
    mapping(bytes32 => address) public vaultOwners;
    uint256 public participantCount;

    event ContestInitialized(
        bytes32 indexed contestId,
        ContestConfig config,
        ContestTimeline timeline,
        address indexed vaultImplementation,
        address indexed priceSource
    );

    event ContestRegistered(bytes32 indexed contestId, address indexed participant, address vault, uint256 amount);
    event ContestRegistrationClosed(bytes32 indexed contestId, uint64 registeringEnds);
    event ContestLiveStarted(bytes32 indexed contestId, uint64 liveEnds);
    event ContestFrozen(bytes32 indexed contestId, uint64 frozenAt);
    event VaultSettled(bytes32 indexed vaultId, uint256 nav, int32 roiBps);
    event LeadersUpdated(bytes32 indexed contestId, bytes32[] vaultIds, uint32 heapVersion);
    event ContestSealed(bytes32 indexed contestId, uint64 sealedAt);
    event RewardClaimed(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 amount);
    event VaultExited(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 baseReturned, uint256 quoteReturned);

    error ContestAlreadyInitialized();
    error ContestInvalidParam(string field);
    error ContestInvalidState(ContestState expected, ContestState actual);
    error ContestUnauthorized(address account);
    error ContestAlreadyRegistered(address participant);
    error ContestMaxParticipantsReached(uint16 limit);
    error ContestRegistrationClosedError(uint64 deadline, uint64 currentTimestamp);
    error ContestInsufficientStake(uint256 balance, uint256 required);
    error ContestInsufficientAllowance(uint256 allowance, uint256 required);

    modifier onlyState(ContestState expected) {
        if (state != expected) {
            revert ContestInvalidState(expected, state);
        }
        _;
    }

    modifier onlyVault(bytes32 vaultId) {
        address owner_ = vaultOwners[vaultId];
        if (owner_ == address(0) || msg.sender != owner_) {
            revert ContestUnauthorized(msg.sender);
        }
        _;
    }

    constructor() Ownable(msg.sender) {
        state = ContestState.Uninitialized;
    }

    function initialize(InitializeParams calldata params) external {
        if (_initialized) {
            revert ContestAlreadyInitialized();
        }
        if (params.owner == address(0)) {
            revert ContestInvalidParam("owner");
        }
        if (params.contestId == bytes32(0)) {
            revert ContestInvalidParam("contestId");
        }
        if (address(params.config.entryAsset) == address(0)) {
            revert ContestInvalidParam("entryAsset");
        }
        if (params.config.entryAmount == 0) {
            revert ContestInvalidParam("entryAmount");
        }
        if (params.config.maxParticipants == 0 || params.config.maxParticipants > 1024) {
            revert ContestInvalidParam("maxParticipants");
        }
        if (params.config.topK == 0 || params.config.topK > 32 || params.config.topK > params.config.maxParticipants) {
            revert ContestInvalidParam("topK");
        }
        if (params.config.priceSource == address(0)) {
            revert ContestInvalidParam("priceSource");
        }
        if (params.config.swapPool == address(0)) {
            revert ContestInvalidParam("swapPool");
        }
        if (params.config.priceToleranceBps == 0 || params.config.priceToleranceBps > 1000) {
            revert ContestInvalidParam("priceToleranceBps");
        }
        if (params.config.settlementWindow < 600) {
            revert ContestInvalidParam("settlementWindow");
        }
        if (params.timeline.registeringEnds == 0) {
            revert ContestInvalidParam("registeringEnds");
        }
        if (params.timeline.liveEnds <= params.timeline.registeringEnds) {
            revert ContestInvalidParam("liveEnds");
        }
        if (params.timeline.claimEnds <= params.timeline.liveEnds) {
            revert ContestInvalidParam("claimEnds");
        }
        if (params.vaultImplementation == address(0)) {
            revert ContestInvalidParam("vaultImplementation");
        }
        if (params.vaultFactory == address(0)) {
            revert ContestInvalidParam("vaultFactory");
        }

        contestId = params.contestId;
        config = params.config;
        timeline = params.timeline;
        vaultImplementation = params.vaultImplementation;
        vaultFactory = params.vaultFactory;
        state = ContestState.Registering;
        _initialized = true;

        _transferOwnership(params.owner);

        emit ContestInitialized(
            params.contestId,
            params.config,
            params.timeline,
            params.vaultImplementation,
            params.config.priceSource
        );
    }

    function register() external whenNotPaused nonReentrant returns (bytes32 vaultId) {
        if (state != ContestState.Registering) {
            revert ContestInvalidState(ContestState.Registering, state);
        }

        uint64 currentTimestamp = uint64(block.timestamp);
        if (currentTimestamp > timeline.registeringEnds) {
            revert ContestRegistrationClosedError(timeline.registeringEnds, currentTimestamp);
        }

        if (participantVaults[msg.sender] != bytes32(0)) {
            revert ContestAlreadyRegistered(msg.sender);
        }

        if (participantCount >= config.maxParticipants) {
            revert ContestMaxParticipantsReached(config.maxParticipants);
        }

        uint256 allowance = config.entryAsset.allowance(msg.sender, address(this));
        if (allowance < config.entryAmount) {
            revert ContestInsufficientAllowance(allowance, config.entryAmount);
        }

        uint256 balance = config.entryAsset.balanceOf(msg.sender);
        if (balance < config.entryAmount) {
            revert ContestInsufficientStake(balance, config.entryAmount);
        }

        vaultId = keccak256(abi.encode(contestId, msg.sender));
        IVaultFactory factory = IVaultFactory(vaultFactory);
        address vault = factory.deployVault(msg.sender, config.entryAmount);

        config.entryAsset.safeTransferFrom(msg.sender, vault, config.entryAmount);

        participantVaults[msg.sender] = vaultId;
        vaultOwners[vaultId] = msg.sender;
        participantCount += 1;
        prizePool += config.entryAmount;

        emit ContestRegistered(contestId, msg.sender, vault, config.entryAmount);

        return vaultId;
    }
}
