import { ethers, network } from "hardhat";

type GasLog = {
  label: string;
  gasUsed: bigint;
};

const ENTRY_AMOUNT = 1_000_000n;
const BONUS_ALICE = 500_000n;
const BONUS_BOB = 200_000n;

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

  const now = Math.floor(Date.now() / 1000);
  const registeringEnds = BigInt(now + 600);
  const liveEnds = registeringEnds + 3_600n;
  const claimEnds = liveEnds + 7_200n;
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

  await network.provider.send("evm_setNextBlockTimestamp", [Number(liveEnds) + 5]);
  await network.provider.send("evm_mine", []);

  return {
    contest,
    usdc,
    participants,
    vaults,
    operator: deployer,
  };
}

async function main() {
  const { contest, participants, vaults, operator } = await deployScenario();
  const [alice, bob, carol] = participants;
  const gasReport: GasLog[] = [];

  const freezeReceipt = await (await contest.connect(operator).freeze()).wait();
  gasReport.push({ label: "freeze()", gasUsed: freezeReceipt!.gasUsed! });

  const settleAlice = await (await contest.connect(operator).settle(alice.address)).wait();
  gasReport.push({ label: "settle(alice)", gasUsed: settleAlice!.gasUsed! });
  const settleBob = await (await contest.connect(operator).settle(bob.address)).wait();
  gasReport.push({ label: "settle(bob)", gasUsed: settleBob!.gasUsed! });
  const settleCarol = await (await contest.connect(operator).settle(carol.address)).wait();
  gasReport.push({ label: "settle(carol)", gasUsed: settleCarol!.gasUsed! });

  const aliceVaultId = await contest.participantVaults(alice.address);
  const bobVaultId = await contest.participantVaults(bob.address);

  const updateReceipt = await (
    await contest.connect(operator).updateLeaders([
      {
        vaultId: aliceVaultId,
        nav: ENTRY_AMOUNT + BONUS_ALICE,
        roiBps: 5_000,
      },
      {
        vaultId: bobVaultId,
        nav: ENTRY_AMOUNT + BONUS_BOB,
        roiBps: 2_000,
      },
    ])
  ).wait();
  gasReport.push({ label: "updateLeaders(2)", gasUsed: updateReceipt!.gasUsed! });

  const sealReceipt = await (await contest.connect(operator).seal()).wait();
  gasReport.push({ label: "seal()", gasUsed: sealReceipt!.gasUsed! });

  const claimReceipt = await (await contest.connect(alice).claim()).wait();
  gasReport.push({ label: "claim(winner)", gasUsed: claimReceipt!.gasUsed! });

  const exitReceipt = await (await contest.connect(carol).exit()).wait();
  gasReport.push({ label: "exit(loser)", gasUsed: exitReceipt!.gasUsed! });

  console.log("Gas Usage Summary (wei):");
  gasReport.forEach((entry) => {
    console.log(`${entry.label.padEnd(22)} ${entry.gasUsed.toString()}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
