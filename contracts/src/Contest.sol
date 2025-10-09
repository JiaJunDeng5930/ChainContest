// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {PriceSource} from "./PriceSource.sol";

interface IVaultFactory {
    function deployVault(address participant, uint256 entryAmount) external returns (address);

    function predictVaultAddress(address participant) external view returns (address);
}

interface IVaultInitializer {
    function initialize(address owner, address contest, uint256 entryAmount) external;
}

interface IVault is IVaultInitializer {
    function baseAsset() external view returns (IERC20);

    function quoteAsset() external view returns (IERC20);

    function syncBalances(uint256 baseBalance, uint256 quoteBalance) external;

    function finalizeSettlement(uint256 nav, int32 roiBps) external;

    function isSettled() external view returns (bool);

    function baseBalance() external view returns (uint256);

    function quoteBalance() external view returns (uint256);

    function withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external;

    function withdrawn() external view returns (bool);

    function updateRank(uint16 rank) external;

    function score() external view returns (uint256 nav, int32 roiBps, uint16 rank);
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
        uint16[32] payoutSchedule;
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
    mapping(address => bytes32) public vaultIdsByAddress;
    mapping(bytes32 => address) public vaultAddresses;
    uint256 public participantCount;
    uint16[32] public payoutSchedule;
    uint64 public frozenAt;
    uint256 public settledCount;
    uint32 public leaderboardVersion;
    uint256 public totalPrizePool;

    address[] private _participants;
    mapping(bytes32 => bool) public vaultSettled;
    mapping(bytes32 => uint256) public vaultNavs;
    mapping(bytes32 => int32) public vaultRoiBps;
    mapping(bytes32 => bool) public rewardClaimed;

    struct LeaderboardEntry {
        bytes32 vaultId;
        uint256 nav;
        int32 roiBps;
        uint16 rank;
    }

    struct LeaderboardUpdate {
        bytes32 vaultId;
        uint256 nav;
        int32 roiBps;
    }

    LeaderboardEntry[] private _leaders;
    event ContestInitialized(
        bytes32 indexed contestId,
        ContestConfig config,
        ContestTimeline timeline,
        uint16[32] payoutSchedule,
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
    error ContestUnknownVault(address vault);
    error ContestFreezeTooEarly(uint64 liveEnds, uint64 currentTimestamp);
    error ContestParticipantUnknown(address participant);
    error ContestSettlementPending();
    error ContestRewardAlreadyClaimed(bytes32 vaultId);
    error ContestNotEligibleForReward(bytes32 vaultId);
    error ContestWithdrawalUnavailable(bytes32 vaultId);

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

        uint256 payoutTotal;
        for (uint256 i = 0; i < params.payoutSchedule.length; i++) {
            payoutTotal += params.payoutSchedule[i];
        }
        if (payoutTotal != 10_000) {
            revert ContestInvalidParam("payoutSchedule");
        }

        contestId = params.contestId;
        config = params.config;
        timeline = params.timeline;
        vaultImplementation = params.vaultImplementation;
        vaultFactory = params.vaultFactory;
        payoutSchedule = params.payoutSchedule;
        state = ContestState.Registering;
        _initialized = true;

        _transferOwnership(params.owner);

        emit ContestInitialized(
            params.contestId,
            params.config,
            params.timeline,
            params.payoutSchedule,
            params.vaultImplementation,
            params.config.priceSource
        );
    }

    function syncState() public {
        if (state == ContestState.Registering && uint64(block.timestamp) > timeline.registeringEnds) {
            state = ContestState.Live;
            emit ContestRegistrationClosed(contestId, timeline.registeringEnds);
            emit ContestLiveStarted(contestId, timeline.liveEnds);
        }
    }

    function freeze() external {
        syncState();
        if (state != ContestState.Live) {
            revert ContestInvalidState(ContestState.Live, state);
        }
        if (uint64(block.timestamp) < timeline.liveEnds) {
            revert ContestFreezeTooEarly(timeline.liveEnds, uint64(block.timestamp));
        }
        state = ContestState.Frozen;
        frozenAt = uint64(block.timestamp);
        emit ContestFrozen(contestId, frozenAt);
    }

    function settle(address participant) external returns (uint256 nav, int32 roiBps) {
        if (state != ContestState.Frozen) {
            revert ContestInvalidState(ContestState.Frozen, state);
        }
        if (participant == address(0)) {
            revert ContestParticipantUnknown(participant);
        }

        bytes32 vaultId = participantVaults[participant];
        if (vaultId == bytes32(0)) {
            revert ContestParticipantUnknown(participant);
        }

        if (vaultSettled[vaultId]) {
            return (vaultNavs[vaultId], vaultRoiBps[vaultId]);
        }

        address vaultAddress = vaultAddresses[vaultId];
        if (vaultAddress == address(0)) {
            revert ContestUnknownVault(vaultAddress);
        }

        IVault vault = IVault(vaultAddress);

        IERC20 baseToken = config.entryAsset;
        IERC20 quoteToken = vault.quoteAsset();

        uint256 baseBalanceActual = baseToken.balanceOf(vaultAddress);
        uint256 quoteBalanceActual = quoteToken.balanceOf(vaultAddress);

        vault.syncBalances(baseBalanceActual, quoteBalanceActual);

        (nav, roiBps) = _computeScore(vault, baseBalanceActual, quoteBalanceActual);

        vault.finalizeSettlement(nav, roiBps);

        vaultSettled[vaultId] = true;
        vaultNavs[vaultId] = nav;
        vaultRoiBps[vaultId] = roiBps;
        settledCount += 1;

        emit VaultSettled(vaultId, nav, roiBps);

        return (nav, roiBps);
    }

    function getConfig() external view returns (ContestConfig memory) {
        return config;
    }

    function getTimeline() external view returns (ContestTimeline memory) {
        return timeline;
    }

    function getVaultContext(address vault) external view returns (bytes32 vaultId, address owner) {
        vaultId = vaultIdsByAddress[vault];
        if (vaultId == bytes32(0)) {
            revert ContestUnknownVault(vault);
        }
        owner = vaultOwners[vaultId];
    }

    function register() external whenNotPaused nonReentrant returns (bytes32 vaultId) {
        syncState();
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
        IVaultInitializer(vault).initialize(msg.sender, address(this), config.entryAmount);

        participantVaults[msg.sender] = vaultId;
        vaultOwners[vaultId] = msg.sender;
        vaultIdsByAddress[vault] = vaultId;
        vaultAddresses[vaultId] = vault;
        _participants.push(msg.sender);
        participantCount += 1;
        prizePool += config.entryAmount;
        totalPrizePool += config.entryAmount;

        emit ContestRegistered(contestId, msg.sender, vault, config.entryAmount);

        return vaultId;
    }

    function updateLeaders(LeaderboardUpdate[] calldata updates) external {
        if (state != ContestState.Frozen) {
            revert ContestInvalidState(ContestState.Frozen, state);
        }
        uint256 length = updates.length;
        if (length == 0) {
            revert ContestInvalidParam("updates");
        }
        if (length > 16) {
            revert ContestInvalidParam("updatesLength");
        }
        if (length > uint256(config.topK)) {
            revert ContestInvalidParam("updatesTopK");
        }

        delete _leaders;
        bytes32[] memory vaultIds = new bytes32[](length);

        uint256 previousNav;
        bool hasPrevious;

        for (uint256 i = 0; i < length; i++) {
            LeaderboardUpdate calldata update = updates[i];
            if (!vaultSettled[update.vaultId]) {
                revert ContestSettlementPending();
            }
            if (update.nav != vaultNavs[update.vaultId]) {
                revert ContestInvalidParam("navMismatch");
            }
            if (update.roiBps != vaultRoiBps[update.vaultId]) {
                revert ContestInvalidParam("roiMismatch");
            }
            if (hasPrevious && previousNav < update.nav) {
                revert ContestInvalidParam("unsorted");
            }
            hasPrevious = true;
            previousNav = update.nav;

            uint16 rank = uint16(i + 1);
            _leaders.push(LeaderboardEntry({vaultId: update.vaultId, nav: update.nav, roiBps: update.roiBps, rank: rank}));
            vaultIds[i] = update.vaultId;

            address vaultAddress = vaultAddresses[update.vaultId];
            if (vaultAddress == address(0)) {
                revert ContestUnknownVault(vaultAddress);
            }
            IVault(vaultAddress).updateRank(rank);
        }

        leaderboardVersion += 1;
        emit LeadersUpdated(contestId, vaultIds, leaderboardVersion);
    }

    function getLeaders() external view returns (LeaderboardEntry[] memory leaders_) {
        uint256 length = _leaders.length;
        leaders_ = new LeaderboardEntry[](length);
        for (uint256 i = 0; i < length; i++) {
            leaders_[i] = _leaders[i];
        }
    }

    function seal() external {
        if (state != ContestState.Frozen) {
            revert ContestInvalidState(ContestState.Frozen, state);
        }
        if (settledCount != participantCount) {
            revert ContestSettlementPending();
        }
        state = ContestState.Sealed;
        sealedAt = uint64(block.timestamp);
        emit ContestSealed(contestId, sealedAt);
    }

    function claim() external nonReentrant returns (uint256 prizeAmount) {
        return _claim(msg.sender, msg.sender);
    }

    function claimFor(address participant) external nonReentrant returns (uint256 prizeAmount) {
        return _claim(participant, participant);
    }

    function exit() external nonReentrant {
        if (state != ContestState.Sealed) {
            revert ContestInvalidState(ContestState.Sealed, state);
        }
        bytes32 vaultId = participantVaults[msg.sender];
        if (vaultId == bytes32(0)) {
            revert ContestParticipantUnknown(msg.sender);
        }
        if (!vaultSettled[vaultId]) {
            revert ContestSettlementPending();
        }
        if (rewardClaimed[vaultId]) {
            revert ContestRewardAlreadyClaimed(vaultId);
        }

        address vaultAddress = vaultAddresses[vaultId];
        IVault vault = IVault(vaultAddress);
        if (vault.withdrawn()) {
            revert ContestWithdrawalUnavailable(vaultId);
        }

        (, , uint16 rank) = vault.score();
        if (rank != 0) {
            revert ContestNotEligibleForReward(vaultId);
        }

        rewardClaimed[vaultId] = true;
        uint256 baseBal = vault.baseBalance();
        uint256 quoteBal = vault.quoteBalance();
        vault.withdraw(msg.sender, baseBal, quoteBal);
        emit VaultExited(contestId, vaultId, baseBal, quoteBal);
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    function participantsLength() external view returns (uint256) {
        return _participants.length;
    }

    function _computeScore(IVault vault, uint256 baseBalanceActual, uint256 quoteBalanceActual)
        internal
        returns (uint256 nav, int32 roiBps)
    {
        uint8 baseDecimals = IERC20Metadata(address(config.entryAsset)).decimals();
        uint8 quoteDecimals = IERC20Metadata(address(vault.quoteAsset())).decimals();

        PriceSource priceSourceContract = PriceSource(config.priceSource);
        PriceSource.Snapshot memory snapshot = priceSourceContract.update();

        uint256 baseValueE18 = _scaleValue(baseBalanceActual, baseDecimals, 18);
        uint256 quoteAmountE18 = _scaleValue(quoteBalanceActual, quoteDecimals, 18);
        uint256 quoteValueE18 = snapshot.priceE18 == 0 ? 0 : (quoteAmountE18 * 1e18) / snapshot.priceE18;

        uint256 navE18 = baseValueE18 + quoteValueE18;
        nav = _scaleValue(navE18, 18, baseDecimals);
        roiBps = _computeRoi(nav);
    }

    function _computeRoi(uint256 nav) internal view returns (int32) {
        uint256 entryAmount = config.entryAmount;
        if (nav == entryAmount) {
            return 0;
        }

        if (nav > entryAmount) {
            uint256 diff = nav - entryAmount;
            uint256 bps = (diff * 10_000) / entryAmount;
            require(bps <= uint256(int256(type(int32).max)), "roi overflow");
            return int32(int256(bps));
        }

        uint256 diffNeg = entryAmount - nav;
        uint256 bpsNeg = (diffNeg * 10_000) / entryAmount;
        require(bpsNeg <= uint256(int256(type(int32).max)), "roi overflow");
        return -int32(int256(bpsNeg));
    }

    function _scaleValue(uint256 amount, uint8 fromDecimals, uint8 toDecimals) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) {
            return amount;
        }
        if (fromDecimals < toDecimals) {
            uint8 diff = toDecimals - fromDecimals;
            return amount * 10 ** uint256(diff);
        }
        uint8 diffDown = fromDecimals - toDecimals;
        return amount / 10 ** uint256(diffDown);
    }

    function _claim(address participant, address recipient) internal returns (uint256 prizeShare) {
        if (state != ContestState.Sealed) {
            revert ContestInvalidState(ContestState.Sealed, state);
        }
        if (recipient == address(0)) {
            revert ContestInvalidParam("recipient");
        }

        bytes32 vaultId = participantVaults[participant];
        if (vaultId == bytes32(0)) {
            revert ContestParticipantUnknown(participant);
        }
        if (!vaultSettled[vaultId]) {
            revert ContestSettlementPending();
        }
        if (rewardClaimed[vaultId]) {
            revert ContestRewardAlreadyClaimed(vaultId);
        }

        address vaultAddress = vaultAddresses[vaultId];
        if (vaultAddress == address(0)) {
            revert ContestUnknownVault(vaultAddress);
        }
        IVault vault = IVault(vaultAddress);
        if (vault.withdrawn()) {
            revert ContestWithdrawalUnavailable(vaultId);
        }

        (, , uint16 rank) = vault.score();
        if (rank == 0 || rank > config.topK) {
            revert ContestNotEligibleForReward(vaultId);
        }

        uint16 schedule = payoutSchedule[rank - 1];
        if (schedule == 0) {
            revert ContestNotEligibleForReward(vaultId);
        }

        prizeShare = (totalPrizePool * uint256(schedule)) / 10_000;
        if (prizeShare > prizePool) {
            revert ContestInvalidParam("prizePool");
        }
        rewardClaimed[vaultId] = true;
        prizePool -= prizeShare;

        config.entryAsset.safeTransfer(recipient, prizeShare);

        uint256 baseBal = vault.baseBalance();
        uint256 quoteBal = vault.quoteBalance();
        vault.withdraw(recipient, baseBal, quoteBal);

        emit RewardClaimed(contestId, vaultId, prizeShare);
        emit VaultExited(contestId, vaultId, baseBal, quoteBal);
        return prizeShare;
    }
}
