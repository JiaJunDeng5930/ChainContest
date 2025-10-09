import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import type { Contest, MockERC20, Vault, VaultFactory, PriceSource } from "../types";

const ENTRY_AMOUNT = 1_000_000n; // 1,000 USDC with 6 decimals
const LIVE_DURATION = 3600;
const CLAIM_DURATION = 7200;

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

  await contest.initialize({
    contestId: ethers.encodeBytes32String("contest-001"),
    config: {
      entryAsset: await usdc.getAddress(),
      entryAmount: ENTRY_AMOUNT,
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
    payoutSchedule,
    vaultImplementation: await vaultImpl.getAddress(),
    vaultFactory: await factory.getAddress(),
    owner: deployer.address,
  });

  await usdc.mint(participant.address, ENTRY_AMOUNT);
  await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT);

  return {
    deployer,
    participant,
    otherParticipant,
    contest,
    usdc,
    weth,
    factory,
    priceSource,
  };
}

describe("Contest.register", () => {
  it("should register a participant and deploy a vault", async () => {
    const { contest, participant, factory, usdc } = await loadFixture(deployContestFixture);

    const contestId = await contest.contestId();
    const predictedVault = await factory.predictVaultAddress(participant.address);

    await expect(contest.connect(participant).register())
      .to.emit(contest, "ContestRegistered")
      .withArgs(contestId, participant.address, predictedVault, ENTRY_AMOUNT);

    const vaultId = await contest.participantVaults(participant.address);
    expect(vaultId).to.not.equal(ethers.ZeroHash);

    const prizePool = await contest.prizePool();
    expect(prizePool).to.equal(ENTRY_AMOUNT);

    const vault = await ethers.getContractAt("Vault", predictedVault);
    expect(await vault.owner()).to.equal(participant.address);
    expect(await vault.contest()).to.equal(await contest.getAddress());
    expect(await vault.baseBalance()).to.equal(ENTRY_AMOUNT);
    expect(await usdc.balanceOf(predictedVault)).to.equal(ENTRY_AMOUNT);
  });

  it("should reject duplicate registration", async () => {
    const { contest, participant } = await loadFixture(deployContestFixture);

    await contest.connect(participant).register();

    await expect(contest.connect(participant).register()).to.be.revertedWithCustomError(
      contest,
      "ContestAlreadyRegistered",
    );
  });

  it("should revert when participant balance is insufficient", async () => {
    const { contest, otherParticipant, usdc } = await loadFixture(deployContestFixture);

    await usdc.connect(otherParticipant).approve(await contest.getAddress(), ENTRY_AMOUNT);

    await expect(contest.connect(otherParticipant).register()).to.be.revertedWithCustomError(
      contest,
      "ContestInsufficientStake",
    );
  });
});
