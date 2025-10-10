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
    /// @notice 为参赛者部署与报名金额匹配的新 Vault 合约。
    /// @dev 由 Contest 在注册阶段调用，部署后需要立即初始化并转入报名资金。
    /// @param participant 参赛者地址，部署出的 Vault 将绑定该地址。
    /// @param entryAmount 参赛者应存入的基础资产金额，单位与赛事配置一致。
    /// @return vault 部署出的 Vault 合约地址。
    /// @custom:error 无
    /// @custom:example Contest.register 调用期间通过工厂部署 Vault。
    function deployVault(address participant, uint256 entryAmount) external returns (address);

    /// @notice 预测给定参赛者对应 Vault 的地址，以便预估授权与监听。
    /// @dev 实现需保持与 `deployVault` 相同的创建盐与初始化逻辑。
    /// @param participant 参赛者地址。
    /// @return predictedVault 将要部署的 Vault 地址。
    /// @custom:error 无
    /// @custom:example 前端在报名前调用以确定 Vault allowance 目标。
    function predictVaultAddress(address participant) external view returns (address);
}

interface IVaultInitializer {
    /// @notice 初始化刚部署的 Vault，使其与 Contest 关联。
    /// @dev Contest 在转入报名资产后调用，Vault 需记录所有者与报名金额。
    /// @param owner Vault 对应参赛者地址。
    /// @param contest Contest 合约地址。
    /// @param entryAmount 参赛者报名金额。
    /// @custom:error 无
    /// @custom:example Contest.register 在完成资产转移后调用以初始化 Vault。
    function initialize(address owner, address contest, uint256 entryAmount) external;
}

interface IVault is IVaultInitializer {
    /// @notice 返回 Vault 当前持有的基础资产。
    /// @dev Vault 构造函数确定资产类型，后续保持不变。
    /// @return asset 基础资产的 IERC20 接口。
    /// @custom:error 无
    /// @custom:example Contest 结算前查询 Vault 持有的报名资产种类。
    function baseAsset() external view returns (IERC20);

    /// @notice 返回 Vault 当前使用的报价资产。
    /// @dev 报价资产用于兑换与净值计算，应与比赛配置一致。
    /// @return asset 报价资产的 IERC20 接口。
    /// @custom:error 无
    /// @custom:example Contest 在 settlement 时调用以同步持仓余额。
    function quoteAsset() external view returns (IERC20);

    /// @notice 同步 Vault 记录的基础与报价资产余额。
    /// @dev Contest 在结算前会传入链上实际余额以避免脏数据。
    /// @param baseBalance 最新基础资产余额，单位与 baseAsset 一致。
    /// @param quoteBalance 最新报价资产余额，单位与 quoteAsset 一致。
    /// @custom:error 无
    /// @custom:example Contest.settle 在读出 Token 余额后调用本函数。
    function syncBalances(uint256 baseBalance, uint256 quoteBalance) external;

    /// @notice 结束 Vault 结算并写入净值与收益率。
    /// @dev Contest 仅在冻结阶段调用，Vault 应拒绝重复结算。
    /// @param nav 折算后的净值金额，单位与基础资产一致。
    /// @param roiBps 净值相对报名本金的收益率，单位为基点。
    /// @custom:error 无
    /// @custom:example Contest 在结算完毕后调用 finalizeSettlement。
    function finalizeSettlement(uint256 nav, int32 roiBps) external;

    /// @notice 查询 Vault 是否已结算。
    /// @dev Contest 在执行后续排名或退出流程前调用。
    /// @return settled 是否完成结算。
    /// @custom:error 无
    /// @custom:example Contest.exit 在允许退出前验证 Vault 状态。
    function isSettled() external view returns (bool);

    /// @notice 返回 Vault 最近一次记录的基础资产余额。
    /// @dev 余额由 Contest.syncBalances 或 swap 操作更新。
    /// @return balance 基础资产数量。
    /// @custom:error 无
    /// @custom:example Contest 在奖励发放前读取 baseBalance。
    function baseBalance() external view returns (uint256);

    /// @notice 返回 Vault 最近一次记录的报价资产余额。
    /// @dev 余额由 Contest.syncBalances 或 swap 操作更新。
    /// @return balance 报价资产数量。
    /// @custom:error 无
    /// @custom:example Contest 在奖励发放前读取 quoteBalance。
    function quoteBalance() external view returns (uint256);

    /// @notice 将 Vault 中的资产转出至指定地址。
    /// @dev Contest 在退赛或领奖时调用，Vault 应完成转账并更新余额状态。
    /// @param recipient 接收资产的钱包地址。
    /// @param baseAmount 要转出的基础资产数量。
    /// @param quoteAmount 要转出的报价资产数量。
    /// @custom:error 无
    /// @custom:example Contest.exit 调用 withdraw 将资产归还参赛者。
    function withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external;

    /// @notice 查询 Vault 的资产是否已全部提取。
    /// @dev Contest 在发放奖励后调用以确认状态。
    /// @return emptied 是否已无剩余资产。
    /// @custom:error 无
    /// @custom:example Contest._claim 在发放奖励前确认 Vault 未被提空。
    function withdrawn() external view returns (bool);

    /// @notice 更新 Vault 的最终排名，供奖励逻辑引用。
    /// @dev Contest 在冻结阶段根据排行榜写入名次。
    /// @param rank 最新排名，1 为冠军，0 表示未入榜。
    /// @custom:error 无
    /// @custom:example Contest.updateLeaders 在刷新榜单时同步排名。
    function updateRank(uint16 rank) external;

    /// @notice 返回 Vault 已记录的净值、收益率与排名。
    /// @dev Contest.exit 与 _claim 用于校验参赛者资格。
    /// @return nav 最新净值金额。
    /// @return roiBps 最新收益率（基点）。
    /// @return rank 最新排名。
    /// @custom:error 无
    /// @custom:example Contest.exit 在判定奖励资格前调用 score。
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
    /// @notice 记录比赛完成初始化后的完整配置。
    /// @dev 供监听者确认参赛资产、时间线与 Vault 工厂是否与部署脚本一致。
    /// @param contestId 比赛唯一标识符。
    /// @param config 报名所需资产、金额及外部依赖配置。
    /// @param timeline 报名、实盘、领奖等时间边界。
    /// @param payoutSchedule 奖励分配表，各名次对应基点比例。
    /// @param vaultImplementation Vault 实现合约地址。
    /// @param priceSource 文档与结算所依赖的价格源地址。
    /// @custom:example 部署者调用 `initialize` 后，前端订阅该事件更新 UI。
    event ContestInitialized(
        bytes32 indexed contestId,
        ContestConfig config,
        ContestTimeline timeline,
        uint16[32] payoutSchedule,
        address indexed vaultImplementation,
        address indexed priceSource
    );
    /// @notice 参赛者成功报名并完成 Vault 部署时触发。
    /// @dev 用于追踪参赛者与 Vault 的绑定关系及报名金额。
    /// @param contestId 比赛标识符。
    /// @param participant 参赛者地址。
    /// @param vault 新部署的 Vault 地址。
    /// @param amount 本次报名转入的基础资产数量。
    /// @custom:example 前端监听事件以在排行榜中新增参赛者。
    event ContestRegistered(bytes32 indexed contestId, address indexed participant, address vault, uint256 amount);
    /// @notice 报名阶段结束时广播截止时间。
    /// @dev `syncState` 检测到报名截止后触发，确保前端停止报名入口。
    /// @param contestId 比赛标识符。
    /// @param registeringEnds 报名截止时间戳（秒）。
    /// @custom:example 后端服务监听事件以冻结报名 API。
    event ContestRegistrationClosed(bytes32 indexed contestId, uint64 registeringEnds);
    /// @notice 比赛进入实盘阶段时触发。
    /// @dev 与报名闭合事件同区块发出，记录实盘阶段的结束时间。
    /// @param contestId 比赛标识符。
    /// @param liveEnds 实盘阶段结束时间戳（秒）。
    /// @custom:example 价格抓取服务启动时订阅该事件以确认撮合窗口。
    event ContestLiveStarted(bytes32 indexed contestId, uint64 liveEnds);
    /// @notice 比赛被手动冻结时的时间点。
    /// @dev 冻结后禁止进一步交易，等待结算。
    /// @param contestId 比赛标识符。
    /// @param frozenAt 冻结时间戳（秒）。
    /// @custom:example 当直播结束后运营调用 `freeze`，事件通知参赛者。
    event ContestFrozen(bytes32 indexed contestId, uint64 frozenAt);
    /// @notice 单个 Vault 完成结算时记录净值与收益率。
    /// @dev 由 `settle` 在写入内部状态后发出，供排行榜与审计读取。
    /// @param vaultId Vault 唯一标识符。
    /// @param nav 折算后的净值金额。
    /// @param roiBps 收益率（基点）。
    /// @custom:example 结算服务按参赛者遍历调用 `settle` 并监听本事件。
    event VaultSettled(bytes32 indexed vaultId, uint256 nav, int32 roiBps);
    /// @notice 排行榜重算完成并写入新的排名。
    /// @dev `_leaders` 会被替换为最新数组，同步记录版本号。
    /// @param contestId 比赛标识符。
    /// @param vaultIds 新排行榜中的 Vault ID 列表。
    /// @param heapVersion 排行榜版本号，自增。
    /// @custom:example 数据服务监听事件以刷新排行榜缓存。
    event LeadersUpdated(bytes32 indexed contestId, bytes32[] vaultIds, uint32 heapVersion);
    /// @notice 比赛进入密封阶段，进入领奖与退出流程。
    /// @dev 所有 Vault 结算完成后才能调用。
    /// @param contestId 比赛标识符。
    /// @param sealedAt 密封阶段开始的时间戳（秒）。
    /// @custom:example 运营在确认结算完成后调用 `seal` 并监听事件。
    event ContestSealed(bytes32 indexed contestId, uint64 sealedAt);
    /// @notice 参赛者领取奖金时记录发放金额。
    /// @dev `_claim` 成功执行后发出，同时标记 Vault 已领奖。
    /// @param contestId 比赛标识符。
    /// @param vaultId 领奖对应的 Vault ID。
    /// @param amount 实际发放的基础资产金额。
    /// @custom:example 领奖前端可根据事件更新参赛者余额。
    event RewardClaimed(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 amount);
    /// @notice 参赛者退出并取回 Vault 内剩余资产。
    /// @dev 既可由领奖流程触发，也可在密封阶段主动退出。
    /// @param contestId 比赛标识符。
    /// @param vaultId Vault ID。
    /// @param baseReturned 退回的基础资产数量。
    /// @param quoteReturned 退回的报价资产数量。
    /// @custom:example 领奖完成后自动触发，或用户调用 `exit`。
    event VaultExited(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 baseReturned, uint256 quoteReturned);

    /// @notice `initialize` 被重复调用时抛出。
    /// @dev 一旦 `_initialized` 为真，任何后续初始化尝试都会 revert。
    /// @custom:example 第二次部署脚本误调用 `initialize` 时触发。
    error ContestAlreadyInitialized();
    /// @notice 输入参数不满足业务约束时抛出。
    /// @dev 包含字段名，便于诊断具体配置。
    /// @param field 触发校验失败的字段标识。
    /// @custom:example 报名金额为 0 时触发 `ContestInvalidParam("entryAmount")`。
    error ContestInvalidParam(string field);
    /// @notice 当前比赛状态与预期不匹配时抛出。
    /// @dev 用于限制函数在特定流水段执行。
    /// @param expected 调用方期望的状态。
    /// @param actual 合约当前状态。
    /// @custom:example 在非冻结阶段调用 `settle` 会触发此错误。
    error ContestInvalidState(ContestState expected, ContestState actual);
    /// @notice 调用者没有执行对应动作的权限时抛出。
    /// @dev 包含尝试操作的地址以便审计。
    /// @param account 被拒绝的调用者地址。
    /// @custom:example 非 Vault 所有者尝试更新排名时触发。
    error ContestUnauthorized(address account);
    /// @notice 参赛者重复报名时抛出。
    /// @dev `register` 会检查是否已有 Vault 绑定。
    /// @param participant 尝试重复报名的参赛者地址。
    /// @custom:example 同一地址第二次调用 `register`。
    error ContestAlreadyRegistered(address participant);
    /// @notice 报名人数已达上限时抛出。
    /// @dev 在注册阶段检查 `participantCount` 是否超过 `maxParticipants`。
    /// @param limit 最大允许参赛人数。
    /// @custom:example 第 `limit + 1` 位参赛者报名时触发。
    error ContestMaxParticipantsReached(uint16 limit);
    /// @notice 报名截止后仍尝试注册时抛出。
    /// @dev 包含截止时间和当前时间，便于确认延迟原因。
    /// @param deadline 报名截止时间戳。
    /// @param currentTimestamp 当前区块时间戳。
    /// @custom:example 报名窗口关闭后调用 `register`。
    error ContestRegistrationClosedError(uint64 deadline, uint64 currentTimestamp);
    /// @notice 参赛者余额不足以覆盖报名金额时抛出。
    /// @dev 会在调用 `balanceOf` 后进行比较。
    /// @param balance 参赛者当前余额。
    /// @param required 报名所需余额。
    /// @custom:example 报名资产余额小于配置值时触发。
    error ContestInsufficientStake(uint256 balance, uint256 required);
    /// @notice 参赛者授权额度不足时抛出。
    /// @dev 在调用 `allowance` 后发现小于报名金额。
    /// @param allowance 当前授权额度。
    /// @param required 需要的授权额度。
    /// @custom:example 用户未提前授权或授权额度不够。
    error ContestInsufficientAllowance(uint256 allowance, uint256 required);
    /// @notice 传入的 Vault 地址不属于本比赛时抛出。
    /// @dev 主要用于各种查询、奖励流程的校验。
    /// @param vault 未识别的 Vault 地址。
    /// @custom:example 在 `_claim` 中根据 vaultId 找不到地址时触发。
    error ContestUnknownVault(address vault);
    /// @notice 比赛尚未到达冻结时间便尝试冻结时抛出。
    /// @dev 附带理应结束的时间与当前时间。
    /// @param liveEnds 实盘阶段结束时间戳。
    /// @param currentTimestamp 当前区块时间戳。
    /// @custom:example 运营提前调用 `freeze` 导致出错。
    error ContestFreezeTooEarly(uint64 liveEnds, uint64 currentTimestamp);
    /// @notice 根据地址或 Vault ID 未找到参赛者时抛出。
    /// @dev 报名阶段之前或重复调用时常见。
    /// @param participant 未登记的参赛者地址。
    /// @custom:example 未报名的地址调用 `claim`。
    error ContestParticipantUnknown(address participant);
    /// @notice 尚有 Vault 未结算时抛出。
    /// @dev 防止在排名或密封阶段之前提前结束流程。
    /// @custom:example 尝试更新排行榜但仍有 Vault 未结算。
    error ContestSettlementPending();
    /// @notice Vault 已领取奖励后重复领取时抛出。
    /// @dev `_claim` 与 `exit` 均会检查奖励状态。
    /// @param vaultId 已领奖的 Vault 标识。
    /// @custom:example 已领取奖金的参赛者再次调用 `claim`。
    error ContestRewardAlreadyClaimed(bytes32 vaultId);
    /// @notice Vault 不符合领取奖励或退出资格时抛出。
    /// @dev 包括排名不在 `topK` 或奖励比例为 0 的情况。
    /// @param vaultId 不满足条件的 Vault 标识。
    /// @custom:example 排名未上榜的参赛者调用 `claim`。
    error ContestNotEligibleForReward(bytes32 vaultId);
    /// @notice Vault 当前无法执行资产提取时抛出。
    /// @dev 主要用于防止重复 withdraw。
    /// @param vaultId 被阻止的 Vault 标识。
    /// @custom:example Vault 资产已全部提取后再次调用 `exit`。
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

    /// @notice 初始化比赛合约并预置未初始化状态。
    /// @dev 部署者默认成为临时所有者，随后会在 `initialize` 中转移。
    /// @custom:error 无
    /// @custom:example 部署脚本在创建合约后立即调用 `initialize`。
    constructor() Ownable(msg.sender) {
        state = ContestState.Uninitialized;
    }

    /// @notice 配置比赛基础参数并开启报名阶段。
    /// @dev 仅允许调用一次，完成后会将所有权交给提供的 `owner`。
    /// @param params 初始化所需的配置、时间线、奖金分配与依赖地址。
    /// @custom:error ContestAlreadyInitialized 重复初始化。
    /// @custom:error ContestInvalidParam 参数不符合约束或缺失。
    /// @custom:example 部署流程完成后调用以设置报名资产、Vault 工厂与时间线。
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

    /// @notice 基于当前区块时间推进比赛状态。
    /// @dev 超过报名截止后会自动切换至 `Live` 并触发相关事件。
    /// @custom:error 无
    /// @custom:example 前端轮询调用以确认比赛是否进入实盘阶段。
    function syncState() public {
        if (state == ContestState.Registering && uint64(block.timestamp) > timeline.registeringEnds) {
            state = ContestState.Live;
            emit ContestRegistrationClosed(contestId, timeline.registeringEnds);
            emit ContestLiveStarted(contestId, timeline.liveEnds);
        }
    }

    /// @notice 在实盘阶段结束后冻结比赛，阻止进一步交易。
    /// @dev 调用前会先同步状态，需等待 `timeline.liveEnds` 之后。
    /// @custom:error ContestInvalidState 当前状态不是 Live。
    /// @custom:error ContestFreezeTooEarly 当前仍在实盘窗口内。
    /// @custom:example 运营在比赛结束后调用以进入结算模式。
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

    /// @notice 为指定参赛者触发 Vault 结算并返回净值与收益率。
    /// @dev 仅在冻结阶段可用，会写入内部结算记录并触发事件。
    /// @param participant 参赛者钱包地址。
    /// @return nav 最新净值金额，单位与报名资产一致。
    /// @return roiBps 净值对应的收益率（基点）。
    /// @custom:error ContestInvalidState 当前状态不是 Frozen。
    /// @custom:error ContestParticipantUnknown 未找到参赛者或 Vault。
    /// @custom:error ContestUnknownVault 结算时无法定位 Vault 地址。
    /// @custom:example 结算服务遍历 `_participants` 调用以计算奖励。
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

    /// @notice 返回当前比赛的配置参数。
    /// @dev 用于前端或 Vault 获取资产、工厂、价格源等信息。
    /// @return config_ 比赛配置对象。
    /// @custom:error 无
    /// @custom:example Vault.swapExact 读取配置确认价格源与池地址。
    function getConfig() external view returns (ContestConfig memory config_) {
        return config;
    }

    /// @notice 返回比赛的关键时间节点。
    /// @dev 供前端展示或 Vault 校验交易窗口使用。
    /// @return timeline_ 包含报名、实盘、领奖截止的时间戳。
    /// @custom:error 无
    /// @custom:example Vault.swapExact 在交易前确认仍处于 Live 窗口。
    function getTimeline() external view returns (ContestTimeline memory timeline_) {
        return timeline;
    }

    /// @notice 查询 Vault 对应的 ID 与所有者。
    /// @dev 会校验 Vault 是否属于本比赛。
    /// @param vault Vault 合约地址。
    /// @return vaultId 对应的参赛者 Vault 标识。
    /// @return owner Vault 对应参赛者地址。
    /// @custom:error ContestUnknownVault 传入地址未注册。
    /// @custom:example Vault 在交换前调用用于权限校验。
    function getVaultContext(address vault) external view returns (bytes32 vaultId, address owner) {
        vaultId = vaultIdsByAddress[vault];
        if (vaultId == bytes32(0)) {
            revert ContestUnknownVault(vault);
        }
        owner = vaultOwners[vaultId];
    }

    /// @notice 报名参赛并部署个人 Vault。
    /// @dev 将报名资产从参赛者转移至新 Vault，并记录参与人数。
    /// @return vaultId 新分配的 Vault 标识符。
    /// @custom:error ContestInvalidState 当前不在 Registering 状态。
    /// @custom:error ContestRegistrationClosedError 报名已截止。
    /// @custom:error ContestAlreadyRegistered 参赛者已报名。
    /// @custom:error ContestMaxParticipantsReached 报名人数达到上限。
    /// @custom:error ContestInsufficientAllowance 授权额度不足。
    /// @custom:error ContestInsufficientStake 账户余额不足。
    /// @custom:example 新参赛者批准资产后调用以加入比赛。
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

    /// @notice 写入最新排行榜并同步每个 Vault 的排名。
    /// @dev 要求比赛已冻结且所有 Vault 结算完成，输入按净值降序。
    /// @param updates 结算服务计算后的排行榜条目列表。
    /// @custom:error ContestInvalidState 当前状态不是 Frozen。
    /// @custom:error ContestSettlementPending 有 Vault 未结算。
    /// @custom:error ContestInvalidParam 更新参数不合法（长度、排序或数据不一致）。
    /// @custom:error ContestUnknownVault 排行榜条目的 Vault 未登记。
    /// @custom:example 结算离线程序计算排序后调用以同步排名。
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

    /// @notice 返回当前缓存的排行榜数据。
    /// @dev 复制内部数组，供前端或分析工具读取。
    /// @return leaders_ 排行榜条目列表。
    /// @custom:error 无
    /// @custom:example 前端界面调用以展示排行榜。
    function getLeaders() external view returns (LeaderboardEntry[] memory leaders_) {
        uint256 length = _leaders.length;
        leaders_ = new LeaderboardEntry[](length);
        for (uint256 i = 0; i < length; i++) {
            leaders_[i] = _leaders[i];
        }
    }

    /// @notice 在所有 Vault 结算完成后进入密封阶段。
    /// @dev 成功后触发 `ContestSealed`，后续只允许领奖与退出。
    /// @custom:error ContestInvalidState 当前状态不是 Frozen。
    /// @custom:error ContestSettlementPending 仍有 Vault 未结算。
    /// @custom:example 运营确认全部结算后调用，开启领奖窗口。
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

    /// @notice 参赛者在密封阶段领取个人奖金。
    /// @dev 内部调用 `_claim` 校验排名、奖励比例与 Vault 状态。
    /// @return prizeAmount 本次发放的基础资产金额。
    /// @custom:error ContestInvalidState 当前状态不是 Sealed。
    /// @custom:error ContestInvalidParam 收款人地址无效。
    /// @custom:error ContestParticipantUnknown 未找到参赛者登记。
    /// @custom:error ContestSettlementPending Vault 尚未结算。
    /// @custom:error ContestRewardAlreadyClaimed Vault 已领奖。
    /// @custom:error ContestUnknownVault Vault 地址缺失。
    /// @custom:error ContestWithdrawalUnavailable Vault 已提空资产。
    /// @custom:error ContestNotEligibleForReward 排名不在奖励范围内。
    /// @custom:example 冠军在密封阶段调用领取奖金。
    function claim() external nonReentrant returns (uint256 prizeAmount) {
        return _claim(msg.sender, msg.sender);
    }

    /// @notice 代理参赛者领取奖金并转账至其地址。
    /// @dev 与 `claim` 共用校验逻辑，适用于托管或运营代领场景。
    /// @param participant 被代理的参赛者地址。
    /// @return prizeAmount 本次发放的基础资产金额。
    /// @custom:error ContestInvalidState 当前状态不是 Sealed。
    /// @custom:error ContestInvalidParam 收款人地址无效。
    /// @custom:error ContestParticipantUnknown 未找到参赛者登记。
    /// @custom:error ContestSettlementPending Vault 尚未结算。
    /// @custom:error ContestRewardAlreadyClaimed Vault 已领奖。
    /// @custom:error ContestUnknownVault Vault 地址缺失。
    /// @custom:error ContestWithdrawalUnavailable Vault 已提空资产。
    /// @custom:error ContestNotEligibleForReward 排名不在奖励范围内。
    /// @custom:example 运营批量为获奖者领取奖金并发放。
    function claimFor(address participant) external nonReentrant returns (uint256 prizeAmount) {
        return _claim(participant, participant);
    }

    /// @notice 在密封阶段提取 Vault 余额以完成退出。
    /// @dev 限制仅参赛者本人调用，且需 Vault 已结算且未领奖。
    /// @custom:error ContestInvalidState 当前状态不是 Sealed。
    /// @custom:error ContestParticipantUnknown 未登记参赛者。
    /// @custom:error ContestSettlementPending Vault 尚未结算。
    /// @custom:error ContestRewardAlreadyClaimed Vault 已领奖。
    /// @custom:error ContestUnknownVault Vault 地址缺失。
    /// @custom:error ContestWithdrawalUnavailable Vault 已提空资产。
    /// @custom:error ContestNotEligibleForReward 排名仍在奖励名次内。
    /// @custom:example 未获奖参赛者在结果公示后退出并取回资产。
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

    /// @notice 根据索引返回参赛者地址。
    /// @dev 为前端分页或离线处理提供便利。
    /// @param index 参赛者索引，从 0 开始。
    /// @return participant 参赛者地址。
    /// @custom:error 无
    /// @custom:example 后台定期遍历参赛者并更新统计。
    function participantAt(uint256 index) external view returns (address participant) {
        return _participants[index];
    }

    /// @notice 获取当前参赛者总数。
    /// @dev 与 `participantAt` 配合实现分页。
    /// @return length 参赛者数量。
    /// @custom:error 无
    /// @custom:example 前端根据该值限制分页末尾。
    function participantsLength() external view returns (uint256 length) {
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
