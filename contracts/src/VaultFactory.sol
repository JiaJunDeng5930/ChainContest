// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface IVaultInitializer {
    /// @notice 初始化新部署的 Vault 并绑定 Contest。
    /// @dev 工厂在克隆后立即调用，Vault 需校验来路。
    /// @param owner Vault 所有者（参赛者）。
    /// @param contest Contest 合约地址。
    /// @param entryAmount 报名金额，需与 Vault 余额一致。
    /// @custom:error 无
    /// @custom:example `VaultFactory.deployVault` 在克隆完成后调用。
    function initialize(address owner, address contest, uint256 entryAmount) external;
}

contract VaultFactory is Ownable2Step {
    /// @notice 返回当前使用的 Vault 实现实例地址。
    /// @dev 用于 `Clones` 工厂创建新的 Vault。
    /// @custom:error 无
    /// @custom:example 运维脚本检查部署配置是否正确。
    address public implementation;
    /// @notice 返回被授权调用工厂的 Contest 地址。
    /// @dev 仅该地址可以创建新的 Vault。
    /// @custom:error 无
    /// @custom:example Contest 更新后需要同步该地址。
    address public contest;

    /// @notice Vault 实现地址更新时广播旧值与新值。
    /// @dev 仅所有者可触发。
    /// @param previousImplementation 原实现地址。
    /// @param newImplementation 新实现地址。
    /// @custom:example 迭代升级 Vault 逻辑时触发事件。
    event VaultImplementationUpdated(address indexed previousImplementation, address indexed newImplementation);
    /// @notice Contest 地址变更时广播。
    /// @dev 确保只有新的 Contest 可以部署 Vault。
    /// @param previousContest 原 Contest 地址。
    /// @param newContest 新 Contest 地址。
    /// @custom:example 部署第二场比赛后更新绑定时触发。
    event ContestAddressUpdated(address indexed previousContest, address indexed newContest);
    /// @notice 记录新 Vault 部署情况与报名金额。
    /// @dev 参赛者地址与生成的 Vault ID 会同时写入事件。
    /// @param vaultId Vault 唯一标识符。
    /// @param participant 参赛者地址。
    /// @param vault 新部署的 Vault 地址。
    /// @param entryAmount 报名金额。
    /// @custom:example Contest.register 新参赛者时触发。
    event VaultDeployed(bytes32 indexed vaultId, address indexed participant, address vault, uint256 entryAmount);

    /// @notice 工厂实现地址无效时抛出。
    /// @dev 地址为零或未设置时触发。
    /// @custom:example 初始化参数缺失实现地址。
    error VaultFactoryInvalidImplementation();
    /// @notice Contest 地址无效时抛出。
    /// @dev 地址为零或未授权时触发。
    /// @custom:example 构造函数或更新操作传入零地址。
    error VaultFactoryInvalidContest();
    /// @notice 参赛者地址无效时抛出。
    /// @dev 防止部署匿名 Vault。
    /// @custom:example Contest 传入零地址部署 Vault。
    error VaultFactoryInvalidParticipant();
    /// @notice 报名金额无效时抛出。
    /// @dev 需要正数金额才能部署 Vault。
    /// @custom:example Contest 传入 0 金额部署。
    error VaultFactoryInvalidEntryAmount();
    /// @notice 非 Contest 地址尝试部署 Vault 时抛出。
    /// @dev 保护工厂仅由授权比赛使用。
    /// @param account 未授权调用者。
    /// @custom:example 其他合约误调用 `deployVault`。
    error VaultFactoryUnauthorized(address account);

    modifier onlyContest() {
        if (msg.sender != contest) {
            revert VaultFactoryUnauthorized(msg.sender);
        }
        _;
    }

    /// @notice 部署工厂并设置初始 Vault 实现与 Contest。
    /// @dev 将部署者设为所有者，可后续更新实现或 Contest。
    /// @param implementation_ 初始 Vault 实现合约地址。
    /// @param contest_ 授权部署 Vault 的 Contest 地址。
    /// @custom:error VaultFactoryInvalidImplementation 实现地址为空。
    /// @custom:error VaultFactoryInvalidContest Contest 地址为空。
    /// @custom:example 部署流程中由治理合约调用以初始化工厂。
    constructor(address implementation_, address contest_) Ownable(msg.sender) {
        if (implementation_ == address(0)) {
            revert VaultFactoryInvalidImplementation();
        }
        if (contest_ == address(0)) {
            revert VaultFactoryInvalidContest();
        }
        implementation = implementation_;
        contest = contest_;
    }

    /// @notice 更新工厂使用的 Vault 实现地址。
    /// @dev 仅所有者可调用，更新后触发事件。
    /// @param newImplementation 新的 Vault 实现地址。
    /// @custom:error VaultFactoryInvalidImplementation 提供了零地址。
    /// @custom:error VaultFactoryUnauthorized 调用者非所有者（由修饰符保证）。
    /// @custom:example Vault 合约升级后同步最新实现。
    function setImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) {
            revert VaultFactoryInvalidImplementation();
        }
        address previous = implementation;
        implementation = newImplementation;
        emit VaultImplementationUpdated(previous, newImplementation);
    }

    /// @notice 更新被授权部署 Vault 的 Contest 地址。
    /// @dev 确保新地址有效并触发事件通知监听者。
    /// @param newContest 新 Contest 合约地址。
    /// @custom:error VaultFactoryInvalidContest 提供了零地址。
    /// @custom:error VaultFactoryUnauthorized 调用者非所有者（由修饰符保证）。
    /// @custom:example 新一届比赛上线后更换 Contest。
    function setContest(address newContest) external onlyOwner {
        if (newContest == address(0)) {
            revert VaultFactoryInvalidContest();
        }
        address previous = contest;
        contest = newContest;
        emit ContestAddressUpdated(previous, newContest);
    }

    /// @notice 根据参赛者地址预测未来部署的 Vault 地址。
    /// @dev 使用 Clone 可预测地址公式，包含 Contest 与实现地址。
    /// @param participant 参赛者地址。
    /// @return predicted 预计生成的 Vault 地址。
    /// @custom:error VaultFactoryInvalidImplementation 实现地址未设置。
    /// @custom:example 前端在报名前预先计算授权目标地址。
    function predictVaultAddress(address participant) public view returns (address predicted) {
        if (implementation == address(0)) {
            revert VaultFactoryInvalidImplementation();
        }
        bytes32 salt = keccak256(abi.encode(participant, contest, implementation));
        predicted = Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    /// @notice 克隆新的 Vault 并广播部署信息。
    /// @dev 仅 Contest 调用；返回地址需立即初始化。
    /// @param participant Vault 所属参赛者地址。
    /// @param entryAmount 报名金额，用于生成事件日志。
    /// @return vault 刚部署的 Vault 地址。
    /// @custom:error VaultFactoryUnauthorized 调用者不是 Contest。
    /// @custom:error VaultFactoryInvalidParticipant 参赛者地址为空。
    /// @custom:error VaultFactoryInvalidEntryAmount 报名金额为 0。
    /// @custom:example Contest.register 在报名成功后部署新 Vault。
    function deployVault(address participant, uint256 entryAmount) external onlyContest returns (address vault) {
        if (participant == address(0)) {
            revert VaultFactoryInvalidParticipant();
        }
        if (entryAmount == 0) {
            revert VaultFactoryInvalidEntryAmount();
        }
        bytes32 salt = keccak256(abi.encode(participant, contest, implementation));
        vault = Clones.cloneDeterministic(implementation, salt);
        emit VaultDeployed(keccak256(abi.encode(contest, participant)), participant, vault, entryAmount);
    }
}
