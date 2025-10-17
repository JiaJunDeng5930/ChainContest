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
const ENTRY_FEE = 0n;
const INITIAL_PRIZE = 0n;
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
  const payoutSchedule = Array<number>(32).fill(0);
  payoutSchedule[0] = 10_000;

  await usdc.mint(deployer.address, INITIAL_PRIZE);
  await usdc.mint(participant.address, ENTRY_AMOUNT + ENTRY_FEE);
  await usdc.connect(deployer).approve(await contest.getAddress(), INITIAL_PRIZE);

  await contest.initialize({
    contestId: ethers.encodeBytes32String("contest-001"),
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
  it("exposes contest config with expected layout", async () => {
    const { contest, priceSource, pool } = await loadFixture(deploySwapFixture);

    const config = await contest.getConfig();

    expect(config.entryFee).to.equal(ENTRY_FEE);
    expect(config.priceSource).to.equal(await priceSource.getAddress());
    expect(config.swapPool).to.equal(await pool.getAddress());
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
