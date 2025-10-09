import { ethers } from "hardhat";

const ENTRY_AMOUNT = 1_000_000n;
const REGISTER_DURATION = 600;
const LIVE_DURATION = 3_600;
const CLAIM_DURATION = 7_200;

async function main() {
  const [deployer, participant] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USDC", "USDC", 6);
  await usdc.waitForDeployment();

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();

  const MockPool = await ethers.getContractFactory("MockUniswapV3Pool");
  const pool = await MockPool.deploy(await usdc.getAddress(), await weth.getAddress(), 0);
  await pool.waitForDeployment();

  const Contest = await ethers.getContractFactory("Contest");
  const contest = await Contest.deploy();
  await contest.waitForDeployment();

  const Vault = await ethers.getContractFactory("Vault");
  const vaultImpl = await Vault.deploy(await usdc.getAddress(), await weth.getAddress());
  await vaultImpl.waitForDeployment();

  const PriceSource = await ethers.getContractFactory("PriceSource");
  const priceSource = await PriceSource.deploy(await pool.getAddress(), 1_800);
  await priceSource.waitForDeployment();

  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy(await vaultImpl.getAddress(), await contest.getAddress());
  await factory.waitForDeployment();

  const now = Math.floor(Date.now() / 1000);
  const registeringEnds = BigInt(now + REGISTER_DURATION);
  const liveEnds = registeringEnds + BigInt(LIVE_DURATION);
  const claimEnds = liveEnds + BigInt(CLAIM_DURATION);
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
      settlementWindow: 1_800,
      maxParticipants: 1_024,
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

  await usdc.mint(participant.address, ENTRY_AMOUNT * 2n);
  await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT * 2n);

  const predictedVault = await factory.predictVaultAddress(participant.address);

  await contest.connect(participant).register();

  await usdc.mint(predictedVault, ENTRY_AMOUNT * 3n);
  await weth.mint(await pool.getAddress(), ethers.parseEther("100"));
  await usdc.mint(await pool.getAddress(), ENTRY_AMOUNT * 20n);

  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(registeringEnds) + 1]);
  await ethers.provider.send("evm_mine", []);
  const syncTx = await contest.syncState();
  await syncTx.wait();

  await (priceSource as unknown as { update: () => Promise<unknown> }).update();

  const output = {
    contest: await contest.getAddress(),
    priceSource: await priceSource.getAddress(),
    vaultImplementation: await vaultImpl.getAddress(),
    vaultFactory: await factory.getAddress(),
    entryAsset: await usdc.getAddress(),
    quoteAsset: await weth.getAddress(),
    pool: await pool.getAddress(),
    entryAmount: ENTRY_AMOUNT.toString(),
    timelines: {
      registeringEnds: registeringEnds.toString(),
      liveEnds: liveEnds.toString(),
      claimEnds: claimEnds.toString(),
    },
    deployer: {
      address: deployer.address,
      privateKey: (deployer as unknown as { privateKey: string }).privateKey,
    },
    participant: {
      address: participant.address,
      privateKey: (participant as unknown as { privateKey: string }).privateKey,
    },
    vault: predictedVault,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
