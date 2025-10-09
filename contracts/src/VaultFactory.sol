// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface IVaultInitializer {
    function initialize(address owner, address contest, uint256 entryAmount) external;
}

contract VaultFactory is Ownable2Step {
    address public implementation;
    address public contest;

    event VaultImplementationUpdated(address indexed previousImplementation, address indexed newImplementation);
    event ContestAddressUpdated(address indexed previousContest, address indexed newContest);
    event VaultDeployed(bytes32 indexed vaultId, address indexed participant, address vault, uint256 entryAmount);

    error VaultFactoryInvalidImplementation();
    error VaultFactoryInvalidContest();
    error VaultFactoryInvalidParticipant();
    error VaultFactoryInvalidEntryAmount();
    error VaultFactoryUnauthorized(address account);

    modifier onlyContest() {
        if (msg.sender != contest) {
            revert VaultFactoryUnauthorized(msg.sender);
        }
        _;
    }

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

    function setImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) {
            revert VaultFactoryInvalidImplementation();
        }
        address previous = implementation;
        implementation = newImplementation;
        emit VaultImplementationUpdated(previous, newImplementation);
    }

    function setContest(address newContest) external onlyOwner {
        if (newContest == address(0)) {
            revert VaultFactoryInvalidContest();
        }
        address previous = contest;
        contest = newContest;
        emit ContestAddressUpdated(previous, newContest);
    }

    function predictVaultAddress(address participant) public view returns (address predicted) {
        if (implementation == address(0)) {
            revert VaultFactoryInvalidImplementation();
        }
        bytes32 salt = keccak256(abi.encode(participant, contest, implementation));
        predicted = Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

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
