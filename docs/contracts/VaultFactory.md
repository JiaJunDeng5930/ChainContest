> ⚙️**自动生成文档**
> - 提交哈希：858be976e9e1aa1504f81b1bc6fd2c77bc44fdb0
> - 生成时间 (UTC)：2025-10-10T13:34:22.954Z
> - 命令：pnpm --filter contracts docs:generate


# Solidity API

## IVaultInitializer

<a id="ivault-initializer-function-initialize"></a>
### 函数 initialize

```solidity
function initialize(address owner, address contest, uint256 entryAmount) external
```

**功能概述：** 初始化新部署的 Vault 并绑定 Contest。

**开发说明：** 工厂在克隆后立即调用，Vault 需校验来路。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| owner | address | Vault 所有者（参赛者）。 |
| contest | address | Contest 合约地址。 |
| entryAmount | uint256 | 报名金额，需与 Vault 余额一致。 |

#### 可能抛出的错误
无

#### 调用示例
`VaultFactory.deployVault` 在克隆完成后调用。

## VaultFactory

### implementation

```solidity
address implementation
```

返回当前使用的 Vault 实现实例地址。

_用于 `Clones` 工厂创建新的 Vault。_

### contest

```solidity
address contest
```

返回被授权调用工厂的 Contest 地址。

_仅该地址可以创建新的 Vault。_

<a id="vault-factory-event-vault-implementation-updated"></a>
### 事件 VaultImplementationUpdated

```solidity
event VaultImplementationUpdated(address previousImplementation, address newImplementation)
```

**事件说明：** Vault 实现地址更新时广播旧值与新值。

**补充信息：** 仅所有者可触发。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| previousImplementation | address | 原实现地址。 |
| newImplementation | address | 新实现地址。 |

#### 示例
迭代升级 Vault 逻辑时触发事件。

<a id="vault-factory-event-contest-address-updated"></a>
### 事件 ContestAddressUpdated

```solidity
event ContestAddressUpdated(address previousContest, address newContest)
```

**事件说明：** Contest 地址变更时广播。

**补充信息：** 确保只有新的 Contest 可以部署 Vault。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| previousContest | address | 原 Contest 地址。 |
| newContest | address | 新 Contest 地址。 |

#### 示例
部署第二场比赛后更新绑定时触发。

<a id="vault-factory-event-vault-deployed"></a>
### 事件 VaultDeployed

```solidity
event VaultDeployed(bytes32 vaultId, address participant, address vault, uint256 entryAmount)
```

**事件说明：** 记录新 Vault 部署情况与报名金额。

**补充信息：** 参赛者地址与生成的 Vault ID 会同时写入事件。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vaultId | bytes32 | Vault 唯一标识符。 |
| participant | address | 参赛者地址。 |
| vault | address | 新部署的 Vault 地址。 |
| entryAmount | uint256 | 报名金额。 |

#### 示例
Contest.register 新参赛者时触发。

<a id="vault-factory-error-vault-factory-invalid-implementation"></a>
### 错误 VaultFactoryInvalidImplementation

```solidity
error VaultFactoryInvalidImplementation()
```

**触发场景：** 工厂实现地址无效时抛出。

**开发说明：** 地址为零或未设置时触发。

#### 示例
初始化参数缺失实现地址。

<a id="vault-factory-error-vault-factory-invalid-contest"></a>
### 错误 VaultFactoryInvalidContest

```solidity
error VaultFactoryInvalidContest()
```

**触发场景：** Contest 地址无效时抛出。

**开发说明：** 地址为零或未授权时触发。

#### 示例
构造函数或更新操作传入零地址。

<a id="vault-factory-error-vault-factory-invalid-participant"></a>
### 错误 VaultFactoryInvalidParticipant

```solidity
error VaultFactoryInvalidParticipant()
```

**触发场景：** 参赛者地址无效时抛出。

**开发说明：** 防止部署匿名 Vault。

#### 示例
Contest 传入零地址部署 Vault。

<a id="vault-factory-error-vault-factory-invalid-entry-amount"></a>
### 错误 VaultFactoryInvalidEntryAmount

```solidity
error VaultFactoryInvalidEntryAmount()
```

**触发场景：** 报名金额无效时抛出。

**开发说明：** 需要正数金额才能部署 Vault。

#### 示例
Contest 传入 0 金额部署。

<a id="vault-factory-error-vault-factory-unauthorized"></a>
### 错误 VaultFactoryUnauthorized

```solidity
error VaultFactoryUnauthorized(address account)
```

**触发场景：** 非 Contest 地址尝试部署 Vault 时抛出。

**开发说明：** 保护工厂仅由授权比赛使用。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| account | address | 未授权调用者。 |

#### 示例
其他合约误调用 `deployVault`。

### onlyContest

```solidity
modifier onlyContest()
```

<a id="vault-factory-function-constructor"></a>
### 函数 constructor

```solidity
constructor(address implementation_, address contest_) public
```

**功能概述：** 部署工厂并设置初始 Vault 实现与 Contest。

**开发说明：** 将部署者设为所有者，可后续更新实现或 Contest。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| implementation_ | address | 初始 Vault 实现合约地址。 |
| contest_ | address | 授权部署 Vault 的 Contest 地址。 |

#### 可能抛出的错误
VaultFactoryInvalidImplementation 实现地址为空。
VaultFactoryInvalidContest Contest 地址为空。

#### 调用示例
部署流程中由治理合约调用以初始化工厂。

<a id="vault-factory-function-set-implementation"></a>
### 函数 setImplementation

```solidity
function setImplementation(address newImplementation) external
```

**功能概述：** 更新工厂使用的 Vault 实现地址。

**开发说明：** 仅所有者可调用，更新后触发事件。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| newImplementation | address | 新的 Vault 实现地址。 |

#### 可能抛出的错误
VaultFactoryInvalidImplementation 提供了零地址。
VaultFactoryUnauthorized 调用者非所有者（由修饰符保证）。

#### 调用示例
Vault 合约升级后同步最新实现。

<a id="vault-factory-function-set-contest"></a>
### 函数 setContest

```solidity
function setContest(address newContest) external
```

**功能概述：** 更新被授权部署 Vault 的 Contest 地址。

**开发说明：** 确保新地址有效并触发事件通知监听者。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| newContest | address | 新 Contest 合约地址。 |

#### 可能抛出的错误
VaultFactoryInvalidContest 提供了零地址。
VaultFactoryUnauthorized 调用者非所有者（由修饰符保证）。

#### 调用示例
新一届比赛上线后更换 Contest。

<a id="vault-factory-function-predict-vault-address"></a>
### 函数 predictVaultAddress

```solidity
function predictVaultAddress(address participant) public view returns (address predicted)
```

**功能概述：** 根据参赛者地址预测未来部署的 Vault 地址。

**开发说明：** 使用 Clone 可预测地址公式，包含 Contest 与实现地址。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | 参赛者地址。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| predicted | address | 预计生成的 Vault 地址。 |

#### 可能抛出的错误
VaultFactoryInvalidImplementation 实现地址未设置。

#### 调用示例
前端在报名前预先计算授权目标地址。

<a id="vault-factory-function-deploy-vault"></a>
### 函数 deployVault

```solidity
function deployVault(address participant, uint256 entryAmount) external returns (address vault)
```

**功能概述：** 克隆新的 Vault 并广播部署信息。

**开发说明：** 仅 Contest 调用；返回地址需立即初始化。

#### 参数

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| participant | address | Vault 所属参赛者地址。 |
| entryAmount | uint256 | 报名金额，用于生成事件日志。 |

#### 返回值

| 名称 | 类型 | 说明 |
| ---- | ---- | ---- |
| vault | address | 刚部署的 Vault 地址。 |

#### 可能抛出的错误
VaultFactoryUnauthorized 调用者不是 Contest。
VaultFactoryInvalidParticipant 参赛者地址为空。
VaultFactoryInvalidEntryAmount 报名金额为 0。

#### 调用示例
Contest.register 在报名成功后部署新 Vault。
