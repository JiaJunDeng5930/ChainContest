import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import type { Contest, MockERC20, Vault, VaultFactory, PriceSource } from "./types";

const ENTRY_AMOUNT = 1_000_000n;
const ENTRY_FEE = 50_000n;
const INITIAL_PRIZE = 500_000n;

async function deploySettledContestFixture() {
  const [deployer, participant] = await ethers.getSigners();

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
  const registeringEnds = now + 1_800;
  const liveEnds = registeringEnds + 1_800;
  const claimEnds = liveEnds + 1_800;
  const payoutSchedule = Array<number>(32).fill(0);
  payoutSchedule[0] = 10_000; // 100%

  await usdc.mint(deployer.address, INITIAL_PRIZE);
  await usdc.mint(participant.address, ENTRY_AMOUNT + ENTRY_FEE);

  await usdc.connect(deployer).approve(await contest.getAddress(), INITIAL_PRIZE);

  await contest.initialize({
    contestId: ethers.encodeBytes32String("contest-claim"),
    config: {
      entryAsset: await usdc.getAddress(),
      entryAmount: ENTRY_AMOUNT,
      entryFee: ENTRY_FEE,
      priceSource: await priceSource.getAddress(),
      swapPool: await pool.getAddress(),
      priceToleranceBps: 50,
      settlementWindow: 900,
      maxParticipants: 16,
      topK: 3,
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

  await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT + ENTRY_FEE);
  await contest.connect(participant).register();

  const vaultId = await contest.participantVaults(participant.address);
  const vaultAddress = await factory.predictVaultAddress(participant.address);
  const vault = await ethers.getContractAt("Vault", vaultAddress);

  // Advance to live phase and freeze
  await time.increaseTo(registeringEnds + 1);
  await contest.syncState();
  await time.increaseTo(liveEnds + 1);
  await contest.freeze();

  // Settle the only participant (nav equals entry amount to keep ROI = 0)
  await usdc.connect(deployer).mint(vaultAddress, 0);
  await contest.settle(participant.address);

  const nav = await contest.vaultNavs(vaultId);
  const roi = await contest.vaultRoiBps(vaultId);

  await contest.updateLeaders([
    {
      vaultId,
      nav,
      roiBps: roi,
    },
  ]);

  await contest.seal();

  return {
    contest,
    usdc,
    vault,
    participant,
    vaultId,
    nav,
  };
}

describe("Contest claim and exit flow", () => {
  it("allows winners to exit after claiming reward", async () => {
    const { contest, usdc, vault, participant, nav } = await loadFixture(deploySettledContestFixture);

    const prizeBefore = await usdc.balanceOf(participant.address);
    const claimTx = await contest.connect(participant).claim();
    await expect(claimTx).to.emit(contest, "RewardClaimed");

    const prizeAfter = await usdc.balanceOf(participant.address);
    expect(prizeAfter).to.be.gt(prizeBefore);

    // Principal remains in the vault until exit is called
    expect(await vault.withdrawn()).to.equal(false);
    expect(await vault.baseBalance()).to.equal(ENTRY_AMOUNT);

    const exitTx = await contest.connect(participant).exit();
    await expect(exitTx).to.emit(contest, "VaultExited");

    expect(await vault.withdrawn()).to.equal(true);
    const totalReceived = await usdc.balanceOf(participant.address);
    expect(totalReceived).to.equal(prizeAfter + nav);
  });

  it("requires winners to claim before exiting", async () => {
    const { contest, participant } = await loadFixture(deploySettledContestFixture);

    await expect(contest.connect(participant).exit()).to.be.revertedWithCustomError(
      contest,
      "ContestNotEligibleForReward",
    );
  });
});
