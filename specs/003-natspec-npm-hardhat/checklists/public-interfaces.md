# Public Interfaces Coverage

汇总 `contracts/src` 目录内全部 `public` / `external` 函数、事件与错误，供后续补齐中文 NatSpec 时逐项勾选。

## Contest.sol

### Interface IVaultFactory
- [ ] function `deployVault(address participant, uint256 entryAmount) external returns (address)`
- [ ] function `predictVaultAddress(address participant) external view returns (address)`

### Interface IVaultInitializer
- [ ] function `initialize(address owner, address contest, uint256 entryAmount) external`

### Interface IVault
- [ ] function `baseAsset() external view returns (IERC20)`
- [ ] function `quoteAsset() external view returns (IERC20)`
- [ ] function `syncBalances(uint256 baseBalance, uint256 quoteBalance) external`
- [ ] function `finalizeSettlement(uint256 nav, int32 roiBps) external`
- [ ] function `isSettled() external view returns (bool)`
- [ ] function `baseBalance() external view returns (uint256)`
- [ ] function `quoteBalance() external view returns (uint256)`
- [ ] function `withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external`
- [ ] function `withdrawn() external view returns (bool)`
- [ ] function `updateRank(uint16 rank) external`
- [ ] function `score() external view returns (uint256 nav, int32 roiBps, uint16 rank)`

### Contract Contest
- [ ] function `initialize(InitializeParams calldata params) external`
- [ ] function `syncState() public`
- [ ] function `freeze() external`
- [ ] function `settle(address participant) external returns (uint256 nav, int32 roiBps)`
- [ ] function `getConfig() external view returns (ContestConfig memory)`
- [ ] function `getTimeline() external view returns (ContestTimeline memory)`
- [ ] function `getVaultContext(address vault) external view returns (bytes32 vaultId, address owner)`
- [ ] function `register() external whenNotPaused nonReentrant returns (bytes32 vaultId)`
- [ ] function `updateLeaders(LeaderboardUpdate[] calldata updates) external`
- [ ] function `getLeaders() external view returns (LeaderboardEntry[] memory leaders_)`
- [ ] function `seal() external`
- [ ] function `claim() external nonReentrant returns (uint256 prizeAmount)`
- [ ] function `claimFor(address participant) external nonReentrant returns (uint256 prizeAmount)`
- [ ] function `exit() external nonReentrant`
- [ ] function `participantAt(uint256 index) external view returns (address)`
- [ ] function `participantsLength() external view returns (uint256)`

#### Events
- [ ] event `ContestInitialized(bytes32 indexed contestId, ContestConfig config, ContestTimeline timeline, uint16[32] payoutSchedule, address indexed vaultImplementation, address indexed priceSource)`
- [ ] event `ContestRegistered(bytes32 indexed contestId, address indexed participant, address vault, uint256 amount)`
- [ ] event `ContestRegistrationClosed(bytes32 indexed contestId, uint64 registeringEnds)`
- [ ] event `ContestLiveStarted(bytes32 indexed contestId, uint64 liveEnds)`
- [ ] event `ContestFrozen(bytes32 indexed contestId, uint64 frozenAt)`
- [ ] event `VaultSettled(bytes32 indexed vaultId, uint256 nav, int32 roiBps)`
- [ ] event `LeadersUpdated(bytes32 indexed contestId, bytes32[] vaultIds, uint32 heapVersion)`
- [ ] event `ContestSealed(bytes32 indexed contestId, uint64 sealedAt)`
- [ ] event `RewardClaimed(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 amount)`
- [ ] event `VaultExited(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 baseReturned, uint256 quoteReturned)`

#### Errors
- [ ] error `ContestAlreadyInitialized()`
- [ ] error `ContestInvalidParam(string field)`
- [ ] error `ContestInvalidState(ContestState expected, ContestState actual)`
- [ ] error `ContestUnauthorized(address account)`
- [ ] error `ContestAlreadyRegistered(address participant)`
- [ ] error `ContestMaxParticipantsReached(uint16 limit)`
- [ ] error `ContestRegistrationClosedError(uint64 deadline, uint64 currentTimestamp)`
- [ ] error `ContestInsufficientStake(uint256 balance, uint256 required)`
- [ ] error `ContestInsufficientAllowance(uint256 allowance, uint256 required)`
- [ ] error `ContestUnknownVault(address vault)`
- [ ] error `ContestFreezeTooEarly(uint64 liveEnds, uint64 currentTimestamp)`
- [ ] error `ContestParticipantUnknown(address participant)`
- [ ] error `ContestSettlementPending()`
- [ ] error `ContestRewardAlreadyClaimed(bytes32 vaultId)`
- [ ] error `ContestNotEligibleForReward(bytes32 vaultId)`
- [ ] error `ContestWithdrawalUnavailable(bytes32 vaultId)`

## VaultFactory.sol

### Interface IVaultInitializer
- [ ] function `initialize(address owner, address contest, uint256 entryAmount) external`

### Contract VaultFactory
- [ ] function `setImplementation(address newImplementation) external`
- [ ] function `setContest(address newContest) external`
- [ ] function `predictVaultAddress(address participant) public view returns (address predicted)`
- [ ] function `deployVault(address participant, uint256 entryAmount) external returns (address vault)`

#### Events
- [ ] event `VaultImplementationUpdated(address indexed previousImplementation, address indexed newImplementation)`
- [ ] event `ContestAddressUpdated(address indexed previousContest, address indexed newContest)`
- [ ] event `VaultDeployed(bytes32 indexed vaultId, address indexed participant, address vault, uint256 entryAmount)`

#### Errors
- [ ] error `VaultFactoryInvalidImplementation()`
- [ ] error `VaultFactoryInvalidContest()`
- [ ] error `VaultFactoryInvalidParticipant()`
- [ ] error `VaultFactoryInvalidEntryAmount()`
- [ ] error `VaultFactoryUnauthorized(address account)`

## Vault.sol

### Interface IContestMinimal
- [ ] function `state() external view returns (ContestState)`
- [ ] function `getTimeline() external view returns (ContestTimeline memory)`
- [ ] function `getConfig() external view returns (ContestConfig memory)`
- [ ] function `getVaultContext(address vault) external view returns (bytes32 vaultId, address owner)`

### Contract Vault
- [ ] function `initialize(address owner_, address contest_, uint256 entryAmount) external`
- [ ] function `pause() external`
- [ ] function `unpause() external`
- [ ] function `syncBalances(uint256 baseBalance_, uint256 quoteBalance_) external`
- [ ] function `finalizeSettlement(uint256 nav, int32 roiBps) external`
- [ ] function `updateRank(uint16 rank) external`
- [ ] function `withdraw(address recipient, uint256 baseAmount, uint256 quoteAmount) external`
- [ ] function `swapExact(uint256 amountIn, uint256 minAmountOut, bool swapBaseForQuote, uint256 deadline) external returns (uint256 amountOut, int32 priceImpactBps)`
- [ ] function `uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external`

#### Events
- [ ] event `VaultInitialized(address indexed contest, address indexed owner, uint256 entryAmount)`
- [ ] event `VaultSwapped(address indexed contest, address indexed participant, address indexed pool, IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn, uint256 amountOut, uint256 twap, int32 priceImpactBps)`
- [ ] event `VaultSettled(address indexed contest, uint256 nav, int32 roiBps, uint16 rank)`
- [ ] event `VaultWithdrawn(address indexed contest, address indexed participant, uint256 baseAmount, uint256 quoteAmount)`

#### Errors
- [ ] error `VaultAlreadyInitialized()`
- [ ] error `VaultUnauthorized(address account)`
- [ ] error `VaultInvalidParameter(string field)`
- [ ] error `VaultWithdrawForbidden()`
- [ ] error `VaultSwapInvalidState(uint8 state)`
- [ ] error `VaultSwapExpired(uint256 deadline, uint256 current)`
- [ ] error `VaultSwapInsufficientOutput(uint256 amountOut, uint256 minAmountOut)`
- [ ] error `VaultUnknownPool(address pool)`
- [ ] error `VaultAlreadySettled()`

## PriceSource.sol

### Contract PriceSource
- [ ] function `configure(address pool_, uint32 twapSeconds_) external`
- [ ] function `update() public returns (Snapshot memory snap)`
- [ ] function `getTwapTick() public returns (int24 meanTick)`
- [ ] function `lastSnapshot() external view returns (Snapshot memory)`
- [ ] function `requireWithinTolerance(uint256 amountIn, uint256 amountOut, bool zeroForOne, uint16 toleranceBps) external returns (int32 priceImpactBps, uint256 priceE18)`
- [ ] function `previewPriceImpact(uint256 amountIn, uint256 amountOut, bool zeroForOne) external view returns (int32 priceImpactBps)`

#### Events
- [ ] event `PriceSourceConfigured(address indexed pool, uint32 twapSeconds)`
- [ ] event `PriceUpdated(int24 meanTick, uint160 sqrtPriceX96, uint256 priceE18, uint64 updatedAt)`

#### Errors
- [ ] error `PriceSourceInvalidParameter(string field)`
- [ ] error `PriceSourceNotConfigured()`
- [ ] error `PriceSourceSnapshotStale(uint64 updatedAt, uint64 currentTimestamp)`
- [ ] error `PriceSourcePriceOutOfTolerance(int32 priceImpactBps, uint16 toleranceBps)`

## mocks/MockERC20.sol

### Contract MockERC20
- [ ] function `decimals() public view returns (uint8)`
- [ ] function `mint(address to, uint256 amount) external`

## mocks/MockUniswapV3Pool.sol

### Contract MockUniswapV3Pool
- [ ] function `setTick(int24 tick_) external`
- [ ] function `observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory)`
- [ ] function `slot0() external view returns (uint160 sqrtPriceX96, int24 tick_, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)`
- [ ] function `swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data) external returns (int256 amount0, int256 amount1)`
