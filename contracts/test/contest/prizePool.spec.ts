import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import type { Contest, MockERC20, Vault, VaultFactory, PriceSource } from "../../types";

const ENTRY_AMOUNT = 1_000_000n; // 1,000 USDC with 6 decimals
const ENTRY_FEE = 50_000n; // 50 USDC
const INITIAL_PRIZE = 500_000n; // 500 USDC
const LIVE_DURATION = 3600;
const CLAIM_DURATION = 7200;

async function forcePrizePoolValue(contest: Contest, value: bigint) {
  const address = await contest.getAddress();
  const provider = ethers.provider;
  const newValue = ethers.toBeHex(value, 32);

  for (let slot = 0; slot < 200; slot += 1) {
    const slotHex = ethers.toBeHex(slot, 32);
    const current = (await provider.send("eth_getStorageAt", [address, slotHex, "latest"])) as string;
    await provider.send("hardhat_setStorageAt", [address, slotHex, newValue]);
    const updated = await contest.prizePool();
    if (updated === value) {
      return;
    }
    await provider.send("hardhat_setStorageAt", [address, slotHex, current]);
  }

  throw new Error("prizePool slot not found");
}

async function deployContestFixture() {
  const [deployer, participant, otherParticipant] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = (await MockERC20.deploy("USDC", "USDC", 6)) as unknown as MockERC20;
  await usdc.waitForDeployment();

  const weth = (await MockERC20.deploy("Wrapped Ether", "WETH", 18)) as unknown as MockERC20;
  await weth.waitForDeployment();

  const Contest = await ethers.getContractFactory("Contest");
  const contest = (await Contest.deploy()) as unknown as Contest;
  await contest.waitForDeployment();

  const Vault = await ethers.getContractFactory("Vault");
  const vaultImpl = (await Vault.deploy(await usdc.getAddress(), await weth.getAddress())) as unknown as Vault;
  await vaultImpl.waitForDeployment();

  const MockPool = await ethers.getContractFactory("MockUniswapV3Pool");
  const pool = await MockPool.deploy(await usdc.getAddress(), await weth.getAddress(), 0);
  await pool.waitForDeployment();

  const PriceSource = await ethers.getContractFactory("PriceSource");
  const priceSource = (await PriceSource.deploy(await pool.getAddress(), 1800)) as unknown as PriceSource;
  await priceSource.waitForDeployment();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = (await VaultFactory.deploy(await vaultImpl.getAddress(), await contest.getAddress())) as unknown as VaultFactory;
  await factory.waitForDeployment();

  const now = await time.latest();
  const registeringEnds = now + LIVE_DURATION;
  const liveEnds = registeringEnds + LIVE_DURATION;
  const claimEnds = liveEnds + CLAIM_DURATION;
  const payoutSchedule = Array<number>(32).fill(0);
  payoutSchedule[0] = 10_000;

  await usdc.mint(deployer.address, ENTRY_AMOUNT + ENTRY_FEE + INITIAL_PRIZE);
  await usdc.mint(participant.address, ENTRY_AMOUNT + ENTRY_FEE);
  await usdc.mint(otherParticipant.address, ENTRY_AMOUNT + ENTRY_FEE);

  return {
    deployer,
    participant,
    otherParticipant,
    contest,
    usdc,
    weth,
    pool,
    priceSource,
    vaultImpl,
    factory,
    registeringEnds,
    liveEnds,
    claimEnds,
    payoutSchedule,
  };
}

describe("Contest prize pool initialization", () => {
  it("reverts when organizer allowance is below initial prize", async () => {
    const {
      contest,
      deployer,
      usdc,
      priceSource,
      pool,
      vaultImpl,
      factory,
      registeringEnds,
      liveEnds,
      claimEnds,
      payoutSchedule,
    } = await loadFixture(deployContestFixture);

    await expect(
      contest.initialize({
        contestId: ethers.encodeBytes32String("contest-allowance"),
        config: {
          entryAsset: await usdc.getAddress(),
          entryAmount: ENTRY_AMOUNT,
          entryFee: ENTRY_FEE,
          priceSource: await priceSource.getAddress(),
          swapPool: await pool.getAddress(),
          priceToleranceBps: 50,
          settlementWindow: 1800,
          maxParticipants: 1024,
          topK: 8,
        },
        timeline: {
          registeringEnds,
          liveEnds,
          claimEnds,
        },
        initialPrizeAmount: INITIAL_PRIZE,
        payoutSchedule,
        vaultImplementation: await vaultImpl.getAddress(),
        vaultFactory: await factory.getAddress(),
        owner: deployer.address,
      }),
    ).to.be.revertedWithCustomError(contest, "ContestInsufficientAllowance");
  });

  it("initializes prize pool with entry fee configuration and emits funding event", async () => {
    const {
      contest,
      deployer,
      usdc,
      priceSource,
      pool,
      vaultImpl,
      factory,
      registeringEnds,
      liveEnds,
      claimEnds,
      payoutSchedule,
    } = await loadFixture(deployContestFixture);

    await usdc.approve(await contest.getAddress(), INITIAL_PRIZE);

    const tx = contest.initialize({
      contestId: ethers.encodeBytes32String("contest-init"),
      config: {
        entryAsset: await usdc.getAddress(),
        entryAmount: ENTRY_AMOUNT,
        entryFee: ENTRY_FEE,
        priceSource: await priceSource.getAddress(),
        swapPool: await pool.getAddress(),
        priceToleranceBps: 50,
        settlementWindow: 1800,
        maxParticipants: 1024,
        topK: 8,
      },
      timeline: {
        registeringEnds,
        liveEnds,
        claimEnds,
      },
      initialPrizeAmount: INITIAL_PRIZE,
      payoutSchedule,
      vaultImplementation: await vaultImpl.getAddress(),
      vaultFactory: await factory.getAddress(),
      owner: deployer.address,
    });

    await expect(tx).to.emit(contest, "PrizePoolFunded").withArgs(
      ethers.encodeBytes32String("contest-init"),
      deployer.address,
      INITIAL_PRIZE,
      INITIAL_PRIZE,
    );

    const config = await contest.getConfig();
    expect(config.entryFee).to.equal(ENTRY_FEE);

    expect(await contest.prizePool()).to.equal(INITIAL_PRIZE);
    expect(await contest.totalPrizePool()).to.equal(INITIAL_PRIZE);
    expect(await contest.initialPrizeAmount()).to.equal(INITIAL_PRIZE);
  });

  it("allows zero initial prize while persisting entry fee", async () => {
    const {
      contest,
      deployer,
      usdc,
      priceSource,
      pool,
      vaultImpl,
      factory,
      registeringEnds,
      liveEnds,
      claimEnds,
      payoutSchedule,
    } = await loadFixture(deployContestFixture);

    await usdc.approve(await contest.getAddress(), 0);

    await expect(
      contest.initialize({
        contestId: ethers.encodeBytes32String("contest-zero"),
        config: {
          entryAsset: await usdc.getAddress(),
          entryAmount: ENTRY_AMOUNT,
          entryFee: ENTRY_FEE,
          priceSource: await priceSource.getAddress(),
          swapPool: await pool.getAddress(),
          priceToleranceBps: 50,
          settlementWindow: 1800,
          maxParticipants: 1024,
          topK: 8,
        },
        timeline: {
          registeringEnds,
          liveEnds,
          claimEnds,
        },
        initialPrizeAmount: 0n,
        payoutSchedule,
        vaultImplementation: await vaultImpl.getAddress(),
        vaultFactory: await factory.getAddress(),
        owner: deployer.address,
      }),
    ).to.emit(contest, "ContestInitialized");

    const config = await contest.getConfig();
    expect(config.entryFee).to.equal(ENTRY_FEE);
    expect(await contest.prizePool()).to.equal(0n);
    expect(await contest.totalPrizePool()).to.equal(0n);
    expect(await contest.initialPrizeAmount()).to.equal(0n);
  });
});

describe("Contest prize pool funding during registration", () => {
  it("reverts when participant allowance omits entry fee", async () => {
    const {
      contest,
      deployer,
      participant,
      usdc,
      priceSource,
      pool,
      vaultImpl,
      factory,
      registeringEnds,
      liveEnds,
      claimEnds,
      payoutSchedule,
    } = await loadFixture(deployContestFixture);

    await usdc.approve(await contest.getAddress(), INITIAL_PRIZE);

    await contest.initialize({
      contestId: ethers.encodeBytes32String("contest-register"),
      config: {
        entryAsset: await usdc.getAddress(),
        entryAmount: ENTRY_AMOUNT,
        entryFee: ENTRY_FEE,
        priceSource: await priceSource.getAddress(),
        swapPool: await pool.getAddress(),
        priceToleranceBps: 50,
        settlementWindow: 1800,
        maxParticipants: 1024,
        topK: 8,
      },
      timeline: {
        registeringEnds,
        liveEnds,
        claimEnds,
      },
      initialPrizeAmount: INITIAL_PRIZE,
      payoutSchedule,
      vaultImplementation: await vaultImpl.getAddress(),
      vaultFactory: await factory.getAddress(),
      owner: deployer.address,
    });

    await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT);

    await expect(contest.connect(participant).register())
      .to.be.revertedWithCustomError(contest, "ContestInsufficientAllowance")
      .withArgs(ENTRY_AMOUNT, ENTRY_AMOUNT + ENTRY_FEE);
  });

  it("adds entry fee to prize pool and emits funding event", async () => {
    const {
      contest,
      deployer,
      participant,
      usdc,
      priceSource,
      pool,
      vaultImpl,
      factory,
      registeringEnds,
      liveEnds,
      claimEnds,
      payoutSchedule,
    } = await loadFixture(deployContestFixture);

    await usdc.approve(await contest.getAddress(), INITIAL_PRIZE);

    await contest.initialize({
      contestId: ethers.encodeBytes32String("contest-register"),
      config: {
        entryAsset: await usdc.getAddress(),
        entryAmount: ENTRY_AMOUNT,
        entryFee: ENTRY_FEE,
        priceSource: await priceSource.getAddress(),
        swapPool: await pool.getAddress(),
        priceToleranceBps: 50,
        settlementWindow: 1800,
        maxParticipants: 1024,
        topK: 8,
      },
      timeline: {
        registeringEnds,
        liveEnds,
        claimEnds,
      },
      initialPrizeAmount: INITIAL_PRIZE,
      payoutSchedule,
      vaultImplementation: await vaultImpl.getAddress(),
      vaultFactory: await factory.getAddress(),
      owner: deployer.address,
    });

    const totalRequired = ENTRY_AMOUNT + ENTRY_FEE;
    await usdc.connect(participant).approve(await contest.getAddress(), totalRequired);

    const contestId = await contest.contestId();
    const predictedVault = await factory.predictVaultAddress(participant.address);

    const tx = contest.connect(participant).register();

    await expect(tx)
      .to.emit(contest, "ContestRegistered")
      .withArgs(contestId, participant.address, predictedVault, ENTRY_AMOUNT, ENTRY_FEE);
    await expect(tx)
      .to.emit(contest, "PrizePoolFunded")
      .withArgs(contestId, participant.address, ENTRY_FEE, INITIAL_PRIZE + ENTRY_FEE);

    await tx;

    expect(await contest.prizePool()).to.equal(INITIAL_PRIZE + ENTRY_FEE);
    expect(await contest.totalPrizePool()).to.equal(INITIAL_PRIZE + ENTRY_FEE);

    await expect(contest.connect(participant).register()).to.be.revertedWithCustomError(
      contest,
      "ContestAlreadyRegistered",
    );
  });
});


describe("Contest prize pool claims", () => {
  async function bootstrapContestForClaim() {
    const {
      deployer,
      participant,
      contest,
      usdc,
      priceSource,
      pool,
      vaultImpl,
      factory,
      registeringEnds,
      liveEnds,
      claimEnds,
      payoutSchedule,
    } = await loadFixture(deployContestFixture);

    await usdc.approve(await contest.getAddress(), INITIAL_PRIZE);

    await contest.initialize({
      contestId: ethers.encodeBytes32String("contest-claim"),
      config: {
        entryAsset: await usdc.getAddress(),
        entryAmount: ENTRY_AMOUNT,
        entryFee: ENTRY_FEE,
        priceSource: await priceSource.getAddress(),
        swapPool: await pool.getAddress(),
        priceToleranceBps: 50,
        settlementWindow: 1800,
        maxParticipants: 1024,
        topK: 1,
      },
      timeline: {
        registeringEnds,
        liveEnds,
        claimEnds,
      },
      initialPrizeAmount: INITIAL_PRIZE,
      payoutSchedule,
      vaultImplementation: await vaultImpl.getAddress(),
      vaultFactory: await factory.getAddress(),
      owner: deployer.address,
    });

    const totalRequired = ENTRY_AMOUNT + ENTRY_FEE;
    await usdc.connect(participant).approve(await contest.getAddress(), totalRequired);

    await contest.connect(participant).register();
    const vaultId = await contest.participantVaults(participant.address);

    await time.increaseTo(registeringEnds + 1);
    await contest.syncState();
    await time.increaseTo(liveEnds + 1);
    await contest.freeze();

    await contest.settle(participant.address);
    const nav = await contest.vaultNavs(vaultId);
    const roiBps = await contest.vaultRoiBps(vaultId);
    await contest.updateLeaders([
      {
        vaultId,
        nav,
        roiBps: Number(roiBps),
      },
    ]);

    await contest.seal();

    const contestId = await contest.contestId();
    const prizeBefore = await contest.prizePool();

    return {
      contest,
      participant,
      usdc,
      contestId,
      vaultId,
      prizeBefore,
    };
  }

  it("distributes prize from pool on successful claim", async () => {
    const { contest, participant, usdc, contestId, vaultId, prizeBefore } = await bootstrapContestForClaim();

    const balanceBefore = await usdc.balanceOf(participant.address);

    const tx = contest.connect(participant).claim();
    await expect(tx)
      .to.emit(contest, "RewardClaimed")
      .withArgs(contestId, vaultId, prizeBefore);

    await tx;

    expect(await contest.prizePool()).to.equal(0n);
    expect(await contest.totalPrizePool()).to.equal(prizeBefore);
    const balanceAfter = await usdc.balanceOf(participant.address);
    expect(balanceAfter - balanceBefore).to.equal(prizeBefore);

    const exitTx = contest.connect(participant).exit();
    await expect(exitTx)
      .to.emit(contest, "VaultExited")
      .withArgs(contestId, vaultId, ENTRY_AMOUNT, 0);
    await exitTx;

    const finalBalance = await usdc.balanceOf(participant.address);
    expect(finalBalance - balanceAfter).to.equal(ENTRY_AMOUNT);
  });

  it("reverts when prize pool is insufficient", async () => {
    const { contest, participant, contestId, vaultId } = await bootstrapContestForClaim();

    const required = await contest.totalPrizePool();
    await forcePrizePoolValue(contest, ENTRY_FEE);

    await expect(contest.connect(participant).claim())
      .to.be.revertedWithCustomError(contest, "ContestPrizePoolInsufficient")
      .withArgs(ENTRY_FEE, required);

    const prizeAfter = await contest.prizePool();
    expect(prizeAfter).to.equal(ENTRY_FEE);

    await expect(contest.connect(participant).claim())
      .to.be.revertedWithCustomError(contest, "ContestPrizePoolInsufficient")
      .withArgs(ENTRY_FEE, required);

    await forcePrizePoolValue(contest, required);

    const tx = contest.connect(participant).claim();
    await expect(tx)
      .to.emit(contest, "RewardClaimed")
      .withArgs(contestId, vaultId, required);
  });
});
