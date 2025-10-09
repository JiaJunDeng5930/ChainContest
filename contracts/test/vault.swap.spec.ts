import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import type {
  Contest,
  MockERC20,
  MockUniswapV3Pool,
  PriceSource,
  Vault,
  VaultFactory,
} from "../types";

const ENTRY_AMOUNT = 1_000_000n; // 1,000 USDC with 6 decimals
const REGISTER_DURATION = 600;
const LIVE_DURATION = 3600;
const CLAIM_DURATION = 7200;

async function deploySwapFixture() {
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
  const pool = (await MockPool.deploy(await usdc.getAddress(), await weth.getAddress(), 0)) as unknown as MockUniswapV3Pool;
  await pool.waitForDeployment();

  const PriceSource = await ethers.getContractFactory("PriceSource");
  const priceSource = (await PriceSource.deploy(await pool.getAddress(), 1800)) as unknown as PriceSource;
  await priceSource.waitForDeployment();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = (await VaultFactory.deploy(await vaultImpl.getAddress(), await contest.getAddress())) as unknown as VaultFactory;
  await factory.waitForDeployment();

  const now = await time.latest();
  const registeringEnds = now + REGISTER_DURATION;
  const liveEnds = registeringEnds + LIVE_DURATION;
  const claimEnds = liveEnds + CLAIM_DURATION;

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
    vaultImplementation: await vaultImpl.getAddress(),
    vaultFactory: await factory.getAddress(),
    owner: deployer.address,
  });

  await usdc.mint(participant.address, ENTRY_AMOUNT);
  await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT);

  const predictedVault = await factory.predictVaultAddress(participant.address);
  await contest.connect(participant).register();
  const vault = (await ethers.getContractAt("Vault", predictedVault)) as unknown as Vault;

  // Seed the mock pool with liquidity so swaps can pay out quote asset.
  await weth.mint(await pool.getAddress(), ethers.parseEther("20"));
  await usdc.mint(await pool.getAddress(), ENTRY_AMOUNT * 5n);

  return {
    deployer,
    participant,
    contest,
    priceSource,
    pool,
    vault,
    usdc,
    weth,
    registeringEnds,
    liveEnds,
  };
}

describe("Vault.swapExact", () => {
  it("executes swap within tolerance during live phase", async () => {
    const {
      participant,
      contest,
      priceSource,
      pool,
      vault,
      usdc,
      registeringEnds,
    } = await loadFixture(deploySwapFixture);

    await (priceSource as unknown as { update: () => Promise<unknown> }).update();

    await pool.setTick(0);
    await time.increaseTo(registeringEnds + 1);
    await (contest as unknown as { syncState: () => Promise<unknown> }).syncState();

    const quoteAssetAddress = await (vault as unknown as { quoteAsset: () => Promise<string> }).quoteAsset();
    const vaultForParticipant = vault.connect(participant) as unknown as {
      swapExact: (amountIn: bigint, minAmountOut: bigint, zeroForOne: boolean, deadline: bigint) => Promise<unknown>;
    };
    const amountIn = 100_000n;
    const minAmountOut = amountIn;
    const deadline = BigInt(await time.latest()) + 600n;

    await expect(vaultForParticipant.swapExact(amountIn, minAmountOut, true, deadline))
      .to.emit(vault, "VaultSwapped")
      .withArgs(
        await contest.getAddress(),
        participant.address,
        await pool.getAddress(),
        await usdc.getAddress(),
        quoteAssetAddress,
        amountIn,
        amountIn,
        1_000_000_000_000_000_000n,
        0,
      );

    expect(await vault.baseBalance()).to.equal(ENTRY_AMOUNT - amountIn);
    expect(await vault.quoteBalance()).to.equal(amountIn);
  });

  it("reverts when price impact exceeds tolerance", async () => {
    const { participant, contest, priceSource, pool, vault, registeringEnds } = await loadFixture(deploySwapFixture);

    await pool.setTick(0);
    await (priceSource as unknown as { update: () => Promise<unknown> }).update();
    await pool.setTick(120); // ~1.2% drift, beyond 0.5% tolerance

    await time.increaseTo(registeringEnds + 1);
    await (contest as unknown as { syncState: () => Promise<unknown> }).syncState();

    const amountIn = 200_000n;
    const deadline = BigInt(await time.latest()) + 600n;

    const vaultForParticipant = vault.connect(participant) as unknown as {
      swapExact: (amountIn: bigint, minAmountOut: bigint, zeroForOne: boolean, deadline: bigint) => Promise<unknown>;
    };

    await expect(vaultForParticipant.swapExact(amountIn, 1n, true, deadline)).to.be.revertedWithCustomError(
      priceSource,
      "PriceSourcePriceOutOfTolerance",
    );
  });

  it("reverts when contest is not live", async () => {
    const { contest, vault, participant } = await loadFixture(deploySwapFixture);

    const amountIn = 50_000n;
    const deadline = BigInt(await time.latest()) + 600n;

    const vaultForParticipant = vault.connect(participant) as unknown as {
      swapExact: (amountIn: bigint, minAmountOut: bigint, zeroForOne: boolean, deadline: bigint) => Promise<unknown>;
    };

    await expect(vaultForParticipant.swapExact(amountIn, 1n, true, deadline)).to.be.revertedWithCustomError(
      vault,
      "VaultSwapInvalidState",
    );

    expect(await contest.state()).to.equal(1); // Registering
  });
});
