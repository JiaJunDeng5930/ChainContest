# Public Interfaces Coverage

汇总 `contracts/src` 目录内全部 `public` / `external` 函数、事件与错误，供后续补齐中文 NatSpec 时逐项勾选。

## Contest.sol

### Interface IVaultFactory
- [X] function `deployVault(address participant, uint256 entryAmount) external returns (address)`
- [X] function `predictVaultAddress(address participant) external view returns (address)`

### Interface IVaultInitializer
- [X] function `initialize(address owner, address contest, uint256 entryAmount) external`

### Interface IVault
- [X] function `baseAsset() external view returns (IERC20)`
- [X] function `quoteAsset() external view returns (IERC20)`
- [X] function `syncBalances(uint256 baseBalance, uint256 quoteBalance) external`
- [X] function `finalizeSettlement(uint256 nav, int32 roiBps) external`
- [X] function `isSettled() external view returns (bool)`
- [X] function `baseBalance() external view returns (uint256)`
- [X] function `quoteBalance() external view returns (uint256)`
- [X] function `withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external`
- [X] function `withdrawn() external view returns (bool)`
- [X] function `updateRank(uint16 rank) external`
- [X] function `score() external view returns (uint256 nav, int32 roiBps, uint16 rank)`

### Contract Contest
- [X] function `initialize(InitializeParams calldata params) external`
- [X] function `syncState() public`
- [X] function `freeze() external`
- [X] function `settle(address participant) external returns (uint256 nav, int32 roiBps)`
- [X] function `getConfig() external view returns (ContestConfig memory)`
- [X] function `getTimeline() external view returns (ContestTimeline memory)`
- [X] function `getVaultContext(address vault) external view returns (bytes32 vaultId, address owner)`
- [X] function `register() external whenNotPaused nonReentrant returns (bytes32 vaultId)`
- [X] function `updateLeaders(LeaderboardUpdate[] calldata updates) external`
- [X] function `getLeaders() external view returns (LeaderboardEntry[] memory leaders_)`
- [X] function `seal() external`
- [X] function `claim() external nonReentrant returns (uint256 prizeAmount)`
- [X] function `claimFor(address participant) external nonReentrant returns (uint256 prizeAmount)`
- [X] function `exit() external nonReentrant`
- [X] function `participantAt(uint256 index) external view returns (address)`
- [X] function `participantsLength() external view returns (uint256)`

#### Events
- [X] event `ContestInitialized(bytes32 indexed contestId, ContestConfig config, ContestTimeline timeline, uint16[32] payoutSchedule, address indexed vaultImplementation, address indexed priceSource)`
- [X] event `ContestRegistered(bytes32 indexed contestId, address indexed participant, address vault, uint256 amount)`
- [X] event `ContestRegistrationClosed(bytes32 indexed contestId, uint64 registeringEnds)`
- [X] event `ContestLiveStarted(bytes32 indexed contestId, uint64 liveEnds)`
- [X] event `ContestFrozen(bytes32 indexed contestId, uint64 frozenAt)`
- [X] event `VaultSettled(bytes32 indexed vaultId, uint256 nav, int32 roiBps)`
- [X] event `LeadersUpdated(bytes32 indexed contestId, bytes32[] vaultIds, uint32 heapVersion)`
- [X] event `ContestSealed(bytes32 indexed contestId, uint64 sealedAt)`
- [X] event `RewardClaimed(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 amount)`
- [X] event `VaultExited(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 baseReturned, uint256 quoteReturned)`

#### Errors
- [X] error `ContestAlreadyInitialized()`
- [X] error `ContestInvalidParam(string field)`
- [X] error `ContestInvalidState(ContestState expected, ContestState actual)`
- [X] error `ContestUnauthorized(address account)`
- [X] error `ContestAlreadyRegistered(address participant)`
- [X] error `ContestMaxParticipantsReached(uint16 limit)`
- [X] error `ContestRegistrationClosedError(uint64 deadline, uint64 currentTimestamp)`
- [X] error `ContestInsufficientStake(uint256 balance, uint256 required)`
- [X] error `ContestInsufficientAllowance(uint256 allowance, uint256 required)`
- [X] error `ContestUnknownVault(address vault)`
- [X] error `ContestFreezeTooEarly(uint64 liveEnds, uint64 currentTimestamp)`
- [X] error `ContestParticipantUnknown(address participant)`
- [X] error `ContestSettlementPending()`
- [X] error `ContestRewardAlreadyClaimed(bytes32 vaultId)`
- [X] error `ContestNotEligibleForReward(bytes32 vaultId)`
- [X] error `ContestWithdrawalUnavailable(bytes32 vaultId)`

## VaultFactory.sol

### Interface IVaultInitializer
- [X] function `initialize(address owner, address contest, uint256 entryAmount) external`

### Contract VaultFactory
- [X] function `setImplementation(address newImplementation) external`
- [X] function `setContest(address newContest) external`
- [X] function `predictVaultAddress(address participant) public view returns (address predicted)`
- [X] function `deployVault(address participant, uint256 entryAmount) external returns (address vault)`

#### Events
- [X] event `VaultImplementationUpdated(address indexed previousImplementation, address indexed newImplementation)`
- [X] event `ContestAddressUpdated(address indexed previousContest, address indexed newContest)`
- [X] event `VaultDeployed(bytes32 indexed vaultId, address indexed participant, address vault, uint256 entryAmount)`

#### Errors
- [X] error `VaultFactoryInvalidImplementation()`
- [X] error `VaultFactoryInvalidContest()`
- [X] error `VaultFactoryInvalidParticipant()`
- [X] error `VaultFactoryInvalidEntryAmount()`
- [X] error `VaultFactoryUnauthorized(address account)`

## Vault.sol

### Interface IContestMinimal
- [X] function `state() external view returns (ContestState)`
- [X] function `getTimeline() external view returns (ContestTimeline memory)`
- [X] function `getConfig() external view returns (ContestConfig memory)`
- [X] function `getVaultContext(address vault) external view returns (bytes32 vaultId, address owner)`

### Contract Vault
- [X] function `initialize(address owner_, address contest_, uint256 entryAmount) external`
- [X] function `pause() external`
- [X] function `unpause() external`
- [X] function `syncBalances(uint256 baseBalance_, uint256 quoteBalance_) external`
- [X] function `finalizeSettlement(uint256 nav, int32 roiBps) external`
- [X] function `updateRank(uint16 rank) external`
- [X] function `withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external`
- [X] function `swapExact(uint256 amountIn, uint256 minAmountOut, bool swapBaseForQuote, uint256 deadline) external returns (uint256 amountOut, int32 priceImpactBps)`
- [X] function `uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external`

#### Events
- [X] event `VaultInitialized(address indexed contest, address indexed owner, uint256 entryAmount)`
- [X] event `VaultSwapped(address indexed contest, address indexed participant, address indexed pool, IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn, uint256 amountOut, uint256 twap, int32 priceImpactBps)`
- [X] event `VaultSettled(address indexed contest, uint256 nav, int32 roiBps, uint16 rank)`
- [X] event `VaultWithdrawn(address indexed contest, address indexed participant, uint256 baseAmount, uint256 quoteAmount)`

#### Errors
- [X] error `VaultAlreadyInitialized()`
- [X] error `VaultUnauthorized(address account)`
- [X] error `VaultInvalidParameter(string field)`
- [X] error `VaultWithdrawForbidden()`
- [X] error `VaultSwapInvalidState(uint8 state)`
- [X] error `VaultSwapExpired(uint256 deadline, uint256 current)`
- [X] error `VaultSwapInsufficientOutput(uint256 amountOut, uint256 minAmountOut)`
- [X] error `VaultUnknownPool(address pool)`
- [X] error `VaultAlreadySettled()`

## PriceSource.sol

### Contract PriceSource
- [X] function `configure(address pool_, uint32 twapSeconds_) external`
- [X] function `update() public returns (Snapshot memory snap)`
- [X] function `getTwapTick() public returns (int24 meanTick)`
- [X] function `lastSnapshot() external view returns (Snapshot memory)`
- [X] function `requireWithinTolerance(uint256 amountIn, uint256 amountOut, bool zeroForOne, uint16 toleranceBps) external returns (int32 priceImpactBps, uint256 priceE18)`
- [X] function `previewPriceImpact(uint256 amountIn, uint256 amountOut, bool zeroForOne) external view returns (int32 priceImpactBps)`

#### Events
- [X] event `PriceSourceConfigured(address indexed pool, uint32 twapSeconds)`
- [X] event `PriceUpdated(int24 meanTick, uint160 sqrtPriceX96, uint256 priceE18, uint64 updatedAt)`

#### Errors
- [X] error `PriceSourceInvalidParameter(string field)`
- [X] error `PriceSourceNotConfigured()`
- [X] error `PriceSourceSnapshotStale(uint64 updatedAt, uint64 currentTimestamp)`
- [X] error `PriceSourcePriceOutOfTolerance(int32 priceImpactBps, uint16 toleranceBps)`

## mocks/MockERC20.sol

### Contract MockERC20
- [X] function `decimals() public view returns (uint8)`
- [X] function `mint(address to, uint256 amount) external`

## mocks/MockUniswapV3Pool.sol

### Contract MockUniswapV3Pool
- [X] function `setTick(int24 tick_) external`
- [X] function `observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory)`
- [X] function `slot0() external view returns (uint160 sqrtPriceX96, int24 tick_, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)`
- [X] function `swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data) external returns (int256 amount0, int256 amount1)`
