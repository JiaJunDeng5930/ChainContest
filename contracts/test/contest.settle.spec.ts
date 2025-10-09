import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import type { Contest, MockERC20, Vault, VaultFactory, PriceSource, MockUniswapV3Pool } from "../types";

const ENTRY_AMOUNT = 1_000_000n;
const BONUS_ALICE = 500_000n;
const BONUS_BOB = 200_000n;
const PAYOUT_SCHEDULE = [7_000, 3_000, 0, 0, 0, 0, 0, 0];
const TOP_K = 2;

enum ContestState {
  Uninitialized,
  Registering,
  Live,
  Frozen,
  Sealed,
  Closed,
}

async function deploySettlementFixture() {
  const [deployer, alice, bob, carol, operator] = await ethers.getSigners();

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
  const pool = (await MockPool.deploy(await usdc.getAddress(), await weth.getAddress(), 0)) as unknown as MockUniswapV3Pool;
  await pool.waitForDeployment();

  const PriceSource = await ethers.getContractFactory("PriceSource");
  const priceSource = (await PriceSource.deploy(await pool.getAddress(), 1_800)) as unknown as PriceSource;
  await priceSource.waitForDeployment();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = (await VaultFactory.deploy(await vaultImpl.getAddress(), await contest.getAddress())) as unknown as VaultFactory;
  await factory.waitForDeployment();

  const now = await time.latest();
  const registeringEnds = now + 600;
  const liveEnds = registeringEnds + 3_600;
  const claimEnds = liveEnds + 7_200;

  const payoutSchedule: number[] = Array(32).fill(0);
  payoutSchedule[0] = PAYOUT_SCHEDULE[0];
  payoutSchedule[1] = PAYOUT_SCHEDULE[1];

  await contest.initialize({
    contestId: ethers.encodeBytes32String("contest-001"),
    config: {
      entryAsset: await usdc.getAddress(),
      entryAmount: ENTRY_AMOUNT,
      priceSource: await priceSource.getAddress(),
      swapPool: await pool.getAddress(),
      priceToleranceBps: 50,
      settlementWindow: 1_800,
      maxParticipants: 1_024,
      topK: TOP_K,
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

  const participants = [alice, bob, carol];
  const vaults: Record<string, string> = {};

  for (const participant of participants) {
    await usdc.mint(participant.address, ENTRY_AMOUNT);
    await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT);
    const predicted = await factory.predictVaultAddress(participant.address);
    vaults[participant.address.toLowerCase()] = predicted;
    await contest.connect(participant).register();
  }

  await usdc.mint(await contest.getAddress(), ENTRY_AMOUNT * BigInt(participants.length));

  await time.increaseTo(registeringEnds + 1);
  await contest.syncState();

  return {
    deployer,
    alice,
    bob,
    carol,
    operator,
    contest,
    usdc,
    weth,
    priceSource,
    pool,
    factory,
    vaultImpl,
    registeringEnds,
    liveEnds,
    claimEnds,
    vaults,
  };
}

describe("Contest settlement lifecycle", () => {
  it("should freeze contest after live window and pause vaults", async () => {
    const { contest, operator, alice, bob, carol, liveEnds } = await loadFixture(deploySettlementFixture);
    const contestAny = contest as unknown as any;

    await expect(contestAny.connect(operator).freeze()).to.be.revertedWithCustomError(
      contest,
      "ContestFreezeTooEarly",
    );

    await time.increaseTo(liveEnds + 1);

    await expect(contestAny.connect(operator).freeze())
      .to.emit(contest, "ContestFrozen")
      .withArgs(await contest.contestId(), await time.latest());

    expect(await contest.state()).to.equal(ContestState.Frozen);

  });

  it("should settle vault scores, update leaders, seal and distribute prize pool", async () => {
    const { contest, usdc, vaults, alice, bob, carol, operator, liveEnds } = await loadFixture(deploySettlementFixture);
    const contestAny = contest as unknown as any;

    const aliceVaultAddress = vaults[alice.address.toLowerCase()];
    const bobVaultAddress = vaults[bob.address.toLowerCase()];
    const carolVaultAddress = vaults[carol.address.toLowerCase()];

    await usdc.mint(aliceVaultAddress, BONUS_ALICE);
    await usdc.mint(bobVaultAddress, BONUS_BOB);

    await time.increaseTo(liveEnds + 1);
    await contestAny.connect(operator).freeze();

    const aliceVaultId = await contest.participantVaults(alice.address);
    const bobVaultId = await contest.participantVaults(bob.address);
    const carolVaultId = await contest.participantVaults(carol.address);

    await expect(contestAny.connect(operator).settle(alice.address))
      .to.emit(contest, "VaultSettled")
      .withArgs(aliceVaultId, ENTRY_AMOUNT + BONUS_ALICE, 5_000);

    await expect(contestAny.connect(operator).settle(bob.address))
      .to.emit(contest, "VaultSettled")
      .withArgs(bobVaultId, ENTRY_AMOUNT + BONUS_BOB, 2_000);

    await expect(contestAny.connect(operator).settle(carol.address))
      .to.emit(contest, "VaultSettled")
      .withArgs(carolVaultId, ENTRY_AMOUNT, 0);

    await expect(contestAny.connect(operator).settle(alice.address)).to.not.emit(contest, "VaultSettled");

    const aliceVault = (await ethers.getContractAt("Vault", aliceVaultAddress)) as unknown as Vault;
    const bobVault = (await ethers.getContractAt("Vault", bobVaultAddress)) as unknown as Vault;
    const carolVault = (await ethers.getContractAt("Vault", carolVaultAddress)) as unknown as Vault;

    const aliceScore = await aliceVault.score();
    expect(aliceScore.nav).to.equal(ENTRY_AMOUNT + BONUS_ALICE);
    expect(aliceScore.roiBps).to.equal(5_000);

    const bobScore = await bobVault.score();
    expect(bobScore.nav).to.equal(ENTRY_AMOUNT + BONUS_BOB);
    expect(bobScore.roiBps).to.equal(2_000);

    const carolScore = await carolVault.score();
    expect(carolScore.nav).to.equal(ENTRY_AMOUNT);
    expect(carolScore.roiBps).to.equal(0);

    await expect(
      contestAny.updateLeaders([
        { vaultId: aliceVaultId, nav: ENTRY_AMOUNT + BONUS_ALICE, roiBps: 5_000 },
        { vaultId: bobVaultId, nav: ENTRY_AMOUNT + BONUS_BOB, roiBps: 2_000 },
      ]),
    )
      .to.emit(contest, "LeadersUpdated")
      .withArgs(await contest.contestId(), [aliceVaultId, bobVaultId], 1);

    const leaders = await contestAny.getLeaders();
    expect(leaders).to.have.lengthOf(TOP_K);
    expect(leaders[0]!.vaultId).to.equal(aliceVaultId);
    expect(leaders[0]!.nav).to.equal(ENTRY_AMOUNT + BONUS_ALICE);
    expect(leaders[1]!.vaultId).to.equal(bobVaultId);
    expect(leaders[1]!.nav).to.equal(ENTRY_AMOUNT + BONUS_BOB);

    await expect(contestAny.seal())
      .to.emit(contest, "ContestSealed")
      .withArgs(await contest.contestId(), await time.latest());

    expect(await contest.state()).to.equal(ContestState.Sealed);

    const prizePool = ENTRY_AMOUNT * 3n;
    const firstShare = (prizePool * BigInt(PAYOUT_SCHEDULE[0])) / 10_000n;
    const secondShare = (prizePool * BigInt(PAYOUT_SCHEDULE[1])) / 10_000n;

    const aliceInitial = await usdc.balanceOf(alice.address);
    await expect(contestAny.connect(alice).claim())
      .to.emit(contest, "RewardClaimed")
      .withArgs(await contest.contestId(), aliceVaultId, firstShare);
    const aliceFinal = await usdc.balanceOf(alice.address);
    expect(aliceFinal - aliceInitial).to.equal(firstShare + ENTRY_AMOUNT + BONUS_ALICE);
    expect(await aliceVault.withdrawn()).to.equal(true);

    const bobInitial = await usdc.balanceOf(bob.address);
    await expect(contestAny.connect(operator).claimFor(bob.address))
      .to.emit(contest, "RewardClaimed")
      .withArgs(await contest.contestId(), bobVaultId, secondShare);
    const bobFinal = await usdc.balanceOf(bob.address);
    expect(bobFinal - bobInitial).to.equal(secondShare + ENTRY_AMOUNT + BONUS_BOB);
    expect(await bobVault.withdrawn()).to.equal(true);

    const carolInitial = await usdc.balanceOf(carol.address);
    await expect(contestAny.connect(carol).exit())
      .to.emit(contest, "VaultExited")
      .withArgs(await contest.contestId(), carolVaultId, ENTRY_AMOUNT, 0);
    const carolFinal = await usdc.balanceOf(carol.address);
    expect(carolFinal - carolInitial).to.equal(ENTRY_AMOUNT);
    expect(await carolVault.withdrawn()).to.equal(true);

    expect(await contestAny.prizePool()).to.equal(0);
  });
});
