import { ethers, network } from "hardhat";

const ENTRY_AMOUNT = 1_000_000n;
const BONUS_ALICE = 500_000n;
const BONUS_BOB = 200_000n;
const REGISTER_DURATION = 600;
const LIVE_DURATION = 3_600;
const CLAIM_DURATION = 7_200;

async function main() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

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
  payoutSchedule[0] = 7_000;
  payoutSchedule[1] = 3_000;

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
      topK: 2,
      payoutSchedule,
    },
    timeline: {
      registeringEnds,
      liveEnds,
      claimEnds,
    },
    vaultImplementation: await vaultImpl.getAddress(),
    vaultFactory: await factory.getAddress(),
    owner: deployer.address,
  } as unknown as Parameters<typeof contest.initialize>[0]);

  const participants = [alice, bob, carol];
  const bonuses = [BONUS_ALICE, BONUS_BOB, 0n];
  const vaults: Record<string, string> = {};

  for (const [index, participant] of participants.entries()) {
    await usdc.mint(participant.address, ENTRY_AMOUNT);
    await usdc.connect(participant).approve(await contest.getAddress(), ENTRY_AMOUNT);
    const predicted = await factory.predictVaultAddress(participant.address);
    vaults[participant.address.toLowerCase()] = predicted;
    await contest.connect(participant).register();
    if (bonuses[index] > 0n) {
      await usdc.mint(predicted, bonuses[index]!);
    }
  }

  await usdc.mint(await contest.getAddress(), ENTRY_AMOUNT * BigInt(participants.length));

  await network.provider.send("evm_setNextBlockTimestamp", [Number(registeringEnds) + 1]);
  await contest.syncState();

  await network.provider.send("evm_setNextBlockTimestamp", [Number(liveEnds) + 5]);
  await network.provider.send("evm_mine", []);

  const output = {
    contest: await contest.getAddress(),
    priceSource: await priceSource.getAddress(),
    entryAsset: await usdc.getAddress(),
    quoteAsset: await weth.getAddress(),
    entryAmount: ENTRY_AMOUNT.toString(),
    payouts: payoutSchedule.slice(0, 8),
    timelines: {
      registeringEnds: registeringEnds.toString(),
      liveEnds: liveEnds.toString(),
      claimEnds: claimEnds.toString(),
    },
    operator: {
      address: deployer.address,
      privateKey: (deployer as unknown as { privateKey: string }).privateKey,
    },
    participants: [alice, bob, carol].map((signer, idx) => ({
      address: signer.address,
      privateKey: (signer as unknown as { privateKey: string }).privateKey,
      bonus: bonuses[idx]!.toString(),
    })),
    vaults,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
