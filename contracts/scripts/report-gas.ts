import { ethers, network } from "hardhat";

type GasLog = {
  label: string;
  gasUsed: bigint;
};

const ENTRY_AMOUNT = 1_000_000n;
const BONUS_ALICE = 500_000n;
const BONUS_BOB = 200_000n;
const REGISTER_DURATION = 600n;
const LIVE_DURATION = 3_600n;
const CLAIM_DURATION = 7_200n;

const USDC_UNIT = 10n ** 6n;
const WETH_UNIT = 10n ** 18n;
const POOL_USDC_LIQUIDITY = 5_000_000n * USDC_UNIT;
const POOL_WETH_LIQUIDITY = 3_000n * WETH_UNIT;

function pushGas(logs: GasLog[], label: string, receipt: { gasUsed?: bigint } | null | undefined) {
  const gas = receipt?.gasUsed;
  if (!gas) {
    throw new Error(`无法获取 ${label} 的 gas 消耗`);
  }
  logs.push({ label, gasUsed: gas });
}

async function deployScenario() {
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

  const now = BigInt(Math.floor(Date.now() / 1000));
  const registeringEnds = now + REGISTER_DURATION;
  const liveEnds = registeringEnds + LIVE_DURATION;
  const claimEnds = liveEnds + CLAIM_DURATION;
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
  } as unknown as Parameters<typeof contest.initialize>[0]);

  await usdc.mint(await pool.getAddress(), POOL_USDC_LIQUIDITY);
  await weth.mint(await pool.getAddress(), POOL_WETH_LIQUIDITY);

  const participants = [alice, bob, carol];
  const bonuses = [BONUS_ALICE, BONUS_BOB, 0n];
  const vaults: string[] = [];

  for (const [index, signer] of participants.entries()) {
    await usdc.mint(signer.address, ENTRY_AMOUNT);
    await usdc.connect(signer).approve(await contest.getAddress(), ENTRY_AMOUNT);
    const predicted = await factory.predictVaultAddress(signer.address);
    await contest.connect(signer).register();
    vaults.push(predicted);
    if (bonuses[index]! > 0n) {
      await usdc.mint(predicted, bonuses[index]!);
    }
  }

  await usdc.mint(await contest.getAddress(), ENTRY_AMOUNT * BigInt(participants.length));

  return {
    contest,
    usdc,
    weth,
    pool,
    priceSource,
    participants,
    vaults,
    operator: deployer,
    registeringEnds,
    liveEnds,
    claimEnds,
  };
}

async function main() {
  const {
    contest,
    priceSource,
    participants,
    vaults,
    operator,
    registeringEnds,
    liveEnds,
  } = await deployScenario();
  const [alice, bob, carol] = participants;
  const gasReport: GasLog[] = [];

  await network.provider.send("evm_setNextBlockTimestamp", [Number(registeringEnds) + 1]);
  await network.provider.send("evm_mine", []);
  await (await contest.connect(operator).syncState()).wait();
  await (await priceSource.update()).wait();

  const aliceVault = await ethers.getContractAt("Vault", vaults[0]!);
  const swapReceipt = await (
    await aliceVault
      .connect(alice)
      .swapExact(ENTRY_AMOUNT / 2n, 0, true, Number(liveEnds - 60n))
  ).wait();
  pushGas(gasReport, "Vault.swapExact()", swapReceipt);

  await network.provider.send("evm_setNextBlockTimestamp", [Number(liveEnds) + 5]);
  await network.provider.send("evm_mine", []);

  const freezeReceipt = await (await contest.connect(operator).freeze()).wait();
  pushGas(gasReport, "Contest.freeze()", freezeReceipt);

  const settleAlice = await (await contest.connect(operator).settle(alice.address)).wait();
  pushGas(gasReport, "Contest.settle(alice)", settleAlice);
  const settleBob = await (await contest.connect(operator).settle(bob.address)).wait();
  pushGas(gasReport, "Contest.settle(bob)", settleBob);
  const settleCarol = await (await contest.connect(operator).settle(carol.address)).wait();
  pushGas(gasReport, "Contest.settle(carol)", settleCarol);

  const aliceVaultId = await contest.participantVaults(alice.address);
  const bobVaultId = await contest.participantVaults(bob.address);
  const carolVaultId = await contest.participantVaults(carol.address);

  const aliceNav = await contest.vaultNavs(aliceVaultId);
  const bobNav = await contest.vaultNavs(bobVaultId);
  const carolNav = await contest.vaultNavs(carolVaultId);
  const aliceRoi = await contest.vaultRoiBps(aliceVaultId);
  const bobRoi = await contest.vaultRoiBps(bobVaultId);
  const carolRoi = await contest.vaultRoiBps(carolVaultId);

  const config = await contest.getConfig();
  const topK = Number(config.topK);
  const leaderCandidates = [
    { vaultId: aliceVaultId, nav: aliceNav, roiBps: aliceRoi },
    { vaultId: bobVaultId, nav: bobNav, roiBps: bobRoi },
    { vaultId: carolVaultId, nav: carolNav, roiBps: carolRoi },
  ];

  leaderCandidates.sort((a, b) => {
    if (a.nav === b.nav) {
      return 0;
    }
    return a.nav > b.nav ? -1 : 1;
  });

  const updatePayload = leaderCandidates.slice(0, topK).map((entry) => ({
    vaultId: entry.vaultId,
    nav: entry.nav,
    roiBps: entry.roiBps,
  }));

  const updateReceipt = await (
    await contest.connect(operator).updateLeaders(updatePayload)
  ).wait();
  pushGas(gasReport, "Contest.updateLeaders(2)", updateReceipt);

  const sealReceipt = await (await contest.connect(operator).seal()).wait();
  pushGas(gasReport, "Contest.seal()", sealReceipt);

  const claimReceipt = await (await contest.connect(alice).claim()).wait();
  pushGas(gasReport, "Contest.claim(winner)", claimReceipt);

  const exitReceipt = await (await contest.connect(carol).exit()).wait();
  pushGas(gasReport, "Contest.exit(loser)", exitReceipt);

  console.log("Gas Usage Summary (wei):");
  gasReport.forEach((entry) => {
    console.log(`${entry.label.padEnd(28)} ${entry.gasUsed.toString()}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
